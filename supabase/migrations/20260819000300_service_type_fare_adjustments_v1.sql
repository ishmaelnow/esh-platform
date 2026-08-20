-- Tenant-configurable fixed fare adjustments by Rider vehicle service type.

alter table public.tenant_pricing_settings
  add column if not exists service_type_surcharges jsonb not null default '{"standard":0,"larger":0,"premium":0,"accessible":0}'::jsonb;
alter table public.trip_price_quotes
  add column if not exists service_type text not null default 'standard';
alter table public.trip_price_quotes
  drop constraint if exists trip_price_quotes_service_type_check;
alter table public.trip_price_quotes
  add constraint trip_price_quotes_service_type_check
  check (service_type in ('standard', 'larger', 'premium', 'accessible'));

create or replace function public.set_tenant_pricing_settings(
  target_tenant_id uuid,
  operating_currency_value text,
  pricing_enabled_value boolean,
  base_fare_minor_value bigint,
  per_mile_minor_value bigint,
  per_minute_minor_value bigint,
  minimum_fare_minor_value bigint,
  service_type_surcharges_value jsonb default '{"standard":0,"larger":0,"premium":0,"accessible":0}'::jsonb
)
returns boolean language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); item record; normalized jsonb := '{}'::jsonb;
begin
  if actor_id is null or not public.can_manage_dispatch(target_tenant_id) then raise exception 'pricing management permission is required'; end if;
  if service_type_surcharges_value is null or jsonb_typeof(service_type_surcharges_value) <> 'object' then raise exception 'service type adjustments must be an object'; end if;
  for item in select * from jsonb_each(service_type_surcharges_value) loop
    if item.key not in ('standard', 'larger', 'premium', 'accessible') or jsonb_typeof(item.value) <> 'number' or (item.value)::text::bigint not between -10000000 and 10000000 then raise exception 'invalid service type adjustment'; end if;
    normalized := normalized || jsonb_build_object(item.key, (item.value)::text::bigint);
  end loop;
  insert into public.tenant_pricing_settings (tenant_id, currency_code, pricing_enabled, base_fare_minor, per_mile_minor, per_minute_minor, minimum_fare_minor, service_type_surcharges, updated_by_person_id)
  values (target_tenant_id, operating_currency_value, pricing_enabled_value, base_fare_minor_value, per_mile_minor_value, per_minute_minor_value, minimum_fare_minor_value, normalized, actor_id)
  on conflict (tenant_id) do update set currency_code=excluded.currency_code, pricing_enabled=excluded.pricing_enabled, base_fare_minor=excluded.base_fare_minor, per_mile_minor=excluded.per_mile_minor, per_minute_minor=excluded.per_minute_minor, minimum_fare_minor=excluded.minimum_fare_minor, service_type_surcharges=excluded.service_type_surcharges, updated_by_person_id=excluded.updated_by_person_id, updated_at=now();
  return true;
end;
$$;

create or replace function public.create_rider_price_quote_internal(
  target_rider_profile_id uuid, target_service_area_id uuid, pickup_address_value text, destination_address_value text,
  pickup_latitude_value double precision, pickup_longitude_value double precision, destination_latitude_value double precision,
  destination_longitude_value double precision, route_distance_meters_value integer, route_duration_seconds_value integer,
  toll_amount_minor_value integer, toll_snapshot_value jsonb, service_type_value text default 'standard'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare base_quote jsonb; quote_id_value uuid; settings public.tenant_pricing_settings; rider public.rider_profiles; normalized text := lower(btrim(coalesce(service_type_value, 'standard'))); surcharge bigint;
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

revoke all on function public.create_rider_price_quote_internal(uuid, uuid, text, text, double precision, double precision, double precision, double precision, integer, integer, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_rider_price_quote_internal(uuid, uuid, text, text, double precision, double precision, double precision, double precision, integer, integer, integer, jsonb, text) to service_role;
revoke all on function public.set_tenant_pricing_settings(uuid, text, boolean, bigint, bigint, bigint, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.set_tenant_pricing_settings(uuid, text, boolean, bigint, bigint, bigint, bigint, jsonb) to authenticated;
