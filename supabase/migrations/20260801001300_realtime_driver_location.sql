-- Privacy-bounded current Driver location for dispatch and accepted Rider trips.

create table public.driver_locations (
  driver_profile_id uuid primary key,
  tenant_id uuid not null,
  service_area_id uuid,
  sharing_enabled boolean not null default false,
  consented_at timestamptz,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  recorded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint driver_locations_driver_fk foreign key (tenant_id, driver_profile_id)
    references public.driver_profiles (tenant_id, driver_profile_id) on delete cascade,
  constraint driver_locations_area_fk foreign key (tenant_id, service_area_id)
    references public.service_areas (tenant_id, service_area_id),
  constraint driver_locations_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint driver_locations_longitude_check check (longitude is null or longitude between -180 and 180),
  constraint driver_locations_accuracy_check check (accuracy_meters is null or accuracy_meters between 0 and 5000),
  constraint driver_locations_payload_check check (
    (latitude is null and longitude is null and accuracy_meters is null and recorded_at is null)
    or (latitude is not null and longitude is not null and accuracy_meters is not null and recorded_at is not null)
  )
);
create index driver_locations_tenant_sharing_idx
  on public.driver_locations (tenant_id, sharing_enabled, recorded_at desc);
create trigger driver_locations_set_updated_at before update on public.driver_locations
  for each row execute function public.set_updated_at();

alter table public.driver_locations enable row level security;
create policy driver_locations_admin_select on public.driver_locations
  for select to authenticated using (public.can_manage_dispatch(tenant_id));
grant select on public.driver_locations to authenticated;
grant all on public.driver_locations to service_role;

create or replace function public.my_driver_location_sharing()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare driver_id uuid := public.current_driver_profile_id(); result public.driver_locations;
begin
  if driver_id is null then raise exception 'driver profile is unavailable'; end if;
  select * into result from public.driver_locations where driver_profile_id = driver_id;
  return jsonb_build_object(
    'sharingEnabled', coalesce(result.sharing_enabled, false),
    'consentedAt', result.consented_at,
    'latitude', result.latitude,
    'longitude', result.longitude,
    'accuracyMeters', result.accuracy_meters,
    'recordedAt', result.recorded_at
  );
end;
$$;

