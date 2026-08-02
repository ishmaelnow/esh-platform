-- Use table-specific trigger functions so each NEW/OLD record references only valid columns.

drop trigger if exists driver_availability_stop_location on public.driver_availability;
drop trigger if exists dispatch_bookings_stop_location on public.dispatch_bookings;
drop function if exists public.stop_driver_location_sharing();

create or replace function public.stop_driver_location_when_offline()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.requested_status = 'offline' and old.requested_status is distinct from 'offline' then
    update public.driver_locations set sharing_enabled = false, latitude = null, longitude = null,
      accuracy_meters = null, recorded_at = null
    where driver_profile_id = new.driver_profile_id and sharing_enabled;
    if found then
      insert into public.tenant_audit_events (
        tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
        correlation_id, resource_type, resource_id, metadata
      ) values (
        new.tenant_id, 'driver.location_sharing_stopped', 'platform_system', null, '{}',
        'Location sharing stopped because the Driver went offline.', gen_random_uuid(),
        'driver_profile', new.driver_profile_id::text, jsonb_build_object('cause', 'offline')
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.stop_driver_location_when_trip_ends()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('completed', 'cancelled') and old.status is distinct from new.status
    and new.current_driver_profile_id is not null then
    update public.driver_locations set sharing_enabled = false, latitude = null, longitude = null,
      accuracy_meters = null, recorded_at = null
    where driver_profile_id = new.current_driver_profile_id and sharing_enabled;
    if found then
      insert into public.tenant_audit_events (
        tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
        correlation_id, resource_type, resource_id, metadata
      ) values (
        new.tenant_id, 'driver.location_sharing_stopped', 'platform_system', null, '{}',
        'Location sharing stopped because the trip ended.', gen_random_uuid(),
        'driver_profile', new.current_driver_profile_id::text,
        jsonb_build_object('cause', new.status, 'booking_id', new.booking_id)
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger driver_availability_stop_location after update of requested_status
  on public.driver_availability for each row
  execute function public.stop_driver_location_when_offline();
create trigger dispatch_bookings_stop_location after update of status
  on public.dispatch_bookings for each row
  execute function public.stop_driver_location_when_trip_ends();

revoke all on function public.stop_driver_location_when_offline()
  from public, anon, authenticated, service_role;
revoke all on function public.stop_driver_location_when_trip_ends()
  from public, anon, authenticated, service_role;
