-- Let tenant service areas cover every eligible driver or a selected subset.

alter table public.service_areas
  add column coverage_mode text;

-- Preserve the behavior of areas created before coverage modes were introduced.
update public.service_areas
set coverage_mode = 'selected_drivers';

alter table public.service_areas
  alter column coverage_mode set default 'all_drivers',
  alter column coverage_mode set not null,
  add constraint service_areas_coverage_mode_check
    check (coverage_mode in ('all_drivers', 'selected_drivers'));

create or replace function public.audit_service_area_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    new.tenant_id,
    case
      when tg_op = 'INSERT' then 'service_area.created'
      when new.status is distinct from old.status then 'service_area.status_changed'
      when new.coverage_mode is distinct from old.coverage_mode then 'service_area.coverage_changed'
      else 'service_area.updated'
    end,
    'person', public.current_person_id(), '{}',
    case
      when tg_op = 'INSERT' then 'Service area created.'
      when new.coverage_mode is distinct from old.coverage_mode
        then 'Service area driver coverage changed.'
      else 'Service area updated.'
    end,
    gen_random_uuid(), 'service_area', new.service_area_id::text,
    jsonb_build_object(
      'name', new.name,
      'status', new.status,
      'coverage_mode', new.coverage_mode,
      'center_latitude', new.center_latitude,
      'center_longitude', new.center_longitude,
      'radius_km', new.radius_km
    )
  );
  return new;
end;
$$;

create or replace function public.my_driver_service_areas()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'serviceAreaId', area.service_area_id,
    'name', area.name,
    'description', area.description,
    'centerLatitude', area.center_latitude,
    'centerLongitude', area.center_longitude,
    'radiusKm', area.radius_km,
    'coverageMode', area.coverage_mode,
    'assignedAt', assignment.assigned_at
  ) order by area.name), '[]'::jsonb)
  from public.driver_profiles driver
  join public.person_profiles person on person.person_id = driver.person_id
  join public.service_areas area
    on area.tenant_id = driver.tenant_id
    and area.status = 'active'
  left join public.driver_service_area_assignments assignment
    on assignment.driver_profile_id = driver.driver_profile_id
    and assignment.tenant_id = driver.tenant_id
    and assignment.service_area_id = area.service_area_id
    and assignment.ended_at is null
  where person.auth_user_id = auth.uid()
    and driver.status = 'active'
    and (
      area.coverage_mode = 'all_drivers'
      or (
        area.coverage_mode = 'selected_drivers'
        and assignment.assignment_id is not null
      )
    );
$$;

grant execute on function public.my_driver_service_areas() to authenticated;
