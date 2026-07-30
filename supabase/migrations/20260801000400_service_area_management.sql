-- Tenant service areas: circular operating boundaries and driver assignment history.

create table public.service_areas (
  service_area_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  name text not null,
  description text,
  center_latitude numeric(9, 6) not null,
  center_longitude numeric(9, 6) not null,
  radius_km numeric(8, 2) not null,
  status text not null default 'active',
  created_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  updated_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_areas_name_not_blank check (length(btrim(name)) > 0),
  constraint service_areas_latitude_check check (center_latitude between -90 and 90),
  constraint service_areas_longitude_check check (center_longitude between -180 and 180),
  constraint service_areas_radius_check check (radius_km > 0 and radius_km <= 1000),
  constraint service_areas_status_check check (status in ('active', 'inactive')),
  constraint service_areas_tenant_area_unique unique (tenant_id, service_area_id),
  constraint service_areas_tenant_name_unique unique (tenant_id, name)
);

create table public.driver_service_area_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  driver_profile_id uuid not null,
  service_area_id uuid not null,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  assignment_notes text,
  created_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  ended_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint driver_service_area_assignment_dates check (ended_at is null or ended_at > assigned_at),
  constraint driver_service_area_assignment_end_actor check (
    (ended_at is null and ended_by_person_id is null)
    or (ended_at is not null and ended_by_person_id is not null)
  ),
  constraint driver_service_area_assignment_driver_fk foreign key (tenant_id, driver_profile_id)
    references public.driver_profiles (tenant_id, driver_profile_id) on delete restrict,
  constraint driver_service_area_assignment_area_fk foreign key (tenant_id, service_area_id)
    references public.service_areas (tenant_id, service_area_id) on delete restrict
);

create unique index driver_service_area_assignments_active_idx
  on public.driver_service_area_assignments (tenant_id, driver_profile_id, service_area_id)
  where ended_at is null;
create index driver_service_area_assignments_driver_history_idx
  on public.driver_service_area_assignments (tenant_id, driver_profile_id, assigned_at desc);
create index driver_service_area_assignments_area_idx
  on public.driver_service_area_assignments (tenant_id, service_area_id)
  where ended_at is null;

create trigger service_areas_set_updated_at before update on public.service_areas
  for each row execute function public.set_updated_at();

create or replace function public.can_read_service_areas(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_active_tenant_membership(target_tenant_id)
    and public.tenant_capability_enabled(target_tenant_id, 'driver.management');
$$;

create or replace function public.can_manage_service_areas(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_tenant_role(target_tenant_id, array['tenant_owner', 'tenant_admin'])
    and public.tenant_capability_enabled(target_tenant_id, 'driver.management');
$$;

create or replace function public.validate_service_area()
returns trigger language plpgsql set search_path = public as $$
begin
  new.name := btrim(new.name);
  new.description := nullif(btrim(new.description), '');
  if tg_op = 'UPDATE' and new.tenant_id <> old.tenant_id then
    raise exception 'service area tenant cannot change';
  end if;
  return new;
end;
$$;
create trigger service_areas_validate before insert or update on public.service_areas
  for each row execute function public.validate_service_area();

create or replace function public.validate_driver_service_area_assignment()
returns trigger language plpgsql set search_path = public as $$
begin
  new.assignment_notes := nullif(btrim(new.assignment_notes), '');
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.driver_profile_id is distinct from old.driver_profile_id
    or new.service_area_id is distinct from old.service_area_id
    or new.assigned_at is distinct from old.assigned_at
    or new.created_by_person_id is distinct from old.created_by_person_id
    or old.ended_at is not null
    or new.ended_at is null
  ) then
    raise exception 'service area assignment history is immutable; only an active assignment can be ended';
  end if;
  if new.ended_at is null and not exists (
    select 1 from public.service_areas area
    where area.tenant_id = new.tenant_id
      and area.service_area_id = new.service_area_id
      and area.status = 'active'
  ) then
    raise exception 'only active service areas can be assigned';
  end if;
  return new;
end;
$$;
create trigger driver_service_area_assignments_validate before insert or update
  on public.driver_service_area_assignments for each row
  execute function public.validate_driver_service_area_assignment();

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
      else 'service_area.updated'
    end,
    'person', public.current_person_id(), '{}',
    case when tg_op = 'INSERT' then 'Service area created.' else 'Service area updated.' end,
    gen_random_uuid(), 'service_area', new.service_area_id::text,
    jsonb_build_object(
      'name', new.name,
      'status', new.status,
      'center_latitude', new.center_latitude,
      'center_longitude', new.center_longitude,
      'radius_km', new.radius_km
    )
  );
  return new;
