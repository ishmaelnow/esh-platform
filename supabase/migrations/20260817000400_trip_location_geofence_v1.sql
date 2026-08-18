-- Require Drivers to be within a 250-meter default geofence before arrival/completion.
create or replace function public.advance_my_trip(
  target_booking_id uuid,
  target_action text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  driver_id uuid := public.current_driver_profile_id();
  target_booking public.dispatch_bookings;
  current_location public.driver_locations;
  next_status text;
  target_latitude double precision;
  target_longitude double precision;
  distance_meters double precision;
  allowed_radius_meters double precision;
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
  if target_action in ('arrive', 'complete') then
    select * into current_location from public.driver_locations
    where driver_profile_id = driver_id and sharing_enabled;
    if current_location.driver_profile_id is null or current_location.latitude is null
      or current_location.longitude is null or current_location.recorded_at is null
      or current_location.recorded_at < now() - interval '2 minutes' then
      raise exception 'fresh live location is required before marking this trip';
    end if;
    if target_action = 'arrive' then
      target_latitude := target_booking.pickup_latitude;
      target_longitude := target_booking.pickup_longitude;
    else
      target_latitude := target_booking.destination_latitude;
      target_longitude := target_booking.destination_longitude;
    end if;
    if target_latitude is null or target_longitude is null then
      raise exception 'trip location coordinates are unavailable';
    end if;
    distance_meters := 6371000 * 2 * asin(least(1, sqrt(
      power(sin(radians(current_location.latitude - target_latitude) / 2), 2)
      + cos(radians(target_latitude)) * cos(radians(current_location.latitude))
      * power(sin(radians(current_location.longitude - target_longitude) / 2), 2)
    )));
    allowed_radius_meters := greatest(250, coalesce(current_location.accuracy_meters, 0) * 2);
    if distance_meters > allowed_radius_meters then
      raise exception '% location must be within 250 meters of the %.',
        case when target_action = 'arrive' then 'Pickup' else 'Destination' end,
        case when target_action = 'arrive' then 'pickup' else 'destination' end;
    end if;
  end if;
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
