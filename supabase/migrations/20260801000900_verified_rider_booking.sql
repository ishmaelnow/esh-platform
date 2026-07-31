-- Verified rider self-service on the existing dispatch lifecycle.

create table public.rider_profiles (
  rider_profile_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  display_name text not null,
  email text not null,
  phone text,
  accessibility_notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rider_profiles_name_not_blank check (length(btrim(display_name)) > 0),
  constraint rider_profiles_email_normalized check (email = lower(btrim(email))),
  constraint rider_profiles_email_not_blank check (length(email) > 0),
  constraint rider_profiles_status_check check (status in ('active', 'suspended')),
  constraint rider_profiles_tenant_profile_unique unique (tenant_id, rider_profile_id),
  constraint rider_profiles_tenant_person_unique unique (tenant_id, person_id),
  constraint rider_profiles_tenant_email_unique unique (tenant_id, email)
);

create index rider_profiles_person_idx on public.rider_profiles (person_id);
create trigger rider_profiles_set_updated_at before update on public.rider_profiles
  for each row execute function public.set_updated_at();

alter table public.dispatch_bookings
  add column rider_profile_id uuid,
  add constraint dispatch_bookings_rider_fk
    foreign key (tenant_id, rider_profile_id)
    references public.rider_profiles (tenant_id, rider_profile_id) on delete restrict;

create index dispatch_bookings_rider_created_idx
  on public.dispatch_bookings (rider_profile_id, created_at desc)
  where rider_profile_id is not null;

