-- Remove an ambiguous tenant_slug identifier from priced Rider booking confirmation.

create or replace function public.create_my_rider_priced_booking(
  target_quote_id uuid,
  booking_notes_value text default null,
  scheduled_pickup_at_value timestamptz default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare quote public.trip_price_quotes; rider_id uuid; target_tenant_slug text; new_booking_id uuid;
begin
  select * into quote from public.trip_price_quotes where quote_id = target_quote_id for update;
  if quote.quote_id is null or quote.status <> 'quoted' or quote.expires_at <= now()
    then raise exception 'price quote has expired; calculate a new fare'; end if;
  rider_id := public.current_rider_profile_id(quote.tenant_id);
  if rider_id is null or rider_id <> quote.rider_profile_id then raise exception 'Rider quote access is required'; end if;
  select config.tenant_slug into target_tenant_slug
  from public.tenant_configurations config where config.tenant_id = quote.tenant_id;
  if target_tenant_slug is null then raise exception 'booking tenant is unavailable'; end if;
  if scheduled_pickup_at_value is null then
    new_booking_id := public.create_my_rider_geocoded_booking(target_tenant_slug, quote.service_area_id,
      quote.pickup_address, quote.destination_address, quote.pickup_latitude, quote.pickup_longitude,
      quote.destination_latitude, quote.destination_longitude, 'mapbox-v6', booking_notes_value);
  else
    new_booking_id := public.create_my_rider_geocoded_scheduled_booking(target_tenant_slug, quote.service_area_id,
      quote.pickup_address, quote.destination_address, scheduled_pickup_at_value,
      quote.pickup_latitude, quote.pickup_longitude, quote.destination_latitude,
      quote.destination_longitude, 'mapbox-v6', booking_notes_value);
  end if;
  update public.dispatch_bookings set price_quote_id = quote.quote_id,
    fare_currency_code = quote.currency_code, estimated_fare_minor = quote.fare_amount_minor,
    final_fare_minor = quote.fare_amount_minor, route_distance_meters = quote.route_distance_meters,
    route_duration_seconds = quote.route_duration_seconds where booking_id = new_booking_id;
  update public.trip_price_quotes set status = 'booked', booking_id = new_booking_id where quote_id = quote.quote_id;
  return new_booking_id;
end;
$$;

revoke all on function public.create_my_rider_priced_booking(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_my_rider_priced_booking(uuid, text, timestamptz)
  to authenticated;
