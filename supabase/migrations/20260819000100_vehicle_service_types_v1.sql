-- Rider vehicle choices and dispatch eligibility.

alter table public.vehicles
  add column if not exists service_type text not null default 'standard';
alter table public.vehicles
  drop constraint if exists vehicles_service_type_check;
alter table public.vehicles
  add constraint vehicles_service_type_check
  check (service_type in ('standard', 'larger', 'accessible'));

alter table public.dispatch_bookings
  add column if not exists requested_service_type text not null default 'standard';
alter table public.dispatch_bookings
  drop constraint if exists dispatch_bookings_requested_service_type_check;
alter table public.dispatch_bookings
  add constraint dispatch_bookings_requested_service_type_check
  check (requested_service_type in ('standard', 'larger', 'accessible'));

create or replace function public.apply_rider_requested_service_type()
returns trigger language plpgsql security definer set search_path = public as $$
declare requested text;
begin
  requested := current_setting('esh.requested_service_type', true);
  if requested in ('standard', 'larger', 'accessible') then
    new.requested_service_type := requested;
  end if;
  return new;
end;
$$;

drop trigger if exists dispatch_bookings_apply_rider_service_type on public.dispatch_bookings;
create trigger dispatch_bookings_apply_rider_service_type
  before insert on public.dispatch_bookings
  for each row execute function public.apply_rider_requested_service_type();

-- The four-argument wrapper preserves the deployed three-argument RPC while allowing
-- the Rider's choice to be visible to the insert-time automatic matcher.
create or replace function public.create_my_rider_priced_booking(
  target_quote_id uuid,
  booking_notes_value text default null,
  scheduled_pickup_at_value timestamptz default null,
  service_type_value text default 'standard'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare normalized text := lower(btrim(coalesce(service_type_value, 'standard'))); booking_id_value uuid;
begin
  if normalized not in ('standard', 'larger', 'accessible') then
    raise exception 'unsupported vehicle service type';
  end if;
  perform set_config('esh.requested_service_type', normalized, true);
  booking_id_value := public.create_my_rider_priced_booking(
    target_quote_id, booking_notes_value, scheduled_pickup_at_value
  );
  return booking_id_value;
end;
$$;

-- Replace the matcher with the same eligibility rules plus the requested vehicle type.
create or replace function public.match_dispatch_booking(target_booking_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  booking public.dispatch_bookings;
  settings public.tenant_matching_settings;
  selected_driver_id uuid;
  selected_vehicle_id uuid;
  new_offer_id uuid;
  attempt_count integer;
begin
  select * into booking from public.dispatch_bookings where booking_id = target_booking_id for update;
  if booking.booking_id is null or booking.status <> 'requested' then return null; end if;
  select * into settings from public.tenant_matching_settings where tenant_id = booking.tenant_id;
  if not coalesce(settings.automatic_matching_enabled, false) then return null; end if;
  select count(*) into attempt_count from public.dispatch_offers
    where booking_id = target_booking_id and offer_source = 'automatic';
  if attempt_count >= settings.maximum_attempts then return null; end if;

  select driver.driver_profile_id, assignment.vehicle_id
    into selected_driver_id, selected_vehicle_id
  from public.driver_profiles driver
  join public.driver_availability availability
    on availability.driver_profile_id = driver.driver_profile_id
  join public.driver_vehicle_assignments assignment
    on assignment.driver_profile_id = driver.driver_profile_id and assignment.ended_at is null
  join public.vehicles vehicle
    on vehicle.vehicle_id = assignment.vehicle_id and vehicle.tenant_id = booking.tenant_id
    and vehicle.status = 'active' and vehicle.service_type = booking.requested_service_type
  where driver.tenant_id = booking.tenant_id
    and driver.status = 'active'
    and availability.requested_status = 'online'
    and availability.selected_service_area_id = booking.service_area_id
    and cardinality(public.driver_service_blockers(driver.driver_profile_id)) = 0
    and not exists (
      select 1 from public.dispatch_bookings active_trip
      where active_trip.current_driver_profile_id = driver.driver_profile_id
        and active_trip.status in ('accepted', 'arrived', 'in_progress')
    )
    and not exists (
      select 1 from public.dispatch_offers attempted
      where attempted.booking_id = booking.booking_id
        and attempted.driver_profile_id = driver.driver_profile_id
    )
  order by greatest(
    (select max(completed.completed_at) from public.dispatch_bookings completed
      where completed.current_driver_profile_id = driver.driver_profile_id),
    (select max(accepted.responded_at) from public.dispatch_offers accepted
      where accepted.driver_profile_id = driver.driver_profile_id and accepted.status = 'accepted')
  ) asc nulls first, driver.driver_number asc
  limit 1;

  if selected_driver_id is null then return null; end if;
  insert into public.dispatch_offers (
    tenant_id, booking_id, driver_profile_id, vehicle_id, offered_by_person_id,
    offer_source, expires_at
  ) values (
    booking.tenant_id, booking.booking_id, selected_driver_id, selected_vehicle_id, null,
    'automatic', now() + make_interval(secs => settings.offer_duration_seconds)
  ) returning offer_id into new_offer_id;
  update public.dispatch_bookings set status = 'offered' where booking_id = booking.booking_id;
  return new_offer_id;
end;
$$;

revoke all on function public.create_my_rider_priced_booking(uuid, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.create_my_rider_priced_booking(uuid, text, timestamptz, text)
  to authenticated;