end;
$$;
create trigger service_areas_audit after insert or update on public.service_areas
  for each row execute function public.audit_service_area_change();

create or replace function public.audit_driver_service_area_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    new.tenant_id,
    case when tg_op = 'INSERT'
      then 'service_area.driver_assigned' else 'service_area.driver_unassigned' end,
    'person', public.current_person_id(), '{}',
    case when tg_op = 'INSERT'
      then 'Driver assigned to service area.' else 'Driver service area assignment ended.' end,
    gen_random_uuid(), 'driver_service_area_assignment', new.assignment_id::text,
    jsonb_build_object(
      'driver_profile_id', new.driver_profile_id,
      'service_area_id', new.service_area_id
    )
  );
  return new;
end;
$$;
create trigger driver_service_area_assignments_audit after insert or update of ended_at
  on public.driver_service_area_assignments for each row
  execute function public.audit_driver_service_area_assignment();

alter table public.service_areas enable row level security;
alter table public.driver_service_area_assignments enable row level security;

create policy service_areas_select_authorized on public.service_areas for select to authenticated
  using (public.can_read_service_areas(tenant_id));
create policy service_areas_insert_manager on public.service_areas for insert to authenticated
  with check (
    public.can_manage_service_areas(tenant_id)
    and created_by_person_id = public.current_person_id()
    and updated_by_person_id = public.current_person_id()
  );
create policy service_areas_update_manager on public.service_areas for update to authenticated
  using (public.can_manage_service_areas(tenant_id))
  with check (
    public.can_manage_service_areas(tenant_id)
    and updated_by_person_id = public.current_person_id()
  );

create policy driver_service_area_assignments_select_authorized
  on public.driver_service_area_assignments for select to authenticated
  using (public.can_read_service_areas(tenant_id));
create policy driver_service_area_assignments_insert_manager
  on public.driver_service_area_assignments for insert to authenticated
  with check (
    public.can_manage_service_areas(tenant_id)
    and created_by_person_id = public.current_person_id()
  );
create policy driver_service_area_assignments_update_manager
  on public.driver_service_area_assignments for update to authenticated
  using (public.can_manage_service_areas(tenant_id))
  with check (
    public.can_manage_service_areas(tenant_id)
    and ended_by_person_id = public.current_person_id()
  );

create or replace function public.my_driver_service_areas()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'serviceAreaId', area.service_area_id,
    'name', area.name,
    'description', area.description,
    'centerLatitude', area.center_latitude,
    'centerLongitude', area.center_longitude,
    'radiusKm', area.radius_km,
    'assignedAt', assignment.assigned_at
  ) order by area.name), '[]'::jsonb)
  from public.driver_profiles driver
  join public.person_profiles person on person.person_id = driver.person_id
  join public.driver_service_area_assignments assignment
    on assignment.driver_profile_id = driver.driver_profile_id
    and assignment.tenant_id = driver.tenant_id
    and assignment.ended_at is null
  join public.service_areas area
    on area.service_area_id = assignment.service_area_id
    and area.tenant_id = driver.tenant_id
    and area.status = 'active'
  where person.auth_user_id = auth.uid();
$$;

grant select, insert, update on public.service_areas to authenticated;
grant select, insert, update on public.driver_service_area_assignments to authenticated;
grant execute on function public.can_read_service_areas(uuid) to authenticated;
grant execute on function public.can_manage_service_areas(uuid) to authenticated;
grant execute on function public.my_driver_service_areas() to authenticated;
grant all on public.service_areas, public.driver_service_area_assignments to service_role;
