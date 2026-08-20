-- Remove the ambiguous overloaded quote RPC. Keep the deployed legacy function and expose
-- service-type pricing through a distinct name.

drop function if exists public.create_rider_price_quote_internal(
  uuid, uuid, text, text, double precision, double precision, double precision, double precision,
  integer, integer, integer, jsonb, text
);

create or replace function public.create_rider_price_quote_with_service_type(
  target_rider_profile_id uuid, target_service_area_id uuid, pickup_address_value text, destination_address_value text,
  pickup_latitude_value double precision, pickup_longitude_value double precision, destination_latitude_value double precision,
  destination_longitude_value double precision, route_distance_meters_value integer, route_duration_seconds_value integer,
  toll_amount_minor_value integer, toll_snapshot_value jsonb, service_type_value text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare base_quote jsonb; quote_id_value uuid; settings public.tenant_pricing_settings; normalized text := lower(btrim(coalesce(service_type_value, 'standard'))); surcharge bigint;
begin
  if normalized not in ('standard', 'larger', 'premium', 'accessible') then raise exception 'unsupported vehicle service type'; end if;
  base_quote := public.create_rider_price_quote_internal(target_rider_profile_id, target_service_area_id, pickup_address_value, destination_address_value, pickup_latitude_value, pickup_longitude_value, destination_latitude_value, destination_longitude_value, route_distance_meters_value, route_duration_seconds_value, toll_amount_minor_value, toll_snapshot_value);
  quote_id_value := (base_quote->>'quoteId')::uuid;
  select pricing.* into settings from public.tenant_pricing_settings pricing where pricing.tenant_id = (select profile.tenant_id from public.rider_profiles profile where profile.rider_profile_id = target_rider_profile_id);
  surcharge := coalesce((settings.service_type_surcharges ->> normalized)::bigint, 0);
  update public.trip_price_quotes set service_type = normalized, fare_amount_minor = greatest(1, fare_amount_minor + surcharge), pricing_snapshot = pricing_snapshot || jsonb_build_object('serviceType', normalized, 'serviceTypeSurchargeMinor', surcharge) where quote_id = quote_id_value;
  return base_quote || jsonb_build_object('fareAmountMinor', (select fare_amount_minor from public.trip_price_quotes where quote_id = quote_id_value), 'serviceType', normalized, 'serviceTypeSurchargeMinor', surcharge);
end;
$$;

revoke all on function public.create_rider_price_quote_with_service_type(uuid, uuid, text, text, double precision, double precision, double precision, double precision, integer, integer, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_rider_price_quote_with_service_type(uuid, uuid, text, text, double precision, double precision, double precision, double precision, integer, integer, integer, jsonb, text) to service_role;
