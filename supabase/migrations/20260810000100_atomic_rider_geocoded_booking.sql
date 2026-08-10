-- Rider bookings and their permanent map coordinates must commit or roll back together.

create or replace function public.create_my_rider_geocoded_booking(
  target_tenant_slug text,
  target_service_area_id uuid,
  pickup_address_value text,
  destination_address_value text,
  pickup_latitude_value double precision,
  pickup_longitude_value double precision,
  destination_latitude_value double precision,
  destination_longitude_value double precision,
  geocoding_provider_value text,
  booking_notes_value text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_booking_id uuid;
begin
  new_booking_id := public.create_my_rider_booking(
    target_tenant_slug,
    target_service_area_id,
    pickup_address_value,
    destination_address_value,
    booking_notes_value
  );
  perform public.set_dispatch_booking_coordinates(
    new_booking_id,
    pickup_latitude_value,
    pickup_longitude_value,
    destination_latitude_value,
    destination_longitude_value,
    geocoding_provider_value
  );
  return new_booking_id;
end;
$$;

create or replace function public.create_my_rider_geocoded_scheduled_booking(
  target_tenant_slug text,
  target_service_area_id uuid,
  pickup_address_value text,
  destination_address_value text,
  scheduled_pickup_at_value timestamptz,
  pickup_latitude_value double precision,
  pickup_longitude_value double precision,
  destination_latitude_value double precision,
  destination_longitude_value double precision,
  geocoding_provider_value text,
  booking_notes_value text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_booking_id uuid;
begin
  new_booking_id := public.create_my_rider_scheduled_booking(
    target_tenant_slug,
    target_service_area_id,
    pickup_address_value,
    destination_address_value,
    scheduled_pickup_at_value,
    booking_notes_value
  );
  perform public.set_dispatch_booking_coordinates(
    new_booking_id,
    pickup_latitude_value,
    pickup_longitude_value,
    destination_latitude_value,
    destination_longitude_value,
    geocoding_provider_value
  );
  return new_booking_id;
end;
$$;

revoke all on function public.create_my_rider_booking(text, uuid, text, text, text)
  from authenticated;
revoke all on function public.create_my_rider_scheduled_booking(text, uuid, text, text, timestamptz, text)
  from authenticated;
revoke all on function public.create_my_rider_geocoded_booking(
  text, uuid, text, text, double precision, double precision,
  double precision, double precision, text, text
) from public, anon, authenticated;
revoke all on function public.create_my_rider_geocoded_scheduled_booking(
  text, uuid, text, text, timestamptz, double precision, double precision,
  double precision, double precision, text, text
) from public, anon, authenticated;
grant execute on function public.create_my_rider_geocoded_booking(
  text, uuid, text, text, double precision, double precision,
  double precision, double precision, text, text
) to authenticated;
grant execute on function public.create_my_rider_geocoded_scheduled_booking(
  text, uuid, text, text, timestamptz, double precision, double precision,
  double precision, double precision, text, text
) to authenticated;
