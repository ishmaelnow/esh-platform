-- Mapbox may return unnamed toll booths. Store trusted facility coordinates so
-- catalog matching can still identify configured facilities without guessing.

alter table public.toll_facilities
  add column if not exists mapbox_latitude double precision,
  add column if not exists mapbox_longitude double precision;

alter table public.toll_facilities
  drop constraint if exists toll_facilities_mapbox_coordinates_check;

alter table public.toll_facilities
  add constraint toll_facilities_mapbox_coordinates_check check (
    (mapbox_latitude is null and mapbox_longitude is null)
    or (mapbox_latitude between -90 and 90 and mapbox_longitude between -180 and 180)
  );

update public.toll_facilities
set mapbox_latitude = coordinates.latitude,
    mapbox_longitude = coordinates.longitude
from (values
  ('ben_franklin_bridge', 39.9530::double precision, -75.1310::double precision),
  ('walt_whitman_bridge', 39.9060::double precision, -75.1260::double precision),
  ('commodore_barry_bridge', 39.8190::double precision, -75.3550::double precision),
  ('betsy_ross_bridge', 40.0120::double precision, -75.0280::double precision)
) coordinates(facility_code, latitude, longitude)
where public.toll_facilities.facility_code = coordinates.facility_code;

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
  rate.source_reference,
  facility.mapbox_latitude,
  facility.mapbox_longitude
from public.toll_facility_aliases alias
join public.toll_facilities facility on facility.facility_id = alias.facility_id and facility.active
join public.toll_authorities authority on authority.authority_id = facility.authority_id and authority.active
join public.toll_rates rate on rate.facility_id = facility.facility_id;

revoke all on public.toll_pricing_catalog from public, anon, authenticated;
grant select on public.toll_pricing_catalog to service_role;
