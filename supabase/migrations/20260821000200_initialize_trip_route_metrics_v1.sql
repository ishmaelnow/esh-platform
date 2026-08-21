-- Start aggregate route metrics when a trip enters progress.
-- Location sharing may have been enabled before dispatch started; seed the first point
-- so subsequent updates are attached to the active booking.

create or replace function public.initialize_trip_route_metrics()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'in_progress' and old.status is distinct from new.status then
    insert into public.trip_route_metrics (
      booking_id, tenant_id, driver_profile_id, distance_meters,
      started_at, last_recorded_at, last_latitude, last_longitude
    )
    select
      new.booking_id, new.tenant_id, new.current_driver_profile_id, 0,
      coalesce(location.recorded_at, now()), location.recorded_at,
      location.latitude, location.longitude
    from public.driver_locations location
    where location.driver_profile_id = new.current_driver_profile_id
      and location.tenant_id = new.tenant_id
      and location.sharing_enabled
      and location.latitude is not null
      and location.longitude is not null
    on conflict (booking_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists dispatch_bookings_capture_00_route_metrics_start on public.dispatch_bookings;
create trigger dispatch_bookings_capture_00_route_metrics_start
after update of status on public.dispatch_bookings
for each row execute function public.initialize_trip_route_metrics();

revoke all on function public.initialize_trip_route_metrics() from public, anon, authenticated;
grant execute on function public.initialize_trip_route_metrics() to service_role;
