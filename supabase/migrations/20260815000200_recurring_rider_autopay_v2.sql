-- Explicitly authorized, idempotent off-session payment for recurring Rider occurrences.

create table public.rider_saved_payment_methods (
  rider_saved_payment_method_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  rider_profile_id uuid not null,
  provider text not null default 'stripe',
  provider_customer_id text not null,
  provider_payment_method_id text not null,
  status text not null default 'active',
  brand text,
  last4 text,
  expires_month smallint,
  expires_year smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rider_saved_payment_methods_rider_fk foreign key (tenant_id, rider_profile_id)
    references public.rider_profiles (tenant_id, rider_profile_id) on delete restrict,
  constraint rider_saved_payment_methods_status_check check (status in ('active', 'disabled')),
  constraint rider_saved_payment_methods_last4_check check (last4 is null or last4 ~ '^[0-9]{4}$'),
  constraint rider_saved_payment_methods_provider_unique unique (provider, provider_payment_method_id),
  constraint rider_saved_payment_methods_rider_unique unique (tenant_id, rider_profile_id)
);

alter table public.rider_booking_series
  add column autopay_enabled boolean not null default false,
  add column rider_saved_payment_method_id uuid references public.rider_saved_payment_methods
    (rider_saved_payment_method_id) on delete restrict,
  add column autopay_lead_hours integer not null default 48,
  add constraint rider_booking_series_autopay_lead_check check (autopay_lead_hours between 24 and 168),
  add constraint rider_booking_series_autopay_method_check check (
    (not autopay_enabled) or rider_saved_payment_method_id is not null
  );

alter table public.rider_booking_series_occurrences
  add column autopay_status text not null default 'not_requested',
  add column autopay_attempt_count integer not null default 0,
  add column autopay_last_attempt_at timestamptz,
  add column autopay_next_retry_at timestamptz,
  add column autopay_failure_message text,
  add constraint rider_series_occurrence_autopay_status_check check (
    autopay_status in ('not_requested', 'queued', 'processing', 'succeeded', 'retryable', 'failed')
  ),
  add constraint rider_series_occurrence_autopay_attempt_check check (autopay_attempt_count between 0 and 3);

create index rider_series_occurrences_autopay_due_idx
  on public.rider_booking_series_occurrences (scheduled_pickup_at, autopay_next_retry_at)
  where status = 'awaiting_payment' and autopay_status in ('not_requested', 'queued', 'retryable');

alter table public.rider_saved_payment_methods enable row level security;
grant all on public.rider_saved_payment_methods to service_role;

create or replace function public.prevent_processing_autopay_cancellation()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.autopay_status = 'processing' and new.status = 'cancelled' then
    raise exception 'Automatic payment is processing; refresh before cancelling this trip';
  end if;
  return new;
end;
$$;
create trigger rider_series_occurrences_protect_autopay
before update of status on public.rider_booking_series_occurrences for each row
execute function public.prevent_processing_autopay_cancellation();

alter table public.notification_outbox drop constraint notification_outbox_type_check;
alter table public.notification_outbox add constraint notification_outbox_type_check check (
  notification_type in (
    'driver_account_ready', 'driver_evidence_approved', 'driver_evidence_rejected',
    'driver_evidence_expiring_30d', 'driver_evidence_expiring_7d', 'driver_evidence_expired',
    'driver_activated', 'vehicle_evidence_approved', 'vehicle_evidence_rejected',
    'vehicle_evidence_expiring_30d', 'vehicle_evidence_expiring_7d', 'vehicle_evidence_expired',
    'dispatch_offer_created', 'rider_booking_created', 'rider_dispatch_searching',
    'rider_driver_accepted', 'rider_driver_arrived', 'rider_trip_started',
    'rider_trip_completed', 'rider_booking_cancelled', 'rider_booking_scheduled',
    'rider_scheduled_reminder', 'rider_scheduled_dispatch_started',
    'rider_payment_succeeded', 'rider_refund_succeeded', 'rider_recurring_autopay_succeeded',
    'rider_recurring_autopay_failed', 'driver_earnings_recorded', 'driver_transfer_succeeded',
    'driver_bank_payout_created', 'driver_bank_payout_paid', 'driver_bank_payout_failed'
  )
);

