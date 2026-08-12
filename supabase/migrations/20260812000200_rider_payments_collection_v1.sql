-- Stripe Checkout collection for locked Rider fares and balanced prepayment settlement.

alter table public.ledger_accounts drop constraint ledger_accounts_driver_scope_check;
alter table public.ledger_accounts add constraint ledger_accounts_driver_scope_check check (
  (account_code = 'driver_payables' and driver_profile_id is null)
  or (account_code like 'driver_payable_%' and driver_profile_id is not null and account_type = 'liability')
  or (account_code <> 'driver_payables' and account_code not like 'driver_payable_%' and driver_profile_id is null)
);

insert into public.ledger_accounts
  (tenant_id, account_code, account_name, account_type, normal_balance, currency_code, created_by_person_id)
select setting.tenant_id, 'rider_prepayments', 'Rider prepayments', 'liability', 'credit',
  setting.operating_currency, setting.created_by_person_id
from public.tenant_financial_settings setting
on conflict (tenant_id, account_code) do nothing;

create table public.rider_payment_attempts (
  payment_attempt_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  rider_profile_id uuid not null,
  quote_id uuid not null,
  booking_id uuid,
  provider text not null default 'stripe',
  provider_checkout_session_id text not null,
  provider_payment_intent_id text,
  status text not null default 'pending',
  currency_code text not null references public.currency_codes (currency_code) on delete restrict,
  amount_minor bigint not null,
  failure_message text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rider_payment_attempts_rider_fk foreign key (tenant_id, rider_profile_id)
    references public.rider_profiles (tenant_id, rider_profile_id) on delete restrict,
  constraint rider_payment_attempts_quote_fk foreign key (tenant_id, quote_id)
    references public.trip_price_quotes (tenant_id, quote_id) on delete restrict,
  constraint rider_payment_attempts_booking_fk foreign key (tenant_id, booking_id)
    references public.dispatch_bookings (tenant_id, booking_id) on delete restrict,
  constraint rider_payment_attempts_status_check check (status in ('pending', 'paid', 'failed', 'expired', 'refunded')),
  constraint rider_payment_attempts_amount_check check (amount_minor > 0),
  constraint rider_payment_attempts_checkout_unique unique (provider, provider_checkout_session_id),
  constraint rider_payment_attempts_quote_unique unique (quote_id)
);

create index rider_payment_attempts_rider_created_idx
  on public.rider_payment_attempts (rider_profile_id, created_at desc);

alter table public.rider_payment_attempts enable row level security;
create policy rider_payment_attempts_rider_select on public.rider_payment_attempts
  for select to authenticated using (rider_profile_id = public.current_rider_profile_id(tenant_id));
create policy rider_payment_attempts_manager_select on public.rider_payment_attempts
  for select to authenticated using (public.can_manage_ledger(tenant_id));
grant select on public.rider_payment_attempts to authenticated;
grant all on public.rider_payment_attempts to service_role;