create or replace function public.current_rider_profile_id(target_tenant_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select rider.rider_profile_id
  from public.rider_profiles rider
  join public.person_profiles person on person.person_id = rider.person_id
  where rider.tenant_id = target_tenant_id
    and rider.status = 'active'
    and person.auth_user_id = auth.uid()
    and person.status = 'active'
  limit 1;
$$;
revoke all on function public.current_rider_profile_id(uuid) from public, anon, authenticated;
grant execute on function public.current_rider_profile_id(uuid) to authenticated;

alter table public.rider_profiles enable row level security;

create policy rider_profiles_self_select on public.rider_profiles
  for select to authenticated using (
    rider_profile_id = public.current_rider_profile_id(tenant_id)
  );
create policy rider_profiles_manager_select on public.rider_profiles
  for select to authenticated using (public.can_manage_dispatch(tenant_id));
create policy dispatch_bookings_rider_select on public.dispatch_bookings
  for select to authenticated using (
    rider_profile_id is not null
    and rider_profile_id = public.current_rider_profile_id(tenant_id)
  );

grant select on public.rider_profiles to authenticated;
grant all on public.rider_profiles to service_role;

create or replace function public.list_rider_booking_tenants()
returns table (tenant_slug text, display_name text)
language sql stable security definer set search_path = public as $$
  select config.tenant_slug, config.display_name
  from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  join public.tenant_capabilities capability
    on capability.tenant_id = config.tenant_id
    and capability.capability_key = 'driver.management'
    and capability.enabled
  where tenant.status = 'active'
    and config.tenant_slug is not null
    and exists (
      select 1 from public.service_areas area
      where area.tenant_id = config.tenant_id and area.status = 'active'
    )
  order by config.display_name;
$$;
revoke all on function public.list_rider_booking_tenants() from public;
grant execute on function public.list_rider_booking_tenants() to anon, authenticated;

create or replace function public.upsert_my_rider_profile(
  target_tenant_slug text,
  display_name_value text,
  phone_value text default null,
  accessibility_notes_value text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  auth_user uuid := auth.uid();
  auth_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  target_tenant_id uuid;
  target_person_id uuid;
  target_rider_id uuid;
  was_created boolean := false;
begin
  if auth_user is null or auth_email = '' then
    raise exception 'verified email authentication is required';
  end if;
  if nullif(btrim(display_name_value), '') is null then
    raise exception 'name is required';
  end if;

  select config.tenant_id into target_tenant_id
  from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  join public.tenant_capabilities capability
    on capability.tenant_id = config.tenant_id
    and capability.capability_key = 'driver.management'
    and capability.enabled
  where config.tenant_slug = lower(btrim(target_tenant_slug))
    and tenant.status = 'active'
    and exists (
      select 1 from public.service_areas area
      where area.tenant_id = config.tenant_id and area.status = 'active'
    );
  if target_tenant_id is null then raise exception 'booking tenant is unavailable'; end if;

  select person_id into target_person_id
  from public.person_profiles
  where auth_user_id = auth_user
  for update;

  if target_person_id is null then
    select person_id into target_person_id
    from public.person_profiles
    where normalized_email = auth_email and auth_user_id is null
    for update;
  end if;

  if target_person_id is null then
    insert into public.person_profiles (
      auth_user_id, status, display_name, primary_email, normalized_email, activated_at
    ) values (
      auth_user, 'active', btrim(display_name_value), auth_email, auth_email, now()
    ) returning person_id into target_person_id;
  else
    update public.person_profiles set
      auth_user_id = auth_user,
      status = 'active',
      display_name = coalesce(display_name, btrim(display_name_value)),
      activated_at = coalesce(activated_at, now()),
      suspended_at = null,
      deactivated_at = null
    where person_id = target_person_id
      and normalized_email = auth_email
      and (auth_user_id is null or auth_user_id = auth_user);
    if not found then raise exception 'email is linked to another identity'; end if;
  end if;

  select rider_profile_id into target_rider_id
  from public.rider_profiles
  where tenant_id = target_tenant_id and person_id = target_person_id
  for update;

  if target_rider_id is null then
    was_created := true;
    insert into public.rider_profiles (
      tenant_id, person_id, display_name, email, phone, accessibility_notes
    ) values (
      target_tenant_id, target_person_id, btrim(display_name_value), auth_email,
      nullif(btrim(phone_value), ''), nullif(btrim(accessibility_notes_value), '')
    ) returning rider_profile_id into target_rider_id;
  else
    update public.rider_profiles set
      display_name = btrim(display_name_value),
      phone = nullif(btrim(phone_value), ''),
      accessibility_notes = nullif(btrim(accessibility_notes_value), '')
    where rider_profile_id = target_rider_id;
  end if;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    target_tenant_id,
    case when was_created then 'rider.profile_created' else 'rider.profile_updated' end,
    'person', target_person_id, '{}', 'Rider maintained their verified booking profile.',
    gen_random_uuid(), 'rider_profile', target_rider_id::text,
    jsonb_build_object('email', auth_email)
  );
  return target_rider_id;
end;
$$;
revoke all on function public.upsert_my_rider_profile(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.upsert_my_rider_profile(text, text, text, text)
  to authenticated;

create or replace function public.my_rider_portal(target_tenant_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  target_tenant_id uuid;
  target_display_name text;
  rider_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication is required'; end if;

  select config.tenant_id, config.display_name
  into target_tenant_id, target_display_name
  from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  join public.tenant_capabilities capability
    on capability.tenant_id = config.tenant_id
    and capability.capability_key = 'driver.management'
    and capability.enabled
  where config.tenant_slug = lower(btrim(target_tenant_slug))
    and tenant.status = 'active';
  if target_tenant_id is null then raise exception 'booking tenant is unavailable'; end if;

  rider_id := public.current_rider_profile_id(target_tenant_id);

  return jsonb_build_object(
    'tenant', jsonb_build_object(
      'tenantId', target_tenant_id,
      'tenantSlug', lower(btrim(target_tenant_slug)),
      'displayName', target_display_name
    ),
    'profile', (
      select jsonb_build_object(
        'riderProfileId', rider.rider_profile_id,
        'displayName', rider.display_name,
        'email', rider.email,
        'phone', rider.phone,
        'accessibilityNotes', rider.accessibility_notes,
        'status', rider.status
      )
      from public.rider_profiles rider where rider.rider_profile_id = rider_id
    ),
    'serviceAreas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'serviceAreaId', area.service_area_id,
        'name', area.name,
        'description', area.description
      ) order by area.name)
      from public.service_areas area
      where area.tenant_id = target_tenant_id and area.status = 'active'
    ), '[]'::jsonb),
    'bookings', case when rider_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'bookingId', booking.booking_id,
        'serviceAreaId', booking.service_area_id,
        'serviceAreaName', area.name,
        'pickupAddress', booking.pickup_address,
        'destinationAddress', booking.destination_address,
        'bookingNotes', booking.booking_notes,
        'status', booking.status,
        'createdAt', booking.created_at,
        'updatedAt', booking.updated_at,
        'completedAt', booking.completed_at,
        'cancelledAt', booking.cancelled_at,
        'driver', case
          when booking.status in ('accepted', 'arrived', 'in_progress', 'completed')
            and driver.driver_profile_id is not null
          then jsonb_build_object(
            'displayName', driver.display_name,
            'driverNumber', driver.driver_number
          ) else null end,
        'vehicle', case
          when booking.status in ('accepted', 'arrived', 'in_progress', 'completed')
            and vehicle.vehicle_id is not null
          then jsonb_build_object(
            'vehicleNumber', vehicle.vehicle_number,
            'make', vehicle.make,
            'model', vehicle.model,
            'modelYear', vehicle.model_year,
            'color', vehicle.color,
            'licensePlate', vehicle.license_plate
          ) else null end
      ) order by booking.created_at desc)
      from public.dispatch_bookings booking
      join public.service_areas area on area.service_area_id = booking.service_area_id
      left join public.driver_profiles driver
        on driver.driver_profile_id = booking.current_driver_profile_id
      left join public.vehicles vehicle on vehicle.vehicle_id = booking.current_vehicle_id
      where booking.rider_profile_id = rider_id
    ), '[]'::jsonb) end
  );