create or replace function public.record_rider_saved_payment_method_internal(
  target_quote_id uuid, provider_customer_id_value text, provider_payment_method_id_value text,
  brand_value text default null, last4_value text default null,
  expires_month_value integer default null, expires_year_value integer default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare quote public.trip_price_quotes; saved_id uuid;
begin
  select * into quote from public.trip_price_quotes where quote_id = target_quote_id;
  if quote.quote_id is null or nullif(btrim(provider_customer_id_value), '') is null
    or nullif(btrim(provider_payment_method_id_value), '') is null then
    raise exception 'payment method context is required';
  end if;
  insert into public.rider_saved_payment_methods
    (tenant_id, rider_profile_id, provider_customer_id, provider_payment_method_id,
     brand, last4, expires_month, expires_year)
  values (quote.tenant_id, quote.rider_profile_id, btrim(provider_customer_id_value),
    btrim(provider_payment_method_id_value), nullif(btrim(brand_value), ''),
    nullif(btrim(last4_value), ''), expires_month_value, expires_year_value)
  on conflict (tenant_id, rider_profile_id) do update set
    provider_customer_id = excluded.provider_customer_id,
    provider_payment_method_id = excluded.provider_payment_method_id,
    status = 'active', brand = excluded.brand, last4 = excluded.last4,
    expires_month = excluded.expires_month, expires_year = excluded.expires_year, updated_at = now()
  returning rider_saved_payment_method_id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.set_my_rider_booking_series_autopay(
  target_series_id uuid, enabled_value boolean
)
returns boolean language plpgsql security definer set search_path = public as $$
declare series public.rider_booking_series; method_id uuid; actor_id uuid;
begin
  select * into series from public.rider_booking_series where rider_booking_series_id = target_series_id for update;
  if series.rider_booking_series_id is null
    or series.rider_profile_id <> public.current_rider_profile_id(series.tenant_id) then
    raise exception 'Recurring schedule access is required';
  end if;
  if enabled_value and series.status <> 'active' then raise exception 'Only an active schedule can use autopay'; end if;
  if enabled_value then
    select rider_saved_payment_method_id into method_id from public.rider_saved_payment_methods
    where tenant_id = series.tenant_id and rider_profile_id = series.rider_profile_id and status = 'active';
    if method_id is null then raise exception 'Complete one card payment before enabling autopay'; end if;
  end if;
  update public.rider_booking_series set autopay_enabled = enabled_value,
    rider_saved_payment_method_id = case when enabled_value then method_id else null end, updated_at = now()
  where rider_booking_series_id = target_series_id;
  select person_id into actor_id from public.rider_profiles where rider_profile_id = series.rider_profile_id;
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_person_id,
    actor_platform_roles, reason, correlation_id, resource_type, resource_id, metadata)
  values (series.tenant_id, 'rider.booking_series_autopay_updated', 'person', actor_id, '{}',
    'Rider changed recurring schedule autopay.', gen_random_uuid(), 'rider_booking_series',
    series.rider_booking_series_id::text, jsonb_build_object('enabled', enabled_value));
  return enabled_value;
end;
$$;

create or replace function public.claim_due_recurring_autopay_internal(target_limit integer default 10)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  with due as (
    select occurrence.rider_booking_series_occurrence_id
    from public.rider_booking_series_occurrences occurrence
    join public.rider_booking_series series using (tenant_id, rider_booking_series_id)
    join public.tenant_scheduling_settings settings using (tenant_id)
    where series.status = 'active' and series.autopay_enabled
      and occurrence.status = 'awaiting_payment'
      and occurrence.autopay_status in ('not_requested', 'queued', 'retryable')
      and coalesce(occurrence.autopay_next_retry_at, '-infinity') <= now()
      and occurrence.scheduled_pickup_at <= now() + make_interval(hours => series.autopay_lead_hours)
      and occurrence.scheduled_pickup_at >= now() + make_interval(mins => settings.minimum_notice_minutes)
    order by occurrence.scheduled_pickup_at for update of occurrence skip locked limit least(greatest(target_limit, 1), 25)
  ), claimed as (
    update public.rider_booking_series_occurrences occurrence set autopay_status = 'processing',
      autopay_attempt_count = occurrence.autopay_attempt_count + 1, autopay_last_attempt_at = now(),
      autopay_next_retry_at = null, autopay_failure_message = null, updated_at = now()
    from due where occurrence.rider_booking_series_occurrence_id = due.rider_booking_series_occurrence_id
    returning occurrence.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'occurrenceId', claimed.rider_booking_series_occurrence_id,
    'seriesId', series.rider_booking_series_id, 'tenantId', claimed.tenant_id,
    'riderProfileId', claimed.rider_profile_id, 'serviceAreaId', series.service_area_id,
    'scheduledPickupAt', claimed.scheduled_pickup_at, 'attemptCount', claimed.autopay_attempt_count,
    'pickupAddress', series.pickup_address, 'destinationAddress', series.destination_address,
    'pickupLatitude', series.pickup_latitude, 'pickupLongitude', series.pickup_longitude,
    'destinationLatitude', series.destination_latitude, 'destinationLongitude', series.destination_longitude,
    'bookingNotes', series.booking_notes, 'paymentMethodId', method.provider_payment_method_id,
    'customerId', method.provider_customer_id)), '[]'::jsonb) into result
  from claimed join public.rider_booking_series series
    on series.rider_booking_series_id = claimed.rider_booking_series_id
  join public.rider_saved_payment_methods method
    on method.rider_saved_payment_method_id = series.rider_saved_payment_method_id and method.status = 'active';
  return result;