create or replace function public.register_rider_checkout_internal(
  target_quote_id uuid, checkout_session_id_value text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare quote public.trip_price_quotes; attempt_id uuid;
begin
  select * into quote from public.trip_price_quotes where quote_id = target_quote_id;
  if quote.quote_id is null or quote.status <> 'quoted' or quote.expires_at <= now()
    then raise exception 'active price quote is required'; end if;
  select payment_attempt_id into attempt_id from public.rider_payment_attempts where quote_id = quote.quote_id;
  if attempt_id is not null then return attempt_id; end if;
  insert into public.rider_payment_attempts
    (tenant_id, rider_profile_id, quote_id, provider_checkout_session_id, currency_code, amount_minor)
  values (quote.tenant_id, quote.rider_profile_id, quote.quote_id, checkout_session_id_value,
    quote.currency_code, quote.fare_amount_minor)
  returning payment_attempt_id into attempt_id;
  return attempt_id;
end;
$$;

create or replace function public.record_rider_payment_internal(
  checkout_session_id_value text, payment_intent_id_value text, payment_status_value text,
  amount_minor_value bigint, currency_code_value text, failure_message_value text default null
)
returns boolean language plpgsql security definer set search_path = public as $$
declare attempt public.rider_payment_attempts; cash_id uuid; prepayment_id uuid;
  transaction_id_value uuid; actor_id uuid;
begin
  select * into attempt from public.rider_payment_attempts
    where provider = 'stripe' and provider_checkout_session_id = checkout_session_id_value for update;
  if attempt.payment_attempt_id is null then raise exception 'payment attempt is unavailable'; end if;
  if amount_minor_value <> attempt.amount_minor or upper(currency_code_value) <> attempt.currency_code
    then raise exception 'payment amount or currency does not match the locked quote'; end if;
  if payment_status_value not in ('paid', 'failed', 'expired') then raise exception 'unsupported payment status'; end if;
  if attempt.status = 'paid' then return true; end if;
  update public.rider_payment_attempts set status = payment_status_value,
    provider_payment_intent_id = coalesce(payment_intent_id_value, provider_payment_intent_id),
    failure_message = left(failure_message_value, 500),
    paid_at = case when payment_status_value = 'paid' then now() else paid_at end, updated_at = now()
  where payment_attempt_id = attempt.payment_attempt_id;
  if payment_status_value = 'paid' then
    select account_id into cash_id from public.ledger_accounts
      where tenant_id = attempt.tenant_id and account_code = 'cash_clearing';
    select account_id into prepayment_id from public.ledger_accounts
      where tenant_id = attempt.tenant_id and account_code = 'rider_prepayments';
    select person_id into actor_id from public.rider_profiles where rider_profile_id = attempt.rider_profile_id;
    insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint, description,
      effective_at, created_by_person_id)
    values (attempt.tenant_id, 'payment_collection:' || attempt.payment_attempt_id::text,
      md5(jsonb_build_object('attemptId', attempt.payment_attempt_id, 'amountMinor', attempt.amount_minor,
        'currency', attempt.currency_code)::text), 'Rider payment collected', now(), actor_id)
    on conflict (tenant_id, external_key) do nothing returning transaction_id into transaction_id_value;
    if transaction_id_value is not null then
      set constraints ledger_entries_balanced deferred;
      insert into public.ledger_entries
        (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
      values (attempt.tenant_id, transaction_id_value, cash_id, 1, attempt.amount_minor, 0),
        (attempt.tenant_id, transaction_id_value, prepayment_id, 2, 0, attempt.amount_minor);
      set constraints ledger_entries_balanced immediate;
    end if;
  end if;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (attempt.tenant_id, 'payment.' || payment_status_value, 'platform_system', null, '{}',
    'Stripe payment status recorded from a verified server event.', gen_random_uuid(),
    'rider_payment_attempt', attempt.payment_attempt_id::text,
    jsonb_build_object('quote_id', attempt.quote_id, 'amount_minor', attempt.amount_minor,
      'currency_code', attempt.currency_code));
  return true;
end;
$$;

create or replace function public.create_my_rider_priced_booking(
  target_quote_id uuid, booking_notes_value text default null,
  scheduled_pickup_at_value timestamptz default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare quote public.trip_price_quotes; rider_id uuid; target_tenant_slug text; new_booking_id uuid;
  attempt_id uuid;
begin
  select * into quote from public.trip_price_quotes where quote_id = target_quote_id for update;
  if quote.quote_id is null or quote.status <> 'quoted'
    then raise exception 'price quote is unavailable'; end if;
  rider_id := public.current_rider_profile_id(quote.tenant_id);
  if rider_id is null or rider_id <> quote.rider_profile_id then raise exception 'Rider quote access is required'; end if;
  select payment_attempt_id into attempt_id from public.rider_payment_attempts
    where quote_id = quote.quote_id and rider_profile_id = rider_id and status = 'paid';
  if attempt_id is null then
    if quote.expires_at <= now() then raise exception 'price quote has expired; calculate a new fare'; end if;
    raise exception 'successful payment is required before booking';
  end if;
  select config.tenant_slug into target_tenant_slug from public.tenant_configurations config
    where config.tenant_id = quote.tenant_id;
  if scheduled_pickup_at_value is null then
    new_booking_id := public.create_my_rider_geocoded_booking(target_tenant_slug, quote.service_area_id,
      quote.pickup_address, quote.destination_address, quote.pickup_latitude, quote.pickup_longitude,
      quote.destination_latitude, quote.destination_longitude, 'mapbox-v6', booking_notes_value);
  else
    new_booking_id := public.create_my_rider_geocoded_scheduled_booking(target_tenant_slug, quote.service_area_id,
      quote.pickup_address, quote.destination_address, scheduled_pickup_at_value,
      quote.pickup_latitude, quote.pickup_longitude, quote.destination_latitude,
      quote.destination_longitude, 'mapbox-v6', booking_notes_value);
  end if;
  update public.dispatch_bookings set price_quote_id = quote.quote_id,
    fare_currency_code = quote.currency_code, estimated_fare_minor = quote.fare_amount_minor,
    final_fare_minor = quote.fare_amount_minor, route_distance_meters = quote.route_distance_meters,
    route_duration_seconds = quote.route_duration_seconds where booking_id = new_booking_id;
  update public.trip_price_quotes set status = 'booked', booking_id = new_booking_id where quote_id = quote.quote_id;
  update public.rider_payment_attempts set booking_id = new_booking_id, updated_at = now()
    where payment_attempt_id = attempt_id;
  return new_booking_id;
end;
$$;

create or replace function public.clear_rider_prepayment_after_completion()
returns trigger language plpgsql security definer set search_path = public as $$
declare attempt public.rider_payment_attempts; prepayment_id uuid; receivable_id uuid;
  transaction_id_value uuid; actor_id uuid;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  select * into attempt from public.rider_payment_attempts where booking_id = new.booking_id and status = 'paid';
  if attempt.payment_attempt_id is null then return new; end if;
  select account_id into prepayment_id from public.ledger_accounts
    where tenant_id = new.tenant_id and account_code = 'rider_prepayments';
  select account_id into receivable_id from public.ledger_accounts
    where tenant_id = new.tenant_id and account_code = 'rider_receivables';
  select person_id into actor_id from public.rider_profiles where rider_profile_id = attempt.rider_profile_id;
  insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint, description,
    effective_at, booking_id, created_by_person_id)
  values (new.tenant_id, 'payment_settlement:' || new.booking_id::text,
    md5(jsonb_build_object('bookingId', new.booking_id, 'amountMinor', attempt.amount_minor)::text),
    'Rider payment applied to completed trip', coalesce(new.completed_at, now()), new.booking_id, actor_id)
  on conflict (tenant_id, external_key) do nothing returning transaction_id into transaction_id_value;
  if transaction_id_value is not null then
    set constraints ledger_entries_balanced deferred;
    insert into public.ledger_entries
      (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
    values (new.tenant_id, transaction_id_value, prepayment_id, 1, attempt.amount_minor, 0),
      (new.tenant_id, transaction_id_value, receivable_id, 2, 0, attempt.amount_minor);
    set constraints ledger_entries_balanced immediate;
  end if;
  return new;
end;
$$;

create trigger dispatch_bookings_clear_rider_prepayment
after update of status on public.dispatch_bookings for each row
execute function public.clear_rider_prepayment_after_completion();

revoke all on function public.register_rider_checkout_internal(uuid, text) from public, anon, authenticated;
revoke all on function public.record_rider_payment_internal(text, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.register_rider_checkout_internal(uuid, text) to service_role;
grant execute on function public.record_rider_payment_internal(text, text, text, bigint, text, text) to service_role;
