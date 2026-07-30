-- Driver-selected operating area within tenant-admin-authorized service areas.

alter table public.driver_availability
  add column selected_service_area_id uuid,
  add constraint driver_availability_selected_service_area_fk
    foreign key (tenant_id, selected_service_area_id)
    references public.service_areas (tenant_id, service_area_id) on delete restrict;

create index driver_availability_selected_service_area_idx
  on public.driver_availability (tenant_id, selected_service_area_id)
  where selected_service_area_id is not null;

create or replace function public.driver_can_use_service_area(
  target_driver_profile_id uuid,
  target_service_area_id uuid
)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.driver_profiles driver
    join public.service_areas area
      on area.tenant_id = driver.tenant_id
      and area.service_area_id = target_service_area_id
      and area.status = 'active'
    left join public.driver_service_area_assignments assignment
      on assignment.tenant_id = driver.tenant_id
      and assignment.driver_profile_id = driver.driver_profile_id
      and assignment.service_area_id = area.service_area_id
      and assignment.ended_at is null
    where driver.driver_profile_id = target_driver_profile_id
      and driver.status = 'active'
      and (
        area.coverage_mode = 'all_drivers'
        or (
          area.coverage_mode = 'selected_drivers'
          and assignment.assignment_id is not null
        )
      )
  );
$$;
revoke all on function public.driver_can_use_service_area(uuid, uuid)
  from public, anon, authenticated;

-- Preserve continuity when a driver currently has exactly one allowable area.
with allowed_areas as (
  select
    driver.driver_profile_id,
    min(area.service_area_id::text)::uuid as service_area_id,
    count(*) as area_count
  from public.driver_profiles driver
  join public.service_areas area
    on area.tenant_id = driver.tenant_id
    and area.status = 'active'
  left join public.driver_service_area_assignments assignment
    on assignment.tenant_id = driver.tenant_id
    and assignment.driver_profile_id = driver.driver_profile_id
    and assignment.service_area_id = area.service_area_id
    and assignment.ended_at is null
  where driver.status = 'active'
    and (
      area.coverage_mode = 'all_drivers'
      or (
        area.coverage_mode = 'selected_drivers'
        and assignment.assignment_id is not null
      )
    )
  group by driver.driver_profile_id
  having count(*) = 1
)
update public.driver_availability availability
set selected_service_area_id = allowed.service_area_id
from allowed_areas allowed
where allowed.driver_profile_id = availability.driver_profile_id;

