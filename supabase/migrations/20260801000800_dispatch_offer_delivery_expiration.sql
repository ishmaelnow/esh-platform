-- Time-bounded dispatch offers, automatic expiration, and driver notification delivery.

alter table public.dispatch_offers
  add column expires_at timestamptz;

update public.dispatch_offers
set expires_at = case
  when status = 'pending' then now() + interval '90 seconds'
  else offered_at + interval '90 seconds'
end;

alter table public.dispatch_offers
  alter column expires_at set default (now() + interval '90 seconds'),
  alter column expires_at set not null,
  drop constraint dispatch_offers_status_check,
  add constraint dispatch_offers_status_check check (
    status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')
  ),
  add constraint dispatch_offers_expiration_check check (expires_at > offered_at);

create index dispatch_offers_pending_expiration_idx
  on public.dispatch_offers (expires_at) where status = 'pending';

alter table public.notification_outbox
  drop constraint notification_outbox_type_check;
alter table public.notification_outbox
  add constraint notification_outbox_type_check check (
    notification_type in (
      'driver_account_ready', 'driver_evidence_approved', 'driver_evidence_rejected',
      'driver_evidence_expiring_30d', 'driver_evidence_expiring_7d', 'driver_evidence_expired',
      'driver_activated', 'vehicle_evidence_approved', 'vehicle_evidence_rejected',
      'vehicle_evidence_expiring_30d', 'vehicle_evidence_expiring_7d',
      'vehicle_evidence_expired', 'dispatch_offer_created'
    )
  );

create or replace function public.validate_dispatch_offer_expiration()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'accepted' and old.status = 'pending' and old.expires_at <= now() then
    raise exception 'dispatch offer has expired';
  end if;
  return new;
end;
$$;
create trigger dispatch_offers_validate_expiration
  before update of status on public.dispatch_offers
  for each row execute function public.validate_dispatch_offer_expiration();

create or replace function public.queue_dispatch_offer_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_driver public.driver_profiles;
  target_person public.person_profiles;
  target_booking public.dispatch_bookings;
  area_name text;
  recipient text;
begin
  select * into target_driver from public.driver_profiles
  where driver_profile_id = new.driver_profile_id;
  select * into target_person from public.person_profiles
  where person_id = target_driver.person_id;
  select * into target_booking from public.dispatch_bookings
  where booking_id = new.booking_id;
  select name into area_name from public.service_areas
  where service_area_id = target_booking.service_area_id;
  recipient := lower(btrim(coalesce(target_person.primary_email, target_driver.email)));
  if recipient is null or recipient = '' then return new; end if;

  insert into public.notification_outbox (
    tenant_id, driver_profile_id, person_id, notification_type,
    recipient_email, payload, dedupe_key
  ) values (
    new.tenant_id, new.driver_profile_id, target_driver.person_id,
    'dispatch_offer_created', recipient,
    jsonb_build_object(
      'driver_name', target_driver.display_name,
      'offer_id', new.offer_id,
      'booking_id', new.booking_id,
      'service_area_name', area_name,
      'pickup_address', target_booking.pickup_address,
      'destination_address', target_booking.destination_address,
      'expires_at', new.expires_at
    ),
    'dispatch_offer:' || new.offer_id::text
  ) on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
create trigger dispatch_offers_queue_notification
  after insert on public.dispatch_offers
  for each row execute function public.queue_dispatch_offer_notification();

create or replace function public.audit_dispatch_offer_reassignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled'
    and old.status = 'pending'
    and new.response_notes = 'Reassigned by dispatcher.' then
    insert into public.tenant_audit_events (
      tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
      correlation_id, resource_type, resource_id, metadata
    ) values (
      new.tenant_id, 'dispatch.offer_reassigned', 'person', public.current_person_id(), '{}',
      'Pending dispatch offer replaced by dispatcher.', gen_random_uuid(),
      'dispatch_offer', new.offer_id::text,
      jsonb_build_object('booking_id', new.booking_id, 'driver_profile_id', new.driver_profile_id)
    );
  end if;
  return new;
