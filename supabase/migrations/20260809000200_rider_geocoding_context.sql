-- Give authenticated Riders only the selected active area's non-sensitive map context.

create or replace function public.my_rider_service_area_context(
  target_tenant_slug text,
  target_service_area_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  target_tenant_id uuid;
  area public.service_areas;
begin
  if auth.uid() is null then raise exception 'authentication is required'; end if;

  select config.tenant_id into target_tenant_id
  from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  where config.tenant_slug = lower(btrim(target_tenant_slug))
    and tenant.status = 'active';
  if target_tenant_id is null then raise exception 'booking tenant is unavailable'; end if;
  if public.current_rider_profile_id(target_tenant_id) is null then
    raise exception 'active rider profile is required';
  end if;

  select * into area from public.service_areas
  where tenant_id = target_tenant_id
    and service_area_id = target_service_area_id
    and status = 'active';
  if area.service_area_id is null then raise exception 'active service area is required'; end if;

  return jsonb_build_object(
    'latitude', area.center_latitude,
    'longitude', area.center_longitude,
    'radiusKm', area.radius_km
  );
end;
$$;

revoke all on function public.my_rider_service_area_context(text, uuid)
  from public, anon, authenticated;
grant execute on function public.my_rider_service_area_context(text, uuid) to authenticated;

create or replace function public.validate_dispatch_booking_coordinate_region()
returns trigger language plpgsql set search_path = public as $$
declare
  area public.service_areas;
  destination_distance_km double precision;
begin
  if new.destination_latitude is null then return new; end if;
  select * into area from public.service_areas where service_area_id = new.service_area_id;
  destination_distance_km := 6371 * 2 * asin(least(1, sqrt(
    power(sin(radians(new.destination_latitude - area.center_latitude) / 2), 2)
    + cos(radians(area.center_latitude)) * cos(radians(new.destination_latitude))
    * power(sin(radians(new.destination_longitude - area.center_longitude) / 2), 2)
  )));
  if destination_distance_km > 800 then
    raise exception 'destination address resolved too far from the selected service area';
  end if;
  return new;
end;
$$;

create trigger dispatch_bookings_validate_coordinate_region
before insert or update of destination_latitude, destination_longitude, service_area_id
on public.dispatch_bookings for each row
execute function public.validate_dispatch_booking_coordinate_region();
