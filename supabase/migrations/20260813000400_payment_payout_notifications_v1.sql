-- Preference-controlled payment, earnings, transfer, and bank-payout email notifications.

alter table public.rider_notification_preferences
  add column payment_updates_enabled boolean not null default true;
alter table public.driver_notification_preferences
  add column earnings_updates_enabled boolean not null default true;

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
    'rider_payment_succeeded', 'rider_refund_succeeded', 'driver_earnings_recorded',
    'driver_transfer_succeeded', 'driver_bank_payout_created', 'driver_bank_payout_paid',
    'driver_bank_payout_failed'
  )
);

create or replace function public.my_rider_notification_preferences(target_tenant_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare target_tenant_id uuid; target_rider_profile_id uuid;
begin
  select config.tenant_id into target_tenant_id from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  where config.tenant_slug = lower(btrim(target_tenant_slug)) and tenant.status = 'active';
  if target_tenant_id is null then raise exception 'booking tenant is unavailable'; end if;
  target_rider_profile_id := public.current_rider_profile_id(target_tenant_id);
  if target_rider_profile_id is null then raise exception 'active rider profile is required'; end if;
  return (select jsonb_build_object(
    'tripUpdatesEnabled', coalesce(preference.trip_updates_enabled, true),
    'paymentUpdatesEnabled', coalesce(preference.payment_updates_enabled, true))
    from (select target_rider_profile_id) context
    left join public.rider_notification_preferences preference
      on preference.rider_profile_id = context.target_rider_profile_id);
end;
$$;

create or replace function public.set_my_rider_notification_preferences(
  target_tenant_slug text, trip_updates_enabled_value boolean
)
returns boolean language plpgsql security definer set search_path = public as $$
declare target_tenant_id uuid; target_rider_profile_id uuid;
begin
  select config.tenant_id into target_tenant_id from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  where config.tenant_slug = lower(btrim(target_tenant_slug)) and tenant.status = 'active';
  if target_tenant_id is null then raise exception 'booking tenant is unavailable'; end if;
  target_rider_profile_id := public.current_rider_profile_id(target_tenant_id);
  if target_rider_profile_id is null then raise exception 'active rider profile is required'; end if;
  insert into public.rider_notification_preferences (rider_profile_id, tenant_id, trip_updates_enabled)
  values (target_rider_profile_id, target_tenant_id, trip_updates_enabled_value)
  on conflict (rider_profile_id) do update set trip_updates_enabled = excluded.trip_updates_enabled;
  if not trip_updates_enabled_value then
    update public.notification_outbox set delivery_status = 'canceled',
      delivery_error = 'Rider disabled trip update emails.'
    where rider_profile_id = target_rider_profile_id and notification_type in (
      'rider_booking_created', 'rider_dispatch_searching', 'rider_driver_accepted',
      'rider_driver_arrived', 'rider_trip_started', 'rider_trip_completed',
      'rider_booking_cancelled', 'rider_booking_scheduled', 'rider_scheduled_reminder',
      'rider_scheduled_dispatch_started') and delivery_status in ('queued', 'failed');
  end if;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  select target_tenant_id, 'rider.notification_preferences_updated', 'person', rider.person_id,
    '{}', 'Rider updated trip email preferences.', gen_random_uuid(), 'rider_profile',
    target_rider_profile_id::text, jsonb_build_object('trip_updates_enabled', trip_updates_enabled_value)
  from public.rider_profiles rider where rider.rider_profile_id = target_rider_profile_id;
  return trip_updates_enabled_value;
end;
$$;

create or replace function public.set_my_rider_payment_notification_preferences(
  target_tenant_slug text, payment_updates_enabled_value boolean
)
returns boolean language plpgsql security definer set search_path = public as $$
declare target_tenant_id uuid; target_rider_profile_id uuid;
begin
  select config.tenant_id into target_tenant_id from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  where config.tenant_slug = lower(btrim(target_tenant_slug)) and tenant.status = 'active';
  if target_tenant_id is null then raise exception 'booking tenant is unavailable'; end if;
  target_rider_profile_id := public.current_rider_profile_id(target_tenant_id);
  if target_rider_profile_id is null then raise exception 'active rider profile is required'; end if;
  insert into public.rider_notification_preferences (rider_profile_id, tenant_id, payment_updates_enabled)
  values (target_rider_profile_id, target_tenant_id, payment_updates_enabled_value)
  on conflict (rider_profile_id) do update set payment_updates_enabled = excluded.payment_updates_enabled;
  if not payment_updates_enabled_value then
    update public.notification_outbox set delivery_status = 'canceled',
      delivery_error = 'Rider disabled payment update emails.'
    where rider_profile_id = target_rider_profile_id
      and notification_type in ('rider_payment_succeeded', 'rider_refund_succeeded')
      and delivery_status in ('queued', 'failed');
  end if;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  select target_tenant_id, 'rider.payment_notification_preferences_updated', 'person', rider.person_id,
    '{}', 'Rider updated payment email preferences.', gen_random_uuid(), 'rider_profile',
    target_rider_profile_id::text, jsonb_build_object('payment_updates_enabled', payment_updates_enabled_value)
  from public.rider_profiles rider where rider.rider_profile_id = target_rider_profile_id;
  return payment_updates_enabled_value;
end;
$$;

create or replace function public.my_driver_earnings_notification_preferences()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('earningsUpdatesEnabled', coalesce(preference.earnings_updates_enabled, true))
  from public.driver_profiles driver
  join public.person_profiles person on person.person_id = driver.person_id
  left join public.driver_notification_preferences preference on preference.driver_profile_id = driver.driver_profile_id
  where person.auth_user_id = auth.uid() order by driver.created_at limit 1;
$$;

create or replace function public.set_my_driver_earnings_notification_preferences(
  earnings_updates_enabled_value boolean
)
returns boolean language plpgsql security definer set search_path = public as $$
declare driver_id uuid := public.current_driver_profile_id(); target_tenant_id uuid; actor_id uuid;
begin
  if driver_id is null then raise exception 'active Driver profile is required'; end if;
  select tenant_id, person_id into target_tenant_id, actor_id from public.driver_profiles
    where driver_profile_id = driver_id;
  insert into public.driver_notification_preferences (driver_profile_id, tenant_id, earnings_updates_enabled)
  values (driver_id, target_tenant_id, earnings_updates_enabled_value)
  on conflict (driver_profile_id) do update set earnings_updates_enabled = excluded.earnings_updates_enabled;
  if not earnings_updates_enabled_value then
    update public.notification_outbox set delivery_status = 'canceled',
      delivery_error = 'Driver disabled earnings update emails.'
    where driver_profile_id = driver_id and notification_type in (
      'driver_earnings_recorded', 'driver_transfer_succeeded', 'driver_bank_payout_created',
      'driver_bank_payout_paid', 'driver_bank_payout_failed')
      and delivery_status in ('queued', 'failed');
  end if;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (target_tenant_id, 'driver.earnings_notification_preferences_updated', 'person', actor_id,
    '{}', 'Driver updated earnings email preferences.', gen_random_uuid(), 'driver_profile',
    driver_id::text, jsonb_build_object('earnings_updates_enabled', earnings_updates_enabled_value));
  return earnings_updates_enabled_value;
end;
$$;

create or replace function public.queue_rider_payment_update_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare rider public.rider_profiles;
begin
  if new.status <> 'paid' or old.status = 'paid' then return new; end if;
  select * into rider from public.rider_profiles where rider_profile_id = new.rider_profile_id;
  if rider.rider_profile_id is null or not coalesce((select payment_updates_enabled
    from public.rider_notification_preferences where rider_profile_id = rider.rider_profile_id), true)
    then return new; end if;
  insert into public.notification_outbox
    (tenant_id, rider_profile_id, person_id, notification_type, recipient_email, payload, dedupe_key)
  values (new.tenant_id, rider.rider_profile_id, rider.person_id, 'rider_payment_succeeded', rider.email,
    jsonb_build_object('rider_name', rider.display_name, 'payment_attempt_id', new.payment_attempt_id,
      'tenant_slug', (select tenant_slug from public.tenant_configurations where tenant_id = new.tenant_id),
      'amount_minor', new.amount_minor, 'currency_code', new.currency_code),
    'rider_payment:' || new.payment_attempt_id::text || ':paid') on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
create trigger rider_payment_attempts_queue_payment_update
after update of status on public.rider_payment_attempts for each row
execute function public.queue_rider_payment_update_notification();

create or replace function public.queue_rider_refund_update_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare payment public.rider_payment_attempts; rider public.rider_profiles; booking public.dispatch_bookings;
begin
  if new.status <> 'succeeded' or old.status = 'succeeded' then return new; end if;
  select * into payment from public.rider_payment_attempts where payment_attempt_id = new.payment_attempt_id;
  select * into rider from public.rider_profiles where rider_profile_id = payment.rider_profile_id;
  if rider.rider_profile_id is null or not coalesce((select payment_updates_enabled
    from public.rider_notification_preferences where rider_profile_id = rider.rider_profile_id), true)
    then return new; end if;
  select * into booking from public.dispatch_bookings where booking_id = new.booking_id;
  insert into public.notification_outbox
    (tenant_id, rider_profile_id, person_id, notification_type, recipient_email, payload, dedupe_key)
  values (new.tenant_id, rider.rider_profile_id, rider.person_id, 'rider_refund_succeeded', rider.email,
    jsonb_build_object('rider_name', rider.display_name, 'refund_id', new.refund_id,
      'tenant_slug', (select tenant_slug from public.tenant_configurations where tenant_id = new.tenant_id),
      'amount_minor', new.amount_minor, 'currency_code', new.currency_code,
      'pickup_address', booking.pickup_address, 'destination_address', booking.destination_address),
    'rider_refund:' || new.refund_id::text || ':succeeded') on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
create trigger rider_payment_refunds_queue_update
after update of status on public.rider_payment_refunds for each row
execute function public.queue_rider_refund_update_notification();

create or replace function public.queue_driver_earnings_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare driver public.driver_profiles; recipient text;
begin
  if new.driver_earnings_minor is null or old.driver_earnings_minor is not null
    or new.current_driver_profile_id is null then return new; end if;
  select * into driver from public.driver_profiles where driver_profile_id = new.current_driver_profile_id;
  if not coalesce((select earnings_updates_enabled from public.driver_notification_preferences
    where driver_profile_id = driver.driver_profile_id), true) then return new; end if;
  select lower(btrim(coalesce(person.primary_email, driver.email))) into recipient
    from public.person_profiles person where person.person_id = driver.person_id;
  recipient := coalesce(recipient, lower(btrim(driver.email)));
  insert into public.notification_outbox
    (tenant_id, driver_profile_id, person_id, notification_type, recipient_email, payload, dedupe_key)
  values (new.tenant_id, driver.driver_profile_id, driver.person_id, 'driver_earnings_recorded', recipient,
    jsonb_build_object('driver_name', driver.display_name, 'booking_id', new.booking_id,
      'amount_minor', new.driver_earnings_minor, 'currency_code', new.fare_currency_code,
      'pickup_address', new.pickup_address, 'destination_address', new.destination_address),
    'driver_earnings:' || new.booking_id::text || ':recorded') on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
create trigger dispatch_bookings_queue_driver_earnings
after update of driver_earnings_minor on public.dispatch_bookings for each row
execute function public.queue_driver_earnings_notification();

create or replace function public.queue_driver_transfer_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare driver public.driver_profiles; booking public.dispatch_bookings; recipient text;
begin
  if new.status <> 'succeeded' or old.status = 'succeeded' then return new; end if;
  select * into driver from public.driver_profiles where driver_profile_id = new.driver_profile_id;
  if not coalesce((select earnings_updates_enabled from public.driver_notification_preferences
    where driver_profile_id = driver.driver_profile_id), true) then return new; end if;
  select * into booking from public.dispatch_bookings where booking_id = new.booking_id;
  select lower(btrim(coalesce(person.primary_email, driver.email))) into recipient
    from public.person_profiles person where person.person_id = driver.person_id;
  recipient := coalesce(recipient, lower(btrim(driver.email)));
  insert into public.notification_outbox
    (tenant_id, driver_profile_id, person_id, notification_type, recipient_email, payload, dedupe_key)
  values (new.tenant_id, driver.driver_profile_id, driver.person_id, 'driver_transfer_succeeded', recipient,
    jsonb_build_object('driver_name', driver.display_name, 'transfer_id', new.driver_earning_transfer_id,
      'amount_minor', new.amount_minor, 'currency_code', new.currency_code,
      'pickup_address', booking.pickup_address, 'destination_address', booking.destination_address),
    'driver_transfer:' || new.driver_earning_transfer_id::text || ':succeeded')
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
create trigger driver_earning_transfers_queue_update
after update of status on public.driver_earning_transfers for each row
execute function public.queue_driver_transfer_notification();

create or replace function public.queue_driver_bank_payout_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare driver public.driver_profiles; recipient text; event_type text; event_key text;
begin
  if tg_op = 'INSERT' then
    event_type := case when new.status = 'paid' then 'driver_bank_payout_paid'
      when new.status = 'failed' then 'driver_bank_payout_failed' else 'driver_bank_payout_created' end;
  elsif new.status is not distinct from old.status or new.status not in ('paid', 'failed') then return new;
  else event_type := case when new.status = 'paid' then 'driver_bank_payout_paid' else 'driver_bank_payout_failed' end;
  end if;
  event_key := case when event_type = 'driver_bank_payout_created' then 'created'
    when event_type = 'driver_bank_payout_paid' then 'paid' else 'failed' end;
  select * into driver from public.driver_profiles where driver_profile_id = new.driver_profile_id;
  if not coalesce((select earnings_updates_enabled from public.driver_notification_preferences
    where driver_profile_id = driver.driver_profile_id), true) then return new; end if;
  select lower(btrim(coalesce(person.primary_email, driver.email))) into recipient
    from public.person_profiles person where person.person_id = driver.person_id;
  recipient := coalesce(recipient, lower(btrim(driver.email)));
  insert into public.notification_outbox
    (tenant_id, driver_profile_id, person_id, notification_type, recipient_email, payload, dedupe_key)
  values (new.tenant_id, driver.driver_profile_id, driver.person_id, event_type, recipient,
    jsonb_strip_nulls(jsonb_build_object('driver_name', driver.display_name,
      'payout_id', new.driver_bank_payout_id, 'amount_minor', new.amount_minor,
      'currency_code', new.currency_code, 'status', new.status,
      'expected_arrival_at', new.expected_arrival_at, 'failure_message', new.failure_message)),
    'driver_bank_payout:' || new.provider_payout_id || ':' || event_key)
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
create trigger driver_bank_payouts_queue_update
after insert or update of status on public.driver_bank_payouts for each row
execute function public.queue_driver_bank_payout_notification();

revoke all on function public.set_my_rider_payment_notification_preferences(text, boolean) from public, anon, authenticated;
revoke all on function public.my_driver_earnings_notification_preferences() from public, anon, authenticated;
revoke all on function public.set_my_driver_earnings_notification_preferences(boolean) from public, anon, authenticated;
revoke all on function public.queue_rider_payment_update_notification() from public, anon, authenticated;
revoke all on function public.queue_rider_refund_update_notification() from public, anon, authenticated;
revoke all on function public.queue_driver_earnings_notification() from public, anon, authenticated;
revoke all on function public.queue_driver_transfer_notification() from public, anon, authenticated;
revoke all on function public.queue_driver_bank_payout_notification() from public, anon, authenticated;
grant execute on function public.set_my_rider_payment_notification_preferences(text, boolean) to authenticated;
grant execute on function public.my_driver_earnings_notification_preferences() to authenticated;
grant execute on function public.set_my_driver_earnings_notification_preferences(boolean) to authenticated;