end;
$$;

create or replace function public.register_rider_offsession_attempt_internal(
  target_quote_id uuid, provider_payment_intent_id_value text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare quote public.trip_price_quotes; allocation_minor bigint := 0; attempt_id uuid; card_minor bigint;
begin
  select * into quote from public.trip_price_quotes where quote_id = target_quote_id for update;
  if quote.quote_id is null or quote.status <> 'quoted' or quote.expires_at <= now() then raise exception 'active quote is required'; end if;
  select amount_minor into allocation_minor from public.rider_wallet_quote_allocations
    where quote_id = quote.quote_id and status = 'reserved';
  card_minor := quote.fare_amount_minor - coalesce(allocation_minor, 0);
  if card_minor <= 0 then raise exception 'off-session card payment is not required'; end if;
  insert into public.rider_payment_attempts (tenant_id, rider_profile_id, quote_id,
    provider_checkout_session_id, provider_payment_intent_id, status, currency_code, amount_minor)
  values (quote.tenant_id, quote.rider_profile_id, quote.quote_id, 'off_session:' || quote.quote_id::text,
    provider_payment_intent_id_value, 'pending', quote.currency_code, card_minor)
  on conflict (quote_id) do update set provider_payment_intent_id = excluded.provider_payment_intent_id,
    updated_at = now() returning payment_attempt_id into attempt_id;
  return attempt_id;
end;
$$;

create or replace function public.finalize_recurring_autopay_internal(
  target_occurrence_id uuid, target_quote_id uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare occurrence public.rider_booking_series_occurrences; series public.rider_booking_series;
  quote public.trip_price_quotes; settings public.tenant_scheduling_settings; rider public.rider_profiles;
  attempt public.rider_payment_attempts; allocation public.rider_wallet_quote_allocations;
  booking_id_value uuid; wallet_id uuid; prepayment_id uuid; transaction_id_value uuid;
begin
  select * into occurrence from public.rider_booking_series_occurrences
    where rider_booking_series_occurrence_id = target_occurrence_id for update;
  if occurrence.status = 'booked' then return occurrence.booking_id; end if;
  if occurrence.status <> 'awaiting_payment' or occurrence.autopay_status <> 'processing' then raise exception 'autopay occurrence is unavailable'; end if;
  select * into series from public.rider_booking_series where rider_booking_series_id = occurrence.rider_booking_series_id;
  select * into quote from public.trip_price_quotes where quote_id = target_quote_id for update;
  select * into settings from public.tenant_scheduling_settings where tenant_id = occurrence.tenant_id;
  select * into rider from public.rider_profiles where rider_profile_id = occurrence.rider_profile_id;
  select * into attempt from public.rider_payment_attempts where quote_id = quote.quote_id and status = 'paid';
  select * into allocation from public.rider_wallet_quote_allocations where quote_id = quote.quote_id and status = 'reserved';
  if series.status <> 'active' or quote.rider_profile_id <> rider.rider_profile_id
    or quote.service_area_id <> series.service_area_id
    or coalesce(attempt.amount_minor, 0) + coalesce(allocation.amount_minor, 0) <> quote.fare_amount_minor
    then raise exception 'verified recurring payment is required'; end if;
  insert into public.dispatch_bookings (tenant_id, service_area_id, rider_profile_id, customer_name,
    customer_phone, pickup_address, destination_address, booking_notes, created_by_person_id, status,
    scheduled_pickup_at, dispatch_ready_at, pickup_latitude, pickup_longitude, destination_latitude,
    destination_longitude, geocoding_provider, geocoded_at, price_quote_id, fare_currency_code,
    estimated_fare_minor, final_fare_minor, route_distance_meters, route_duration_seconds)
  values (series.tenant_id, series.service_area_id, rider.rider_profile_id, rider.display_name, rider.phone,
    series.pickup_address, series.destination_address, series.booking_notes, rider.person_id, 'scheduled',
    occurrence.scheduled_pickup_at, occurrence.scheduled_pickup_at - make_interval(mins => settings.dispatch_lead_minutes),
    series.pickup_latitude, series.pickup_longitude, series.destination_latitude,
    series.destination_longitude, 'mapbox-v6', now(), quote.quote_id, quote.currency_code,
    quote.fare_amount_minor, quote.fare_amount_minor, quote.route_distance_meters, quote.route_duration_seconds)
  returning booking_id into booking_id_value;
  update public.trip_price_quotes set status = 'booked', booking_id = booking_id_value where quote_id = quote.quote_id;
  if attempt.payment_attempt_id is not null then update public.rider_payment_attempts set booking_id = booking_id_value, updated_at = now() where payment_attempt_id = attempt.payment_attempt_id; end if;
  if allocation.rider_wallet_quote_allocation_id is not null then
    update public.rider_wallet_quote_allocations set status = 'applied', booking_id = booking_id_value, applied_at = now(), updated_at = now()
      where rider_wallet_quote_allocation_id = allocation.rider_wallet_quote_allocation_id;
    insert into public.rider_wallet_entries (tenant_id, rider_profile_id, direction, entry_type,
      currency_code, amount_minor, description, booking_id, quote_id, external_key, created_by_person_id)
    values (series.tenant_id, rider.rider_profile_id, 'debit', 'booking_applied', allocation.currency_code,
      allocation.amount_minor, 'Trip credit applied to recurring booking', booking_id_value, quote.quote_id,
      'booking_applied:' || booking_id_value::text, rider.person_id);
    select account_id into wallet_id from public.ledger_accounts where tenant_id = series.tenant_id and account_code = 'rider_wallet_credits';
    select account_id into prepayment_id from public.ledger_accounts where tenant_id = series.tenant_id and account_code = 'rider_prepayments';
    insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint, description,
      effective_at, booking_id, created_by_person_id)
    values (series.tenant_id, 'wallet_booking:' || booking_id_value::text,
      md5(jsonb_build_object('bookingId', booking_id_value, 'amountMinor', allocation.amount_minor)::text),
      'Rider trip credit applied', now(), booking_id_value, rider.person_id)
    returning transaction_id into transaction_id_value;
    set constraints ledger_entries_balanced deferred;
    insert into public.ledger_entries (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
    values (series.tenant_id, transaction_id_value, wallet_id, 1, allocation.amount_minor, 0),
      (series.tenant_id, transaction_id_value, prepayment_id, 2, 0, allocation.amount_minor);
    set constraints ledger_entries_balanced immediate;
  end if;
  update public.rider_booking_series_occurrences set status = 'booked', autopay_status = 'succeeded',
    quote_id = quote.quote_id, booking_id = booking_id_value, updated_at = now()
  where rider_booking_series_occurrence_id = occurrence.rider_booking_series_occurrence_id;
  if not exists (select 1 from public.rider_booking_series_occurrences
    where rider_booking_series_id = series.rider_booking_series_id
      and status in ('awaiting_payment', 'payment_pending')) then
    update public.rider_booking_series set status = 'completed', updated_at = now()
      where rider_booking_series_id = series.rider_booking_series_id;
  end if;
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_platform_roles,
    reason, correlation_id, resource_type, resource_id, metadata)
  values (series.tenant_id, 'rider.recurring_autopay_succeeded', 'platform_system', '{}',
    'Authorized recurring payment created a scheduled trip.', gen_random_uuid(),
    'rider_booking_series_occurrence', occurrence.rider_booking_series_occurrence_id::text,
    jsonb_build_object('booking_id', booking_id_value, 'quote_id', quote.quote_id));
  return booking_id_value;
end;
$$;

create or replace function public.fail_recurring_autopay_internal(
  target_occurrence_id uuid, failure_message_value text, retryable_value boolean
)
returns boolean language plpgsql security definer set search_path = public as $$
declare occurrence public.rider_booking_series_occurrences; rider public.rider_profiles; series public.rider_booking_series;
  final_failure boolean;
begin
  select * into occurrence from public.rider_booking_series_occurrences
    where rider_booking_series_occurrence_id = target_occurrence_id for update;
  if occurrence.rider_booking_series_occurrence_id is null or occurrence.status <> 'awaiting_payment' then return false; end if;
  final_failure := not retryable_value or occurrence.autopay_attempt_count >= 3
    or occurrence.scheduled_pickup_at < now() + interval '12 hours';
  update public.rider_booking_series_occurrences set
    autopay_status = case when final_failure then 'failed' else 'retryable' end,
    autopay_next_retry_at = case when final_failure then null else now() + interval '6 hours' end,
    autopay_failure_message = left(coalesce(failure_message_value, 'Automatic payment failed.'), 300), updated_at = now()
  where rider_booking_series_occurrence_id = target_occurrence_id;
  select * into series from public.rider_booking_series where rider_booking_series_id = occurrence.rider_booking_series_id;
  select * into rider from public.rider_profiles where rider_profile_id = occurrence.rider_profile_id;
  if coalesce((select payment_updates_enabled from public.rider_notification_preferences
    where rider_profile_id = rider.rider_profile_id), true) then
    insert into public.notification_outbox (tenant_id, rider_profile_id, person_id, notification_type,
      recipient_email, payload, dedupe_key)
    values (occurrence.tenant_id, rider.rider_profile_id, rider.person_id, 'rider_recurring_autopay_failed',
      rider.email, jsonb_build_object('rider_name', rider.display_name,
        'tenant_slug', (select tenant_slug from public.tenant_configurations where tenant_id = occurrence.tenant_id),
        'pickup_address', series.pickup_address, 'destination_address', series.destination_address,
        'scheduled_pickup_at', occurrence.scheduled_pickup_at, 'tenant_time_zone', series.time_zone,
        'retryable', not final_failure),
      'rider_recurring_autopay:' || occurrence.rider_booking_series_occurrence_id::text || ':failed:' || occurrence.autopay_attempt_count)
    on conflict (dedupe_key) do nothing;
  end if;
  return true;
end;
$$;

create or replace function public.my_rider_booking_series(target_tenant_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare target_tenant_id uuid; rider_id uuid;
begin
  select tenant_id into target_tenant_id from public.tenant_configurations where tenant_slug = lower(btrim(target_tenant_slug));
  rider_id := public.current_rider_profile_id(target_tenant_id);
  if rider_id is null then raise exception 'Rider access is required'; end if;
  return jsonb_build_object(
    'savedPaymentMethod', (select jsonb_build_object('brand', method.brand, 'last4', method.last4,
      'expiresMonth', method.expires_month, 'expiresYear', method.expires_year)
      from public.rider_saved_payment_methods method where method.tenant_id = target_tenant_id
        and method.rider_profile_id = rider_id and method.status = 'active'),
    'series', coalesce((select jsonb_agg(jsonb_build_object('seriesId', series.rider_booking_series_id,
      'serviceAreaId', series.service_area_id, 'pickupAddress', series.pickup_address,
      'destinationAddress', series.destination_address, 'timeZone', series.time_zone,
      'localPickupTime', series.local_pickup_time, 'weekdays', series.weekdays,
      'startDate', series.start_date, 'endDate', series.end_date, 'status', series.status,
      'autopayEnabled', series.autopay_enabled, 'createdAt', series.created_at) order by series.created_at desc)
      from public.rider_booking_series series where series.tenant_id = target_tenant_id
        and series.rider_profile_id = rider_id), '[]'::jsonb),
    'occurrences', coalesce((select jsonb_agg(jsonb_build_object(
      'occurrenceId', occurrence.rider_booking_series_occurrence_id,
      'seriesId', occurrence.rider_booking_series_id, 'scheduledPickupAt', occurrence.scheduled_pickup_at,
      'status', occurrence.status, 'autopayStatus', occurrence.autopay_status,
      'autopayFailureMessage', occurrence.autopay_failure_message,
      'quoteId', occurrence.quote_id, 'bookingId', occurrence.booking_id) order by occurrence.scheduled_pickup_at)
      from public.rider_booking_series_occurrences occurrence where occurrence.tenant_id = target_tenant_id
        and occurrence.rider_profile_id = rider_id), '[]'::jsonb));
end;
$$;

revoke all on function public.record_rider_saved_payment_method_internal(uuid, text, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.prevent_processing_autopay_cancellation() from public, anon, authenticated;
revoke all on function public.set_my_rider_booking_series_autopay(uuid, boolean) from public, anon, authenticated;
revoke all on function public.claim_due_recurring_autopay_internal(integer) from public, anon, authenticated;
revoke all on function public.register_rider_offsession_attempt_internal(uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_recurring_autopay_internal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_recurring_autopay_internal(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.set_my_rider_booking_series_autopay(uuid, boolean) to authenticated;
grant execute on function public.record_rider_saved_payment_method_internal(uuid, text, text, text, text, integer, integer) to service_role;
grant execute on function public.claim_due_recurring_autopay_internal(integer) to service_role;
grant execute on function public.register_rider_offsession_attempt_internal(uuid, text) to service_role;
grant execute on function public.finalize_recurring_autopay_internal(uuid, uuid) to service_role;
grant execute on function public.fail_recurring_autopay_internal(uuid, text, boolean) to service_role;
