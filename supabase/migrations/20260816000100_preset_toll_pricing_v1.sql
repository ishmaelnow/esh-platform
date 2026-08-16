-- Generic toll pricing catalog and locked quote toll snapshots.
-- The catalog is platform-owned reference data; only trusted server code can read it.

create table public.toll_authorities (
  authority_id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  default_currency_code text not null references public.currency_codes (currency_code) on delete restrict,
  source_url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint toll_authorities_code_check check (code = lower(code) and length(code) between 2 and 64)
);

create table public.toll_facilities (
  facility_id uuid primary key default gen_random_uuid(),
  authority_id uuid not null references public.toll_authorities (authority_id) on delete restrict,
  facility_code text not null,
  name text not null,
  facility_type text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint toll_facilities_code_check check (facility_code = lower(facility_code) and length(facility_code) between 2 and 128),
  constraint toll_facilities_unique_code unique (authority_id, facility_code)
);

create table public.toll_facility_aliases (
  alias_id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.toll_facilities (facility_id) on delete restrict,
  alias_text text not null,
  normalized_alias text not null,
  mapbox_type text,
  created_at timestamptz not null default now(),
  constraint toll_facility_aliases_unique unique (facility_id, normalized_alias, mapbox_type)
);

create table public.toll_rates (
  rate_id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.toll_facilities (facility_id) on delete restrict,
  vehicle_class text not null,
  payment_method text not null,
  direction text not null,
  amount_minor bigint not null,
  currency_code text not null references public.currency_codes (currency_code) on delete restrict,
  effective_from date not null,
  effective_to date,
  local_start_time time,
  local_end_time time,
  day_of_week_mask smallint,
  timezone text,
  source_url text not null,
  source_reference text,
  created_at timestamptz not null default now(),
  constraint toll_rates_amount_check check (amount_minor > 0 and amount_minor <= 100000000),
  constraint toll_rates_dates_check check (effective_to is null or effective_to > effective_from),
  constraint toll_rates_day_mask_check check (day_of_week_mask is null or day_of_week_mask between 1 and 127),
  constraint toll_rates_unique_version unique (facility_id, vehicle_class, payment_method, direction, effective_from)
);

create index toll_facility_aliases_lookup_idx on public.toll_facility_aliases (normalized_alias);
create index toll_rates_active_lookup_idx on public.toll_rates (facility_id, vehicle_class, payment_method, direction, effective_from);

alter table public.toll_authorities enable row level security;
alter table public.toll_facilities enable row level security;
alter table public.toll_facility_aliases enable row level security;
alter table public.toll_rates enable row level security;

revoke all on table public.toll_authorities, public.toll_facilities, public.toll_facility_aliases, public.toll_rates
  from public, anon, authenticated;
grant select on table public.toll_authorities, public.toll_facilities, public.toll_facility_aliases, public.toll_rates
  to service_role;

create or replace view public.toll_pricing_catalog as
select
  authority.code as authority_code,
  authority.name as authority_name,
  facility.facility_id,
  facility.facility_code,
  facility.name as facility_name,
  facility.facility_type,
  alias.alias_text,
  alias.mapbox_type,
  rate.rate_id,
  rate.vehicle_class,
  rate.payment_method,
  rate.direction,
  rate.amount_minor,
  rate.currency_code,
  rate.effective_from,
  rate.effective_to,
  rate.source_url,
  rate.source_reference
from public.toll_facility_aliases alias
join public.toll_facilities facility on facility.facility_id = alias.facility_id and facility.active
join public.toll_authorities authority on authority.authority_id = facility.authority_id and authority.active
join public.toll_rates rate on rate.facility_id = facility.facility_id;

revoke all on public.toll_pricing_catalog from public, anon, authenticated;
grant select on public.toll_pricing_catalog to service_role;

-- Initial DRPA catalog. Rates are effective-dated data, not application constants.
insert into public.toll_authorities (code, name, default_currency_code, source_url)
values ('drpa', 'Delaware River Port Authority', 'USD', 'https://drpa.org/travel/toll-schedule.html')
on conflict (code) do update set
  name = excluded.name,
  default_currency_code = excluded.default_currency_code,
  source_url = excluded.source_url,
  active = true;

insert into public.toll_facilities (authority_id, facility_code, name, facility_type)
select authority.authority_id, facilities.facility_code, facilities.name, 'bridge'
from public.toll_authorities authority
cross join (values
  ('ben_franklin_bridge', 'Ben Franklin Bridge'),
  ('walt_whitman_bridge', 'Walt Whitman Bridge'),
  ('commodore_barry_bridge', 'Commodore Barry Bridge'),
  ('betsy_ross_bridge', 'Betsy Ross Bridge')
) facilities(facility_code, name)
where authority.code = 'drpa'
on conflict (authority_id, facility_code) do update set
  name = excluded.name,
  facility_type = excluded.facility_type,
  active = true;

insert into public.toll_facility_aliases (facility_id, alias_text, normalized_alias, mapbox_type)
select facility.facility_id, facility.name, lower(facility.name), 'toll_gantry'
from public.toll_facilities facility
join public.toll_authorities authority on authority.authority_id = facility.authority_id
where authority.code = 'drpa'
on conflict (facility_id, normalized_alias, mapbox_type) do nothing;

insert into public.toll_rates (
  facility_id, vehicle_class, payment_method, direction, amount_minor, currency_code,
  effective_from, source_url, source_reference
)
select facility.facility_id, 'passenger_suv', 'default', 'westbound', 600, 'USD',
  date '2024-09-01', authority.source_url, 'DRPA passenger automobile/SUV toll schedule effective 2024-09-01'
from public.toll_facilities facility
join public.toll_authorities authority on authority.authority_id = facility.authority_id
where authority.code = 'drpa'
on conflict (facility_id, vehicle_class, payment_method, direction, effective_from) do update set
  amount_minor = excluded.amount_minor,
  currency_code = excluded.currency_code,
  effective_to = excluded.effective_to,
  source_url = excluded.source_url,
  source_reference = excluded.source_reference;

-- Keep the existing 10-argument function during rollout and add the toll-aware canonical RPC.

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
    if coalesce(toll_line->>'currencyCode', '') <> rate_currency_code then
      raise exception 'toll snapshot currency does not match the configured rate';
    end if;
    if coalesce((toll_line->>'amountMinor')::bigint, -1) <> rate_amount_minor then
      raise exception 'toll snapshot amount does not match the configured rate';
    end if;
    snapshot_total_minor := snapshot_total_minor + rate_amount_minor;
  end loop;
  if snapshot_total_minor <> toll_amount_minor_value then
    raise exception 'toll amount does not match the configured rates';
  end if;

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
