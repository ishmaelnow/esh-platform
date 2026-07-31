-- Manual dispatch and trip lifecycle without GPS, routing, pricing, or payments.

create table public.dispatch_bookings (
  booking_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  service_area_id uuid not null,
  customer_name text not null,
  customer_phone text,
  pickup_address text not null,
  destination_address text not null,
  booking_notes text,
  status text not null default 'requested',
  current_driver_profile_id uuid,
  current_vehicle_id uuid,
  created_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint dispatch_bookings_status_check check (
    status in ('requested', 'offered', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled')
  ),
  constraint dispatch_bookings_customer_name_not_blank check (length(btrim(customer_name)) > 0),
  constraint dispatch_bookings_pickup_not_blank check (length(btrim(pickup_address)) > 0),
  constraint dispatch_bookings_destination_not_blank check (length(btrim(destination_address)) > 0),
  constraint dispatch_bookings_tenant_booking_unique unique (tenant_id, booking_id),
  constraint dispatch_bookings_area_fk foreign key (tenant_id, service_area_id)
    references public.service_areas (tenant_id, service_area_id) on delete restrict,
  constraint dispatch_bookings_driver_fk foreign key (tenant_id, current_driver_profile_id)
    references public.driver_profiles (tenant_id, driver_profile_id) on delete restrict,
  constraint dispatch_bookings_vehicle_fk foreign key (tenant_id, current_vehicle_id)
    references public.vehicles (tenant_id, vehicle_id) on delete restrict
);

create table public.dispatch_offers (
  offer_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  booking_id uuid not null,
  driver_profile_id uuid not null,
  vehicle_id uuid not null,
  status text not null default 'pending',
  offered_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  offered_at timestamptz not null default now(),
  responded_at timestamptz,
  response_notes text,
  constraint dispatch_offers_status_check check (
    status in ('pending', 'accepted', 'declined', 'cancelled')
  ),
  constraint dispatch_offers_response_check check (
    (status = 'pending' and responded_at is null)
    or (status <> 'pending' and responded_at is not null)
  ),
  constraint dispatch_offers_booking_fk foreign key (tenant_id, booking_id)
    references public.dispatch_bookings (tenant_id, booking_id) on delete restrict,
  constraint dispatch_offers_driver_fk foreign key (tenant_id, driver_profile_id)
    references public.driver_profiles (tenant_id, driver_profile_id) on delete restrict,
  constraint dispatch_offers_vehicle_fk foreign key (tenant_id, vehicle_id)
    references public.vehicles (tenant_id, vehicle_id) on delete restrict
);

create unique index dispatch_offers_one_pending_booking_idx
  on public.dispatch_offers (booking_id) where status = 'pending';
create index dispatch_bookings_tenant_status_idx
  on public.dispatch_bookings (tenant_id, status, created_at desc);
create index dispatch_offers_driver_status_idx
  on public.dispatch_offers (driver_profile_id, status, offered_at desc);
create unique index dispatch_bookings_one_active_trip_driver_idx
  on public.dispatch_bookings (current_driver_profile_id)
  where status in ('accepted', 'arrived', 'in_progress');

create trigger dispatch_bookings_set_updated_at before update on public.dispatch_bookings
  for each row execute function public.set_updated_at();

create or replace function public.can_manage_dispatch(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_tenant_role(target_tenant_id, array['tenant_owner', 'tenant_admin'])
    and public.tenant_capability_enabled(target_tenant_id, 'driver.management');
$$;

create or replace function public.current_driver_profile_id()
returns uuid language sql stable security definer set search_path = public as $$
  select driver.driver_profile_id
  from public.driver_profiles driver
  join public.person_profiles person on person.person_id = driver.person_id
  where person.auth_user_id = auth.uid()
  order by driver.created_at
  limit 1;
$$;
revoke all on function public.current_driver_profile_id() from public, anon, authenticated;
grant execute on function public.current_driver_profile_id() to authenticated;

alter table public.dispatch_bookings enable row level security;
alter table public.dispatch_offers enable row level security;

create policy dispatch_bookings_manager_select on public.dispatch_bookings
  for select to authenticated using (public.can_manage_dispatch(tenant_id));
create policy dispatch_bookings_driver_select on public.dispatch_bookings
  for select to authenticated using (
    current_driver_profile_id = public.current_driver_profile_id()
  );
create policy dispatch_offers_manager_select on public.dispatch_offers
  for select to authenticated using (public.can_manage_dispatch(tenant_id));
create policy dispatch_offers_driver_select on public.dispatch_offers
  for select to authenticated using (
    driver_profile_id = public.current_driver_profile_id()
  );

grant select on public.dispatch_bookings, public.dispatch_offers to authenticated;
grant all on public.dispatch_bookings, public.dispatch_offers to service_role;

-- Forward declaration for mutation functions that return the driver's current dispatch view.
create or replace function public.my_driver_dispatch()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('offers', '[]'::jsonb, 'trips', '[]'::jsonb);
$$;

create or replace function public.create_dispatch_booking(
  target_tenant_id uuid,
  target_service_area_id uuid,
  customer_name_value text,
  customer_phone_value text,
  pickup_address_value text,
  destination_address_value text,
  booking_notes_value text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  new_booking_id uuid;
begin
  if actor_id is null or not public.can_manage_dispatch(target_tenant_id) then
    raise exception 'dispatch management permission is required';
  end if;
  if nullif(btrim(customer_name_value), '') is null
    or nullif(btrim(pickup_address_value), '') is null
    or nullif(btrim(destination_address_value), '') is null then
    raise exception 'customer, pickup, and destination are required';
  end if;
  if not exists (
    select 1 from public.service_areas area
    where area.tenant_id = target_tenant_id
      and area.service_area_id = target_service_area_id
      and area.status = 'active'
  ) then raise exception 'active service area is required'; end if;

  insert into public.dispatch_bookings (
    tenant_id, service_area_id, customer_name, customer_phone, pickup_address,
    destination_address, booking_notes, created_by_person_id
  ) values (
    target_tenant_id, target_service_area_id, btrim(customer_name_value),
    nullif(btrim(customer_phone_value), ''), btrim(pickup_address_value),
    btrim(destination_address_value), nullif(btrim(booking_notes_value), ''), actor_id
  ) returning booking_id into new_booking_id;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    target_tenant_id, 'dispatch.booking_created', 'person', actor_id, '{}',
    'Manual dispatch booking created.', gen_random_uuid(), 'dispatch_booking',
    new_booking_id::text, jsonb_build_object('service_area_id', target_service_area_id)
  );
  return new_booking_id;
end;
$$;

create or replace function public.offer_dispatch_booking(
  target_booking_id uuid,
  target_driver_profile_id uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  target_booking public.dispatch_bookings;
  target_availability public.driver_availability;
  assigned_vehicle_id uuid;
  new_offer_id uuid;
begin
  select * into target_booking from public.dispatch_bookings
  where booking_id = target_booking_id for update;
  if target_booking.booking_id is null or actor_id is null
    or not public.can_manage_dispatch(target_booking.tenant_id) then
    raise exception 'dispatch management permission is required';
  end if;
  if target_booking.status not in ('requested', 'offered') then
    raise exception 'booking is not available for assignment';
  end if;

  select * into target_availability from public.driver_availability
  where driver_profile_id = target_driver_profile_id for update;
  if target_availability.tenant_id is distinct from target_booking.tenant_id
    or target_availability.requested_status <> 'online'
    or target_availability.selected_service_area_id is distinct from target_booking.service_area_id
    or cardinality(public.driver_service_blockers(target_driver_profile_id)) > 0 then
    raise exception 'driver must be eligible, online, and operating in the booking service area';
  end if;
  if exists (
    select 1 from public.dispatch_bookings active_booking
    where active_booking.current_driver_profile_id = target_driver_profile_id
      and active_booking.status in ('accepted', 'arrived', 'in_progress')
  ) then raise exception 'driver already has an active trip'; end if;

  select assignment.vehicle_id into assigned_vehicle_id
  from public.driver_vehicle_assignments assignment
  where assignment.tenant_id = target_booking.tenant_id
    and assignment.driver_profile_id = target_driver_profile_id
    and assignment.ended_at is null
  limit 1;
  if assigned_vehicle_id is null then raise exception 'driver has no active vehicle'; end if;

  update public.dispatch_offers set
    status = 'cancelled', responded_at = now(), response_notes = 'Reassigned by dispatcher.'
  where booking_id = target_booking_id and status = 'pending';

  insert into public.dispatch_offers (
    tenant_id, booking_id, driver_profile_id, vehicle_id, offered_by_person_id
  ) values (
    target_booking.tenant_id, target_booking_id, target_driver_profile_id,
    assigned_vehicle_id, actor_id
  ) returning offer_id into new_offer_id;
  update public.dispatch_bookings set status = 'offered'
  where booking_id = target_booking_id;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    target_booking.tenant_id, 'dispatch.offer_created', 'person', actor_id, '{}',
    'Driver received a manual dispatch offer.', gen_random_uuid(), 'dispatch_offer',
    new_offer_id::text, jsonb_build_object(
      'booking_id', target_booking_id, 'driver_profile_id', target_driver_profile_id,
      'vehicle_id', assigned_vehicle_id
    )
  );
  return new_offer_id;
end;
$$;

create or replace function public.respond_my_dispatch_offer(
  target_offer_id uuid,
  target_response text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  driver_id uuid := public.current_driver_profile_id();
  target_offer public.dispatch_offers;
  target_booking public.dispatch_bookings;
begin
  if target_response not in ('accepted', 'declined') then
    raise exception 'offer response must be accepted or declined';
  end if;
  select * into target_offer from public.dispatch_offers
  where offer_id = target_offer_id for update;
  if driver_id is null or target_offer.offer_id is null
    or target_offer.driver_profile_id is distinct from driver_id
    or target_offer.status <> 'pending' then raise exception 'active offer is unavailable'; end if;
  select * into target_booking from public.dispatch_bookings
  where booking_id = target_offer.booking_id for update;

  if target_response = 'accepted' and (
    target_booking.status <> 'offered'
    or cardinality(public.driver_service_blockers(driver_id)) > 0
    or not exists (
      select 1 from public.driver_availability availability
      where availability.driver_profile_id = driver_id
        and availability.requested_status = 'online'
        and availability.selected_service_area_id = target_booking.service_area_id
    )
  ) then raise exception 'driver is no longer eligible for this trip'; end if;

  update public.dispatch_offers set
    status = target_response, responded_at = now()
  where offer_id = target_offer_id;
  if target_response = 'accepted' then
    update public.dispatch_bookings set
      status = 'accepted',
      current_driver_profile_id = driver_id,
      current_vehicle_id = target_offer.vehicle_id
    where booking_id = target_offer.booking_id;
  else
    update public.dispatch_bookings set status = 'requested'
    where booking_id = target_offer.booking_id;
  end if;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) select
    target_offer.tenant_id, 'dispatch.offer_' || target_response, 'person',
    driver.person_id, '{}', 'Driver responded to a dispatch offer.', gen_random_uuid(),
    'dispatch_offer', target_offer_id::text,
    jsonb_build_object('booking_id', target_offer.booking_id, 'response', target_response)
  from public.driver_profiles driver where driver.driver_profile_id = driver_id;
  return public.my_driver_dispatch();
end;
$$;

create or replace function public.advance_my_trip(
  target_booking_id uuid,
  target_action text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  driver_id uuid := public.current_driver_profile_id();
  target_booking public.dispatch_bookings;
  next_status text;
begin
  select * into target_booking from public.dispatch_bookings
  where booking_id = target_booking_id for update;
  if driver_id is null or target_booking.booking_id is null
    or target_booking.current_driver_profile_id is distinct from driver_id then
    raise exception 'active trip is unavailable';
  end if;
  next_status := case
    when target_action = 'arrive' and target_booking.status = 'accepted' then 'arrived'
    when target_action = 'start' and target_booking.status = 'arrived' then 'in_progress'
    when target_action = 'complete' and target_booking.status = 'in_progress' then 'completed'
    else null
  end;
  if next_status is null then raise exception 'trip action is not valid from the current state'; end if;
  update public.dispatch_bookings set
    status = next_status,
    completed_at = case when next_status = 'completed' then now() else completed_at end
  where booking_id = target_booking_id;
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) select
    target_booking.tenant_id, 'trip.' || next_status, 'person', driver.person_id, '{}',
    'Driver advanced the trip lifecycle.', gen_random_uuid(), 'dispatch_booking',
    target_booking_id::text, jsonb_build_object('status', next_status)
  from public.driver_profiles driver where driver.driver_profile_id = driver_id;
  return public.my_driver_dispatch();
end;
$$;

create or replace function public.cancel_dispatch_booking(target_booking_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  target_booking public.dispatch_bookings;
begin
  select * into target_booking from public.dispatch_bookings
  where booking_id = target_booking_id for update;
  if target_booking.booking_id is null or actor_id is null
    or not public.can_manage_dispatch(target_booking.tenant_id) then
    raise exception 'dispatch management permission is required';
  end if;
  if target_booking.status in ('completed', 'cancelled') then
    raise exception 'booking cannot be cancelled';
  end if;
  update public.dispatch_offers set
    status = 'cancelled', responded_at = now(), response_notes = 'Booking cancelled.'
  where booking_id = target_booking_id and status = 'pending';
  update public.dispatch_bookings set status = 'cancelled', cancelled_at = now()
  where booking_id = target_booking_id;
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    target_booking.tenant_id, 'dispatch.booking_cancelled', 'person', actor_id, '{}',
    'Dispatch booking cancelled.', gen_random_uuid(), 'dispatch_booking',
    target_booking_id::text, '{}'::jsonb
  );
  return true;
end;
$$;

create or replace function public.my_driver_dispatch()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'offerId', offer.offer_id, 'bookingId', booking.booking_id,
        'customerName', booking.customer_name, 'customerPhone', booking.customer_phone,
        'pickupAddress', booking.pickup_address,
        'destinationAddress', booking.destination_address,
        'notes', booking.booking_notes, 'serviceAreaName', area.name,
        'status', offer.status, 'offeredAt', offer.offered_at
      ) order by offer.offered_at desc)
      from public.dispatch_offers offer
      join public.dispatch_bookings booking on booking.booking_id = offer.booking_id
      join public.service_areas area on area.service_area_id = booking.service_area_id
      where offer.driver_profile_id = public.current_driver_profile_id()
        and offer.status = 'pending'
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
      where booking.current_driver_profile_id = public.current_driver_profile_id()
        and booking.status in ('accepted', 'arrived', 'in_progress')
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.can_manage_dispatch(uuid) from public, anon;
revoke all on function public.create_dispatch_booking(uuid, uuid, text, text, text, text, text)
  from public, anon;
revoke all on function public.offer_dispatch_booking(uuid, uuid) from public, anon;
revoke all on function public.respond_my_dispatch_offer(uuid, text) from public, anon;
revoke all on function public.advance_my_trip(uuid, text) from public, anon;
revoke all on function public.cancel_dispatch_booking(uuid) from public, anon;
revoke all on function public.my_driver_dispatch() from public, anon;

grant execute on function public.can_manage_dispatch(uuid) to authenticated;
grant execute on function public.create_dispatch_booking(uuid, uuid, text, text, text, text, text)
  to authenticated;
grant execute on function public.offer_dispatch_booking(uuid, uuid) to authenticated;
grant execute on function public.respond_my_dispatch_offer(uuid, text) to authenticated;
grant execute on function public.advance_my_trip(uuid, text) to authenticated;
grant execute on function public.cancel_dispatch_booking(uuid) to authenticated;
grant execute on function public.my_driver_dispatch() to authenticated;