create or replace function public.set_my_driver_location_sharing(enabled_value boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  driver public.driver_profiles;
  availability public.driver_availability;
  previous_enabled boolean;
begin
  select profile.* into driver from public.driver_profiles profile
  where profile.driver_profile_id = public.current_driver_profile_id() for update;
  if driver.driver_profile_id is null then raise exception 'driver profile is unavailable'; end if;
  select * into availability from public.driver_availability
  where driver_profile_id = driver.driver_profile_id;
  if enabled_value and availability.requested_status <> 'online' then
    raise exception 'go online before enabling location sharing';
  end if;
  if enabled_value and cardinality(public.driver_service_blockers(driver.driver_profile_id)) > 0 then
    raise exception 'driver is not eligible for live service';
  end if;
  select sharing_enabled into previous_enabled from public.driver_locations
  where driver_profile_id = driver.driver_profile_id;
  insert into public.driver_locations (
    driver_profile_id, tenant_id, service_area_id, sharing_enabled, consented_at
  ) values (
    driver.driver_profile_id, driver.tenant_id, availability.selected_service_area_id,
    enabled_value, case when enabled_value then now() end
  ) on conflict (driver_profile_id) do update set
    service_area_id = excluded.service_area_id,
    sharing_enabled = excluded.sharing_enabled,
    consented_at = case when enabled_value then now()
      else driver_locations.consented_at end,
    latitude = case when enabled_value then driver_locations.latitude else null end,
    longitude = case when enabled_value then driver_locations.longitude else null end,
    accuracy_meters = case when enabled_value then driver_locations.accuracy_meters else null end,
    recorded_at = case when enabled_value then driver_locations.recorded_at else null end;
  if previous_enabled is distinct from enabled_value then
    insert into public.tenant_audit_events (
      tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
      correlation_id, resource_type, resource_id, metadata
    ) values (
      driver.tenant_id, case when enabled_value then 'driver.location_sharing_enabled'
        else 'driver.location_sharing_disabled' end,
      'person', driver.person_id, '{}', 'Driver changed live location sharing.',
      gen_random_uuid(), 'driver_profile', driver.driver_profile_id::text,
      jsonb_build_object('sharing_enabled', enabled_value)
    );
  end if;
  return public.my_driver_location_sharing();
end;
$$;

create or replace function public.update_my_driver_location(
  latitude_value double precision,
  longitude_value double precision,
  accuracy_meters_value double precision,
  recorded_at_value timestamptz
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  driver public.driver_profiles;
  availability public.driver_availability;
  area public.service_areas;
  distance_km double precision;
begin
  select profile.* into driver from public.driver_profiles profile
  where profile.driver_profile_id = public.current_driver_profile_id() for update;
  if driver.driver_profile_id is null then raise exception 'driver profile is unavailable'; end if;
  select * into availability from public.driver_availability
  where driver_profile_id = driver.driver_profile_id;
  if availability.requested_status <> 'online' then raise exception 'driver must be online'; end if;
  if not exists (select 1 from public.driver_locations location
    where location.driver_profile_id = driver.driver_profile_id and location.sharing_enabled)
  then raise exception 'location sharing is not enabled'; end if;
  if latitude_value not between -90 and 90 or longitude_value not between -180 and 180
    or accuracy_meters_value not between 0 and 5000 then raise exception 'location is invalid'; end if;
  if recorded_at_value < now() - interval '2 minutes' or recorded_at_value > now() + interval '30 seconds'
  then raise exception 'location reading is stale'; end if;
  select * into area from public.service_areas
  where service_area_id = availability.selected_service_area_id and status = 'active';
  if area.service_area_id is null then raise exception 'selected service area is unavailable'; end if;
  distance_km := 6371 * 2 * asin(least(1, sqrt(
    power(sin(radians(latitude_value - area.center_latitude) / 2), 2)
    + cos(radians(area.center_latitude)) * cos(radians(latitude_value))
    * power(sin(radians(longitude_value - area.center_longitude) / 2), 2)
  )));
  if distance_km > area.radius_km + (accuracy_meters_value / 1000.0) then
    raise exception 'location is outside the selected service area';
  end if;
  update public.driver_locations set
    service_area_id = area.service_area_id, latitude = latitude_value,
    longitude = longitude_value, accuracy_meters = accuracy_meters_value,
    recorded_at = recorded_at_value
  where driver_profile_id = driver.driver_profile_id and sharing_enabled;
  return public.my_driver_location_sharing();
end;
$$;

create or replace function public.stop_driver_location_sharing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'driver_availability' and new.requested_status = 'offline'
    and old.requested_status is distinct from 'offline' then
    update public.driver_locations set sharing_enabled = false, latitude = null, longitude = null,
      accuracy_meters = null, recorded_at = null
    where driver_profile_id = new.driver_profile_id and sharing_enabled;
    if found then
      insert into public.tenant_audit_events (
        tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
        correlation_id, resource_type, resource_id, metadata
      ) values (
        new.tenant_id, 'driver.location_sharing_stopped', 'platform_system', null, '{}',
        'Location sharing stopped because the Driver went offline.', gen_random_uuid(),
        'driver_profile', new.driver_profile_id::text, jsonb_build_object('cause', 'offline')
      );
    end if;
  elsif tg_table_name = 'dispatch_bookings' and new.status in ('completed', 'cancelled')
    and old.status is distinct from new.status and new.current_driver_profile_id is not null then
    update public.driver_locations set sharing_enabled = false, latitude = null, longitude = null,
      accuracy_meters = null, recorded_at = null
    where driver_profile_id = new.current_driver_profile_id and sharing_enabled;
    if found then
      insert into public.tenant_audit_events (
        tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
        correlation_id, resource_type, resource_id, metadata
      ) values (
        new.tenant_id, 'driver.location_sharing_stopped', 'platform_system', null, '{}',
        'Location sharing stopped because the trip ended.', gen_random_uuid(),
        'driver_profile', new.current_driver_profile_id::text,
        jsonb_build_object('cause', new.status, 'booking_id', new.booking_id)
      );
    end if;
  end if;
  return new;
end;
$$;
create trigger driver_availability_stop_location after update of requested_status
  on public.driver_availability for each row execute function public.stop_driver_location_sharing();
create trigger dispatch_bookings_stop_location after update of status
  on public.dispatch_bookings for each row execute function public.stop_driver_location_sharing();

create or replace function public.my_rider_trip_locations(target_tenant_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare target_tenant_id uuid; rider_id uuid;
begin
  select config.tenant_id into target_tenant_id from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id and tenant.status = 'active'
  where config.tenant_slug = lower(btrim(target_tenant_slug));
  if target_tenant_id is null then raise exception 'booking tenant is unavailable'; end if;
  rider_id := public.current_rider_profile_id(target_tenant_id);
  if rider_id is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'bookingId', booking.booking_id, 'latitude', location.latitude,
    'longitude', location.longitude, 'accuracyMeters', location.accuracy_meters,
    'recordedAt', location.recorded_at,
    'fresh', location.recorded_at >= now() - interval '60 seconds'
  )) from public.dispatch_bookings booking
  join public.driver_locations location
    on location.driver_profile_id = booking.current_driver_profile_id
    and location.tenant_id = booking.tenant_id
  where booking.rider_profile_id = rider_id
    and booking.status in ('accepted', 'arrived', 'in_progress')
    and location.sharing_enabled and location.latitude is not null), '[]'::jsonb);
end;
$$;

revoke all on function public.my_driver_location_sharing() from public, anon, authenticated;
revoke all on function public.set_my_driver_location_sharing(boolean) from public, anon, authenticated;
revoke all on function public.update_my_driver_location(double precision, double precision, double precision, timestamptz) from public, anon, authenticated;
revoke all on function public.stop_driver_location_sharing() from public, anon, authenticated;
revoke all on function public.my_rider_trip_locations(text) from public, anon, authenticated;
grant execute on function public.my_driver_location_sharing() to authenticated;
grant execute on function public.set_my_driver_location_sharing(boolean) to authenticated;
grant execute on function public.update_my_driver_location(double precision, double precision, double precision, timestamptz) to authenticated;
grant execute on function public.my_rider_trip_locations(text) to authenticated;
