-- Reject impossible GPS jumps from trusted fare calculations.
alter table public.trip_route_metrics
  add column if not exists telemetry_status text not null default 'trusted',
  add column if not exists invalid_segment_count integer not null default 0,
  add column if not exists last_segment_speed_mps double precision,
  add constraint trip_route_metrics_telemetry_status_check
    check (telemetry_status in ('trusted', 'suspect'));

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
  active_trip public.dispatch_bookings;
  existing_metrics public.trip_route_metrics;
  distance_km double precision;
  segment_meters double precision := 0;
  elapsed_seconds double precision := 0;
  segment_speed_mps double precision := 0;
  plausible_segment_meters double precision := 0;
  segment_is_suspect boolean := false;
begin
  select profile.* into driver from public.driver_profiles profile
  where profile.driver_profile_id = public.current_driver_profile_id() for update;
  if driver.driver_profile_id is null then raise exception 'driver profile is unavailable'; end if;
  select * into availability from public.driver_availability where driver_profile_id = driver.driver_profile_id;
  if availability.requested_status <> 'online' then raise exception 'driver must be online'; end if;
  if not exists (select 1 from public.driver_locations location where location.driver_profile_id = driver.driver_profile_id and location.sharing_enabled)
    then raise exception 'location sharing is not enabled'; end if;
  if latitude_value not between -90 and 90 or longitude_value not between -180 and 180 or accuracy_meters_value not between 0 and 5000
    then raise exception 'location is invalid'; end if;
  if recorded_at_value < now() - interval '2 minutes' or recorded_at_value > now() + interval '30 seconds'
    then raise exception 'location reading is stale'; end if;
  select * into area from public.service_areas where service_area_id = availability.selected_service_area_id and status = 'active';
  if area.service_area_id is null then raise exception 'selected service area is unavailable'; end if;
  distance_km := 6371 * 2 * asin(least(1, sqrt(power(sin(radians(latitude_value - area.center_latitude) / 2), 2) + cos(radians(area.center_latitude)) * cos(radians(latitude_value)) * power(sin(radians(longitude_value - area.center_longitude) / 2), 2))));
  if distance_km > area.radius_km + (accuracy_meters_value / 1000.0) then raise exception 'location is outside the selected service area'; end if;
  select * into active_trip from public.dispatch_bookings where current_driver_profile_id = driver.driver_profile_id and status = 'in_progress' limit 1;
  if active_trip.booking_id is not null then
    select * into existing_metrics from public.trip_route_metrics where booking_id = active_trip.booking_id;
    if existing_metrics.last_latitude is not null and existing_metrics.last_longitude is not null then
      segment_meters := 6371000 * 2 * asin(least(1, sqrt(
        power(sin(radians(latitude_value - existing_metrics.last_latitude) / 2), 2)
        + cos(radians(existing_metrics.last_latitude)) * cos(radians(latitude_value))
        * power(sin(radians(longitude_value - existing_metrics.last_longitude) / 2), 2)
      )));
      elapsed_seconds := greatest(0, extract(epoch from (recorded_at_value - existing_metrics.last_recorded_at)));
      if elapsed_seconds > 0 then segment_speed_mps := segment_meters / elapsed_seconds; end if;
      -- 60 m/s (~216 km/h) is deliberately generous; accuracy is added as a bounded buffer.
      plausible_segment_meters := greatest(500, accuracy_meters_value + (60 * elapsed_seconds));
      segment_is_suspect := segment_meters > plausible_segment_meters or elapsed_seconds <= 0;
    end if;
    insert into public.trip_route_metrics (
      booking_id, tenant_id, driver_profile_id, distance_meters, last_recorded_at,
      last_latitude, last_longitude, telemetry_status, invalid_segment_count,
      last_segment_speed_mps
    ) values (
      active_trip.booking_id, active_trip.tenant_id, driver.driver_profile_id, 0,
      recorded_at_value, latitude_value, longitude_value,
      case when segment_is_suspect then 'suspect' else 'trusted' end,
      case when segment_is_suspect then 1 else 0 end, segment_speed_mps
    ) on conflict (booking_id) do update set
      distance_meters = case
        when trip_route_metrics.telemetry_status = 'trusted' and not segment_is_suspect
          then trip_route_metrics.distance_meters + least(2000, greatest(0, segment_meters))
        else trip_route_metrics.distance_meters
      end,
      last_recorded_at = recorded_at_value,
      last_latitude = latitude_value,
      last_longitude = longitude_value,
      telemetry_status = case when segment_is_suspect then 'suspect' else trip_route_metrics.telemetry_status end,
      invalid_segment_count = trip_route_metrics.invalid_segment_count + case when segment_is_suspect then 1 else 0 end,
      last_segment_speed_mps = segment_speed_mps;
  end if;
  update public.driver_locations set service_area_id = area.service_area_id, latitude = latitude_value, longitude = longitude_value, accuracy_meters = accuracy_meters_value, recorded_at = recorded_at_value where driver_profile_id = driver.driver_profile_id and sharing_enabled;
  return public.my_driver_location_sharing();
end;
$$;

create or replace function public.capture_completed_trip_route_metrics()
returns trigger language plpgsql security definer set search_path = public as $$
declare metrics public.trip_route_metrics;
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    select * into metrics from public.trip_route_metrics where booking_id = new.booking_id;
    if metrics.booking_id is not null and metrics.telemetry_status = 'trusted' then
      update public.dispatch_bookings set actual_route_distance_meters = greatest(metrics.distance_meters, 1), actual_route_duration_seconds = greatest(1, extract(epoch from (coalesce(new.completed_at, now()) - metrics.started_at))::integer), route_metrics_source = 'driver_location_aggregate' where booking_id = new.booking_id;
    elsif metrics.booking_id is not null then
      update public.dispatch_bookings set route_metrics_source = 'driver_location_aggregate_untrusted' where booking_id = new.booking_id;
    end if;
  end if;
  return new;
end;
$$;