end;
$$;
revoke all on function public.my_rider_portal(text) from public, anon, authenticated;
grant execute on function public.my_rider_portal(text) to authenticated;

create or replace function public.create_my_rider_booking(
  target_tenant_slug text,
  target_service_area_id uuid,
  pickup_address_value text,
  destination_address_value text,
  booking_notes_value text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target_tenant_id uuid;
  rider public.rider_profiles;
  new_booking_id uuid;
begin
  select config.tenant_id into target_tenant_id
  from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  where config.tenant_slug = lower(btrim(target_tenant_slug))
    and tenant.status = 'active';
  if target_tenant_id is null then raise exception 'booking tenant is unavailable'; end if;

  select * into rider from public.rider_profiles
  where rider_profile_id = public.current_rider_profile_id(target_tenant_id)
  for update;
  if rider.rider_profile_id is null then raise exception 'active rider profile is required'; end if;
  if nullif(btrim(pickup_address_value), '') is null
    or nullif(btrim(destination_address_value), '') is null then
    raise exception 'pickup and destination are required';
  end if;
  if not exists (
    select 1 from public.service_areas area
    where area.tenant_id = target_tenant_id
      and area.service_area_id = target_service_area_id
      and area.status = 'active'
  ) then raise exception 'active service area is required'; end if;

  insert into public.dispatch_bookings (
    tenant_id, service_area_id, rider_profile_id, customer_name, customer_phone,
    pickup_address, destination_address, booking_notes, created_by_person_id
  ) values (
    target_tenant_id, target_service_area_id, rider.rider_profile_id,
    rider.display_name, rider.phone, btrim(pickup_address_value),
    btrim(destination_address_value), nullif(btrim(booking_notes_value), ''),
    rider.person_id
  ) returning booking_id into new_booking_id;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    target_tenant_id, 'rider.booking_created', 'person', rider.person_id, '{}',
    'Verified rider requested a trip.', gen_random_uuid(), 'dispatch_booking',
    new_booking_id::text, jsonb_build_object(
      'rider_profile_id', rider.rider_profile_id,
      'service_area_id', target_service_area_id
    )
  );
  return new_booking_id;
end;
$$;
revoke all on function public.create_my_rider_booking(text, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_my_rider_booking(text, uuid, text, text, text)
  to authenticated;

create or replace function public.cancel_my_rider_booking(target_booking_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  booking public.dispatch_bookings;
  actor_id uuid;
begin
  select * into booking from public.dispatch_bookings
  where booking_id = target_booking_id for update;
  if booking.booking_id is null
    or booking.rider_profile_id is null
    or booking.rider_profile_id <> public.current_rider_profile_id(booking.tenant_id) then
    raise exception 'rider booking was not found';
  end if;
  if booking.status in ('in_progress', 'completed', 'cancelled') then
    raise exception 'booking can no longer be cancelled';
  end if;
  select person_id into actor_id from public.rider_profiles
  where rider_profile_id = booking.rider_profile_id;

  update public.dispatch_offers set
    status = 'cancelled', responded_at = now(), response_notes = 'Cancelled by rider.'
  where booking_id = target_booking_id and status = 'pending';
  update public.dispatch_bookings set
    status = 'cancelled', cancelled_at = now(),
    current_driver_profile_id = null, current_vehicle_id = null
  where booking_id = target_booking_id;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    booking.tenant_id, 'rider.booking_cancelled', 'person', actor_id, '{}',
    'Verified rider cancelled before the trip started.', gen_random_uuid(),
    'dispatch_booking', target_booking_id::text,
    jsonb_build_object('previous_status', booking.status)
  );
  return true;
end;
$$;
revoke all on function public.cancel_my_rider_booking(uuid) from public, anon, authenticated;
grant execute on function public.cancel_my_rider_booking(uuid) to authenticated;
