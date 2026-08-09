-- Permanent booking coordinates for embedded maps, routing, and ETA.

alter table public.dispatch_bookings
  add column pickup_latitude double precision,
  add column pickup_longitude double precision,
  add column destination_latitude double precision,
  add column destination_longitude double precision,
  add column geocoding_provider text,
  add column geocoded_at timestamptz,
  add constraint dispatch_bookings_pickup_latitude_check
    check (pickup_latitude is null or pickup_latitude between -90 and 90),
  add constraint dispatch_bookings_pickup_longitude_check
    check (pickup_longitude is null or pickup_longitude between -180 and 180),
  add constraint dispatch_bookings_destination_latitude_check
    check (destination_latitude is null or destination_latitude between -90 and 90),
  add constraint dispatch_bookings_destination_longitude_check
    check (destination_longitude is null or destination_longitude between -180 and 180),
  add constraint dispatch_bookings_geocoding_payload_check check (
    (pickup_latitude is null and pickup_longitude is null
      and destination_latitude is null and destination_longitude is null
      and geocoding_provider is null and geocoded_at is null)
    or (pickup_latitude is not null and pickup_longitude is not null
      and destination_latitude is not null and destination_longitude is not null
      and geocoding_provider is not null and geocoded_at is not null)
  );

create or replace function public.set_dispatch_booking_coordinates(
  target_booking_id uuid,
  pickup_latitude_value double precision,
  pickup_longitude_value double precision,
  destination_latitude_value double precision,
  destination_longitude_value double precision,
  geocoding_provider_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  booking public.dispatch_bookings;
  actor_id uuid := public.current_person_id();
  rider_id uuid;
  area public.service_areas;
  pickup_distance_km double precision;
begin
  select * into booking from public.dispatch_bookings
  where booking_id = target_booking_id for update;
  if booking.booking_id is null then raise exception 'booking is unavailable'; end if;
  rider_id := public.current_rider_profile_id(booking.tenant_id);
  if not public.can_manage_dispatch(booking.tenant_id)
    and (rider_id is null or booking.rider_profile_id is distinct from rider_id)
  then raise exception 'booking access is required'; end if;
  if pickup_latitude_value not between -90 and 90
    or destination_latitude_value not between -90 and 90
    or pickup_longitude_value not between -180 and 180
    or destination_longitude_value not between -180 and 180
    or nullif(btrim(geocoding_provider_value), '') is null
  then raise exception 'valid booking coordinates are required'; end if;
  select * into area from public.service_areas where service_area_id = booking.service_area_id;
  pickup_distance_km := 6371 * 2 * asin(least(1, sqrt(
    power(sin(radians(pickup_latitude_value - area.center_latitude) / 2), 2)
    + cos(radians(area.center_latitude)) * cos(radians(pickup_latitude_value))
    * power(sin(radians(pickup_longitude_value - area.center_longitude) / 2), 2)
  )));
  if pickup_distance_km > area.radius_km then
    raise exception 'pickup address is outside the selected service area';
  end if;
  update public.dispatch_bookings set
    pickup_latitude = pickup_latitude_value,
    pickup_longitude = pickup_longitude_value,
    destination_latitude = destination_latitude_value,
    destination_longitude = destination_longitude_value,
    geocoding_provider = btrim(geocoding_provider_value),
    geocoded_at = now()
  where booking_id = target_booking_id;
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    booking.tenant_id, 'dispatch.booking_geocoded', 'person', actor_id, '{}',
    'Booking addresses were resolved for routing.', gen_random_uuid(),
    'dispatch_booking', booking.booking_id::text,
    jsonb_build_object('provider', btrim(geocoding_provider_value))
  );
  return true;
end;
$$;

revoke all on function public.set_dispatch_booking_coordinates(
  uuid, double precision, double precision, double precision, double precision, text
) from public, anon, authenticated;
grant execute on function public.set_dispatch_booking_coordinates(
  uuid, double precision, double precision, double precision, double precision, text
) to authenticated;

create or replace function public.my_driver_dispatch()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  driver_id uuid := public.current_driver_profile_id();
  driver_tenant_id uuid;
  result jsonb;
begin
  select tenant_id into driver_tenant_id from public.driver_profiles where driver_profile_id = driver_id;
  if driver_id is null or driver_tenant_id is null then raise exception 'driver profile is unavailable'; end if;
  perform public.expire_dispatch_offers(driver_tenant_id);
  select jsonb_build_object(
    'offers', coalesce((select jsonb_agg(jsonb_build_object(
      'offerId', offer.offer_id, 'bookingId', booking.booking_id,
      'customerName', booking.customer_name, 'customerPhone', booking.customer_phone,
      'pickupAddress', booking.pickup_address, 'destinationAddress', booking.destination_address,
      'notes', booking.booking_notes, 'serviceAreaName', area.name, 'status', offer.status,
      'offeredAt', offer.offered_at, 'expiresAt', offer.expires_at
    ) order by offer.offered_at desc) from public.dispatch_offers offer
      join public.dispatch_bookings booking on booking.booking_id = offer.booking_id
      join public.service_areas area on area.service_area_id = booking.service_area_id
      where offer.driver_profile_id = driver_id and offer.status = 'pending'), '[]'::jsonb),
    'trips', coalesce((select jsonb_agg(jsonb_build_object(
      'bookingId', booking.booking_id, 'customerName', booking.customer_name,
      'customerPhone', booking.customer_phone, 'pickupAddress', booking.pickup_address,
      'destinationAddress', booking.destination_address, 'notes', booking.booking_notes,
      'serviceAreaName', area.name, 'status', booking.status,
      'pickupLatitude', booking.pickup_latitude, 'pickupLongitude', booking.pickup_longitude,
      'destinationLatitude', booking.destination_latitude, 'destinationLongitude', booking.destination_longitude
    ) order by booking.updated_at desc) from public.dispatch_bookings booking
      join public.service_areas area on area.service_area_id = booking.service_area_id
      where booking.current_driver_profile_id = driver_id
        and booking.status in ('accepted', 'arrived', 'in_progress')), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