end;
$$;
create trigger dispatch_offers_audit_reassignment
  after update of status on public.dispatch_offers
  for each row execute function public.audit_dispatch_offer_reassignment();

create or replace function public.expire_dispatch_offers(target_tenant_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  expired_offer record;
  expired_count integer := 0;
begin
  if not (
    auth.role() = 'service_role'
    or public.can_manage_dispatch(target_tenant_id)
    or public.has_active_tenant_membership(target_tenant_id)
    or exists (
      select 1 from public.driver_profiles driver
      where driver.driver_profile_id = public.current_driver_profile_id()
        and driver.tenant_id = target_tenant_id
    )
  ) then raise exception 'dispatch access is required'; end if;

  for expired_offer in
    update public.dispatch_offers offer
    set status = 'expired', responded_at = now(), response_notes = 'Offer expired.'
    where offer.tenant_id = target_tenant_id
      and offer.status = 'pending'
      and offer.expires_at <= now()
    returning offer.offer_id, offer.booking_id, offer.driver_profile_id
  loop
    update public.dispatch_bookings booking
    set status = 'requested'
    where booking.booking_id = expired_offer.booking_id
      and booking.status = 'offered'
      and not exists (
        select 1 from public.dispatch_offers pending
        where pending.booking_id = expired_offer.booking_id
          and pending.status = 'pending'
      );
    insert into public.tenant_audit_events (
      tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
      correlation_id, resource_type, resource_id, metadata
    ) values (
      target_tenant_id, 'dispatch.offer_expired', 'platform_system', null, '{}',
      'Dispatch offer expired before driver acceptance.', gen_random_uuid(),
      'dispatch_offer', expired_offer.offer_id::text,
      jsonb_build_object(
        'booking_id', expired_offer.booking_id,
        'driver_profile_id', expired_offer.driver_profile_id
      )
    );
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end;
$$;

create or replace function public.my_driver_dispatch()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  driver_id uuid := public.current_driver_profile_id();
  driver_tenant_id uuid;
  result jsonb;
begin
  select tenant_id into driver_tenant_id from public.driver_profiles
  where driver_profile_id = driver_id;
  if driver_id is null or driver_tenant_id is null then
    raise exception 'driver profile is unavailable';
  end if;
  perform public.expire_dispatch_offers(driver_tenant_id);
  select jsonb_build_object(
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'offerId', offer.offer_id, 'bookingId', booking.booking_id,
        'customerName', booking.customer_name, 'customerPhone', booking.customer_phone,
        'pickupAddress', booking.pickup_address,
        'destinationAddress', booking.destination_address,
        'notes', booking.booking_notes, 'serviceAreaName', area.name,
        'status', offer.status, 'offeredAt', offer.offered_at,
        'expiresAt', offer.expires_at
      ) order by offer.offered_at desc)
      from public.dispatch_offers offer
      join public.dispatch_bookings booking on booking.booking_id = offer.booking_id
      join public.service_areas area on area.service_area_id = booking.service_area_id
      where offer.driver_profile_id = driver_id and offer.status = 'pending'
    ), '[]'::jsonb),
    'trips', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bookingId', booking.booking_id, 'customerName', booking.customer_name,
        'customerPhone', booking.customer_phone, 'pickupAddress', booking.pickup_address,
        'destinationAddress', booking.destination_address, 'notes', booking.booking_notes,
        'serviceAreaName', area.name, 'status', booking.status
      ) order by booking.updated_at desc)
      from public.dispatch_bookings booking
      join public.service_areas area on area.service_area_id = booking.service_area_id
      where booking.current_driver_profile_id = driver_id
        and booking.status in ('accepted', 'arrived', 'in_progress')
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.expire_dispatch_offers(uuid) from public, anon;
grant execute on function public.expire_dispatch_offers(uuid) to authenticated, service_role;