create or replace function public.driver_service_blockers(target_driver_profile_id uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  target_driver public.driver_profiles;
  assigned_vehicle public.vehicles;
  selected_area_id uuid;
  blockers text[] := '{}';
begin
  select * into target_driver
  from public.driver_profiles
  where driver_profile_id = target_driver_profile_id;

  if target_driver.driver_profile_id is null then
    return array['driver_profile_missing'];
  end if;
  if target_driver.status <> 'active' then
    blockers := array_append(blockers, 'driver_not_active');
  end if;
  if not public.driver_compliance_satisfied(target_driver.driver_profile_id) then
    blockers := array_append(blockers, 'driver_documents_incomplete');
  end if;

  select availability.selected_service_area_id into selected_area_id
  from public.driver_availability availability
  where availability.driver_profile_id = target_driver.driver_profile_id;

  if selected_area_id is null then
    blockers := array_append(blockers, 'service_area_not_selected');
  elsif not public.driver_can_use_service_area(
    target_driver.driver_profile_id,
    selected_area_id
  ) then
    blockers := array_append(blockers, 'service_area_unavailable');
  end if;

  select vehicle.* into assigned_vehicle
  from public.driver_vehicle_assignments assignment
  join public.vehicles vehicle on vehicle.vehicle_id = assignment.vehicle_id
  where assignment.driver_profile_id = target_driver.driver_profile_id
    and assignment.ended_at is null
  limit 1;

  if assigned_vehicle.vehicle_id is null then
    blockers := array_append(blockers, 'vehicle_not_assigned');
  else
    if assigned_vehicle.status <> 'active' then
      blockers := array_append(blockers, 'vehicle_not_active');
    end if;
    if not public.vehicle_compliance_satisfied(assigned_vehicle.vehicle_id) then
      blockers := array_append(blockers, 'vehicle_documents_incomplete');
    end if;
  end if;

  return blockers;
end;
$$;
revoke all on function public.driver_service_blockers(uuid) from public, anon, authenticated;

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
    'assignedAt', assignment.assigned_at,
    'selected', coalesce(availability.selected_service_area_id = area.service_area_id, false)
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
  left join public.driver_availability availability
    on availability.driver_profile_id = driver.driver_profile_id
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

create or replace function public.my_driver_availability()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  target_driver_id uuid;
  stored_status text;
  changed_at timestamptz;
  selected_area_id uuid;
  selected_area_name text;
  blockers text[];
begin
  select driver.driver_profile_id into target_driver_id
  from public.driver_profiles driver
  join public.person_profiles person on person.person_id = driver.person_id
  where person.auth_user_id = auth.uid()
  order by driver.created_at
  limit 1;
  if target_driver_id is null then raise exception 'driver profile is unavailable'; end if;

  select availability.requested_status, availability.status_changed_at,
    availability.selected_service_area_id
    into stored_status, changed_at, selected_area_id
  from public.driver_availability availability
  where availability.driver_profile_id = target_driver_id;

  select area.name into selected_area_name
  from public.service_areas area
  where area.service_area_id = selected_area_id;

  stored_status := coalesce(stored_status, 'offline');
  changed_at := coalesce(changed_at, now());
  blockers := public.driver_service_blockers(target_driver_id);
  return jsonb_build_object(
    'requestedStatus', stored_status,
    'effectiveStatus', case
      when stored_status = 'online' and cardinality(blockers) = 0 then 'online'
      else 'offline'
    end,
    'eligible', cardinality(blockers) = 0,
    'blockers', to_jsonb(blockers),
    'statusChangedAt', changed_at,
    'selectedServiceAreaId', selected_area_id,
    'selectedServiceAreaName', selected_area_name
  );
end;
$$;

create or replace function public.set_my_driver_service_area(target_service_area_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_driver public.driver_profiles;
  current_status text;
  previous_area_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication is required'; end if;

  select driver.* into target_driver
  from public.driver_profiles driver
  join public.person_profiles person on person.person_id = driver.person_id
  where person.auth_user_id = auth.uid()
  order by driver.created_at
  limit 1
  for update of driver;
  if target_driver.driver_profile_id is null then
    raise exception 'driver profile is unavailable';
  end if;

  select availability.requested_status, availability.selected_service_area_id
    into current_status, previous_area_id
  from public.driver_availability availability
  where availability.driver_profile_id = target_driver.driver_profile_id
  for update;

  if coalesce(current_status, 'offline') = 'online' then
    raise exception 'go offline before changing service area';
  end if;
  if not public.driver_can_use_service_area(
    target_driver.driver_profile_id,
    target_service_area_id
  ) then
    raise exception 'service area is not available to this driver';
  end if;

  insert into public.driver_availability (
    driver_profile_id, tenant_id, selected_service_area_id
  ) values (
    target_driver.driver_profile_id, target_driver.tenant_id, target_service_area_id
  )
  on conflict (driver_profile_id) do update set
    selected_service_area_id = excluded.selected_service_area_id;

  if previous_area_id is distinct from target_service_area_id then
    insert into public.tenant_audit_events (
      tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
      correlation_id, resource_type, resource_id, metadata
    ) values (
      target_driver.tenant_id, 'driver.service_area_selected', 'person',
      target_driver.person_id, '{}', 'Driver selected an operating service area.',
      gen_random_uuid(), 'driver_profile', target_driver.driver_profile_id::text,
      jsonb_build_object(
        'previous_service_area_id', previous_area_id,
        'selected_service_area_id', target_service_area_id
      )
    );
  end if;

  return public.my_driver_service_areas();
end;
$$;

create or replace function public.set_my_driver_availability(target_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_driver public.driver_profiles;
  blockers text[];
  previous_status text;
  previous_last_offline_at timestamptz;
  selected_area_id uuid;
  sole_area_id uuid;
  allowed_area_count integer;
  next_changed_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'authentication is required'; end if;
  if target_status not in ('online', 'offline') then
    raise exception 'availability must be online or offline';
  end if;

  select driver.* into target_driver
  from public.driver_profiles driver
  join public.person_profiles person on person.person_id = driver.person_id
  where person.auth_user_id = auth.uid()
  order by driver.created_at
  limit 1
  for update of driver;
  if target_driver.driver_profile_id is null then
    raise exception 'driver profile is unavailable';
  end if;

  select requested_status, last_offline_at, selected_service_area_id
    into previous_status, previous_last_offline_at, selected_area_id
  from public.driver_availability
  where driver_profile_id = target_driver.driver_profile_id
  for update;

  if target_status = 'online' and selected_area_id is null then
    select count(*), min(area.service_area_id::text)::uuid
      into allowed_area_count, sole_area_id
    from public.service_areas area
    left join public.driver_service_area_assignments assignment
      on assignment.tenant_id = target_driver.tenant_id
      and assignment.driver_profile_id = target_driver.driver_profile_id
      and assignment.service_area_id = area.service_area_id
      and assignment.ended_at is null
    where area.tenant_id = target_driver.tenant_id
      and area.status = 'active'
      and (
        area.coverage_mode = 'all_drivers'
        or (
          area.coverage_mode = 'selected_drivers'
          and assignment.assignment_id is not null
        )
      );
    if allowed_area_count = 1 then
      selected_area_id := sole_area_id;
      update public.driver_availability
      set selected_service_area_id = selected_area_id
      where driver_profile_id = target_driver.driver_profile_id;
      insert into public.tenant_audit_events (
        tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
        correlation_id, resource_type, resource_id, metadata
      ) values (
        target_driver.tenant_id, 'driver.service_area_selected', 'person',
        target_driver.person_id, '{}', 'Driver automatically selected the only operating area.',
        gen_random_uuid(), 'driver_profile', target_driver.driver_profile_id::text,
        jsonb_build_object(
          'previous_service_area_id', null,
          'selected_service_area_id', selected_area_id,
          'automatic', true
        )
      );
    end if;
  end if;

  blockers := public.driver_service_blockers(target_driver.driver_profile_id);
  if target_status = 'online' and cardinality(blockers) > 0 then
    raise exception 'cannot go online: %', array_to_string(blockers, ', ');
  end if;

  insert into public.driver_availability (
    driver_profile_id,
    tenant_id,
    requested_status,
    status_changed_at,
    last_online_at,
    last_offline_at,
    selected_service_area_id
  ) values (
    target_driver.driver_profile_id,
    target_driver.tenant_id,
    target_status,
    next_changed_at,
    case when target_status = 'online' then next_changed_at end,
    case
      when target_status = 'offline' then next_changed_at
      else coalesce(previous_last_offline_at, next_changed_at)
    end,
    selected_area_id
  )
  on conflict (driver_profile_id) do update set
    requested_status = excluded.requested_status,
    status_changed_at = case
      when driver_availability.requested_status = excluded.requested_status
        then driver_availability.status_changed_at
      else excluded.status_changed_at
    end,
    last_online_at = case
      when excluded.requested_status = 'online' then excluded.status_changed_at
      else driver_availability.last_online_at
    end,
    last_offline_at = case
      when excluded.requested_status = 'offline' then excluded.status_changed_at
      else driver_availability.last_offline_at
    end,
    selected_service_area_id = excluded.selected_service_area_id;

  if previous_status is distinct from target_status then
    insert into public.tenant_audit_events (
      tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
      correlation_id, resource_type, resource_id, metadata
    ) values (
      target_driver.tenant_id, 'driver.availability_changed', 'person',
      target_driver.person_id, '{}', 'Driver changed service availability.',
      gen_random_uuid(), 'driver_profile', target_driver.driver_profile_id::text,
      jsonb_build_object(
        'requested_status', target_status,
        'selected_service_area_id', selected_area_id
      )
    );
  end if;

  return public.my_driver_availability();
end;
$$;

grant execute on function public.my_driver_service_areas() to authenticated;
grant execute on function public.my_driver_availability() to authenticated;
grant execute on function public.set_my_driver_service_area(uuid) to authenticated;
grant execute on function public.set_my_driver_availability(text) to authenticated;
