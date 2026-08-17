-- Allow a server-verified Google Routes estimate when Mapbox reports an
-- unnamed toll facility that cannot be resolved to the ESH catalog.

create or replace function public.create_rider_price_quote_internal(
  target_rider_profile_id uuid,
  target_service_area_id uuid,
  pickup_address_value text,
  destination_address_value text,
  pickup_latitude_value double precision,
  pickup_longitude_value double precision,
  destination_latitude_value double precision,
  destination_longitude_value double precision,
  route_distance_meters_value integer,
  route_duration_seconds_value integer,
  toll_amount_minor_value bigint,
  toll_snapshot_value jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rider public.rider_profiles;
  settings public.tenant_pricing_settings;
  new_quote_id uuid;
  base_fare_minor bigint;
  fare_minor bigint;
  snapshot_total_minor bigint := 0;
  toll_line jsonb;
  rate_amount_minor bigint;
  rate_currency_code text;
  rate_id_value uuid;
  rate_facility_id uuid;
  line_facility_id uuid;
  line_source text;
begin
  select * into rider from public.rider_profiles
    where rider_profile_id = target_rider_profile_id and status = 'active';
  if rider.rider_profile_id is null then raise exception 'active Rider profile is required'; end if;
  select * into settings from public.tenant_pricing_settings
    where tenant_id = rider.tenant_id and pricing_enabled;
  if settings.tenant_id is null then raise exception 'trip pricing is unavailable for this provider'; end if;
  if not exists (select 1 from public.service_areas where tenant_id = rider.tenant_id
    and service_area_id = target_service_area_id and status = 'active')
    then raise exception 'active service area is required'; end if;
  if route_distance_meters_value not between 1 and 1000000
    or route_duration_seconds_value not between 1 and 172800
    then raise exception 'valid route distance and duration are required'; end if;
  if toll_amount_minor_value < 0 or toll_amount_minor_value > 1000000
    then raise exception 'valid nonnegative toll amount is required'; end if;
  if jsonb_typeof(toll_snapshot_value) <> 'array'
    then raise exception 'toll snapshot must be an array'; end if;

  for toll_line in select value from jsonb_array_elements(toll_snapshot_value) loop
    line_source := toll_line->>'source';
    if line_source = 'google_routes' then
      if coalesce(toll_line->>'currencyCode', '') <> settings.currency_code
        or coalesce((toll_line->>'amountMinor')::bigint, -1) <= 0
        or coalesce(toll_line->>'estimated', 'false') <> 'true'
      then raise exception 'Google toll estimate is invalid'; end if;
      snapshot_total_minor := snapshot_total_minor + (toll_line->>'amountMinor')::bigint;
      continue;
    end if;
    begin
      rate_id_value := (toll_line->>'rateId')::uuid;
      line_facility_id := (toll_line->>'facilityId')::uuid;
    exception when invalid_text_representation then
      raise exception 'toll snapshot contains an invalid catalog reference';
    end;
    select rate.amount_minor, rate.currency_code, rate.facility_id
      into rate_amount_minor, rate_currency_code, rate_facility_id
    from public.toll_rates rate
    join public.toll_facilities facility on facility.facility_id = rate.facility_id and facility.active
    join public.toll_authorities authority on authority.authority_id = facility.authority_id and authority.active
    where rate.rate_id = rate_id_value
      and rate.effective_from <= current_date
      and (rate.effective_to is null or current_date < rate.effective_to);
    if rate_amount_minor is null then raise exception 'toll snapshot references an unavailable rate'; end if;
    if line_facility_id <> rate_facility_id then raise exception 'toll snapshot facility does not match the configured rate'; end if;
    if rate_currency_code <> settings.currency_code then raise exception 'toll currency does not match provider currency'; end if;
    if coalesce(toll_line->>'currencyCode', '') <> rate_currency_code then raise exception 'toll snapshot currency does not match the configured rate'; end if;
    if coalesce((toll_line->>'amountMinor')::bigint, -1) <> rate_amount_minor then raise exception 'toll snapshot amount does not match the configured rate'; end if;
    snapshot_total_minor := snapshot_total_minor + rate_amount_minor;
  end loop;
  if snapshot_total_minor <> toll_amount_minor_value then raise exception 'toll amount does not match the configured rates'; end if;

  base_fare_minor := greatest(settings.minimum_fare_minor,
    settings.base_fare_minor
    + round(route_distance_meters_value::numeric * settings.per_mile_minor / 1609.344)::bigint
    + round(route_duration_seconds_value::numeric * settings.per_minute_minor / 60)::bigint);
  fare_minor := base_fare_minor + toll_amount_minor_value;
  if fare_minor <= 0 then raise exception 'calculated fare must be positive'; end if;
  insert into public.trip_price_quotes (
    tenant_id, rider_profile_id, service_area_id, pickup_address, destination_address,
    pickup_latitude, pickup_longitude, destination_latitude, destination_longitude,
    route_distance_meters, route_duration_seconds, currency_code, fare_amount_minor,
    pricing_snapshot, expires_at
  ) values (
    rider.tenant_id, rider.rider_profile_id, target_service_area_id, btrim(pickup_address_value),
    btrim(destination_address_value), pickup_latitude_value, pickup_longitude_value,
    destination_latitude_value, destination_longitude_value, route_distance_meters_value,
    route_duration_seconds_value, settings.currency_code, fare_minor,
    jsonb_build_object('schemaVersion', 2, 'baseFareMinor', settings.base_fare_minor,
      'perMileMinor', settings.per_mile_minor, 'perMinuteMinor', settings.per_minute_minor,
      'minimumFareMinor', settings.minimum_fare_minor, 'tollAmountMinor', toll_amount_minor_value,
      'tolls', toll_snapshot_value), now() + interval '15 minutes'
  ) returning quote_id into new_quote_id;
  return jsonb_build_object('quoteId', new_quote_id, 'fareAmountMinor', fare_minor,
    'baseFareAmountMinor', base_fare_minor, 'tollAmountMinor', toll_amount_minor_value,
    'tolls', toll_snapshot_value, 'currencyCode', settings.currency_code,
    'expiresAt', now() + interval '15 minutes', 'pickupAddress', btrim(pickup_address_value),
    'destinationAddress', btrim(destination_address_value), 'routeDistanceMeters', route_distance_meters_value,
    'routeDurationSeconds', route_duration_seconds_value);
end;
$$;

revoke all on function public.create_rider_price_quote_internal(
  uuid, uuid, text, text, double precision, double precision, double precision, double precision,
  integer, integer, bigint, jsonb
) from public, anon, authenticated;
grant execute on function public.create_rider_price_quote_internal(
  uuid, uuid, text, text, double precision, double precision, double precision, double precision,
  integer, integer, bigint, jsonb
) to service_role;
