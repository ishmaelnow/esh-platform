-- Driver availability: database-enforced service eligibility and audited online/offline state.

create table public.driver_availability (
  driver_profile_id uuid primary key references public.driver_profiles (driver_profile_id)
    on delete restrict,
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  requested_status text not null default 'offline',
  status_changed_at timestamptz not null default now(),
  last_online_at timestamptz,
  last_offline_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_availability_status_check check (requested_status in ('online', 'offline')),
  constraint driver_availability_driver_fk foreign key (tenant_id, driver_profile_id)
    references public.driver_profiles (tenant_id, driver_profile_id) on delete restrict
);

create index driver_availability_tenant_status_idx
  on public.driver_availability (tenant_id, requested_status, status_changed_at desc);

create trigger driver_availability_set_updated_at
  before update on public.driver_availability
  for each row execute function public.set_updated_at();

alter table public.driver_availability enable row level security;

create policy driver_availability_admin_select
  on public.driver_availability for select to authenticated
  using (public.can_read_driver_management(tenant_id));

create policy driver_availability_self_select
  on public.driver_availability for select to authenticated
  using (
    exists (
      select 1
      from public.driver_profiles driver
      join public.person_profiles person on person.person_id = driver.person_id
      where driver.driver_profile_id = driver_availability.driver_profile_id
        and person.auth_user_id = auth.uid()
    )
  );

grant select on public.driver_availability to authenticated;
grant all on public.driver_availability to service_role;

create or replace function public.driver_service_blockers(target_driver_profile_id uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  target_driver public.driver_profiles;
  assigned_vehicle public.vehicles;
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

create or replace function public.my_driver_availability()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  target_driver_id uuid;
  stored_status text;
  changed_at timestamptz;
  blockers text[];
begin
  select driver.driver_profile_id into target_driver_id
  from public.driver_profiles driver
  join public.person_profiles person on person.person_id = driver.person_id
  where person.auth_user_id = auth.uid()
  order by driver.created_at
  limit 1;
  if target_driver_id is null then raise exception 'driver profile is unavailable'; end if;

  select availability.requested_status, availability.status_changed_at
    into stored_status, changed_at
  from public.driver_availability availability
  where availability.driver_profile_id = target_driver_id;

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
    'statusChangedAt', changed_at
  );
end;
$$;

create or replace function public.set_my_driver_availability(target_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_driver public.driver_profiles;
  blockers text[];
  previous_status text;
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
  if target_driver.driver_profile_id is null then raise exception 'driver profile is unavailable'; end if;

  blockers := public.driver_service_blockers(target_driver.driver_profile_id);
  if target_status = 'online' and cardinality(blockers) > 0 then
    raise exception 'cannot go online: %', array_to_string(blockers, ', ');
  end if;

  select requested_status into previous_status
  from public.driver_availability
  where driver_profile_id = target_driver.driver_profile_id;

  insert into public.driver_availability (
    driver_profile_id, tenant_id, requested_status, status_changed_at,
    last_online_at, last_offline_at
  ) values (
    target_driver.driver_profile_id, target_driver.tenant_id, target_status, next_changed_at,
    case when target_status = 'online' then next_changed_at end,
    case when target_status = 'offline' then next_changed_at end
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
    end;

  if previous_status is distinct from target_status then
    insert into public.tenant_audit_events (
      tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
      correlation_id, resource_type, resource_id, metadata
    ) values (
      target_driver.tenant_id, 'driver.availability_changed', 'person',
      target_driver.person_id, '{}', 'Driver changed service availability.',
      gen_random_uuid(), 'driver_profile', target_driver.driver_profile_id::text,
      jsonb_build_object('requested_status', target_status)
    );
  end if;

  return public.my_driver_availability();
end;
$$;

grant execute on function public.my_driver_availability() to authenticated;
grant execute on function public.set_my_driver_availability(text) to authenticated;

insert into public.driver_availability (driver_profile_id, tenant_id)
select driver_profile_id, tenant_id from public.driver_profiles
on conflict (driver_profile_id) do nothing;

create or replace function public.seed_driver_availability()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.driver_availability (driver_profile_id, tenant_id)
  values (new.driver_profile_id, new.tenant_id)
  on conflict (driver_profile_id) do nothing;
  return new;
end;
$$;

create trigger driver_profiles_seed_availability
  after insert on public.driver_profiles for each row
  execute function public.seed_driver_availability();
