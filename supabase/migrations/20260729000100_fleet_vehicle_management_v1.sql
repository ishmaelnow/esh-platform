-- Fleet and Vehicle Management V1: vehicle identity, private photo, lifecycle, and assignment history.

alter table public.tenant_capabilities drop constraint tenant_capabilities_key_check;
alter table public.tenant_capabilities add constraint tenant_capabilities_key_check check (
  capability_key in (
    'tenant.memberships', 'tenant.roles', 'tenant.audit', 'app.admin', 'app.rider', 'app.driver',
    'driver.management', 'vehicle.management'
  )
);

create table public.vehicles (
  vehicle_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  vehicle_number text not null,
  make text not null,
  model text not null,
  model_year integer not null,
  color text not null,
  license_plate text not null,
  vin text not null,
  status text not null default 'draft',
  status_reason text,
  photo_storage_bucket text,
  photo_storage_path text,
  photo_original_file_name text,
  photo_mime_type text,
  photo_size_bytes bigint,
  created_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  updated_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_number_not_blank check (length(btrim(vehicle_number)) > 0),
  constraint vehicles_make_not_blank check (length(btrim(make)) > 0),
  constraint vehicles_model_not_blank check (length(btrim(model)) > 0),
  constraint vehicles_color_not_blank check (length(btrim(color)) > 0),
  constraint vehicles_plate_not_blank check (length(btrim(license_plate)) > 0),
  constraint vehicles_vin_format check (upper(btrim(vin)) ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  constraint vehicles_year_check check (model_year between 1900 and 2100),
  constraint vehicles_status_check check (status in ('draft', 'active', 'suspended', 'retired')),
  constraint vehicles_status_reason_check check (
    status not in ('suspended', 'retired') or length(btrim(status_reason)) > 0
  ),
  constraint vehicles_photo_required_check check (
    photo_storage_path is not null and photo_storage_bucket is not null
      and photo_original_file_name is not null and photo_mime_type in ('image/jpeg', 'image/png')
      and photo_size_bytes between 1 and 5000000
  ),
  constraint vehicles_tenant_vehicle_unique unique (tenant_id, vehicle_id),
  constraint vehicles_tenant_number_unique unique (tenant_id, vehicle_number),
  constraint vehicles_tenant_plate_unique unique (tenant_id, license_plate),
  constraint vehicles_tenant_vin_unique unique (tenant_id, vin)
);

create table public.driver_vehicle_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  driver_profile_id uuid not null,
  vehicle_id uuid not null,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  assignment_notes text,
  created_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  ended_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint driver_vehicle_assignment_dates check (ended_at is null or ended_at > assigned_at),
  constraint driver_vehicle_assignment_end_actor check (
    (ended_at is null and ended_by_person_id is null)
    or (ended_at is not null and ended_by_person_id is not null)
  ),
  constraint driver_vehicle_assignments_driver_fk foreign key (tenant_id, driver_profile_id)
    references public.driver_profiles (tenant_id, driver_profile_id) on delete restrict,
  constraint driver_vehicle_assignments_vehicle_fk foreign key (tenant_id, vehicle_id)
    references public.vehicles (tenant_id, vehicle_id) on delete restrict
);

create unique index driver_vehicle_assignments_active_driver_idx
  on public.driver_vehicle_assignments (tenant_id, driver_profile_id) where ended_at is null;
create unique index driver_vehicle_assignments_active_vehicle_idx
  on public.driver_vehicle_assignments (tenant_id, vehicle_id) where ended_at is null;
create index driver_vehicle_assignments_history_idx
  on public.driver_vehicle_assignments (tenant_id, assigned_at desc);

create trigger vehicles_set_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();

create or replace function public.can_read_vehicle_management(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_active_tenant_membership(target_tenant_id)
    and public.tenant_capability_enabled(target_tenant_id, 'vehicle.management');
$$;

create or replace function public.can_manage_vehicle_management(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_tenant_role(target_tenant_id, array['tenant_owner', 'tenant_admin'])
    and public.tenant_capability_enabled(target_tenant_id, 'vehicle.management');
$$;

create or replace function public.validate_vehicle_change()
returns trigger language plpgsql set search_path = public as $$
begin
  new.vehicle_number := btrim(new.vehicle_number);
  new.make := btrim(new.make);
  new.model := btrim(new.model);
  new.color := btrim(new.color);
  new.license_plate := upper(btrim(new.license_plate));
  new.vin := upper(btrim(new.vin));
  new.status_reason := nullif(btrim(new.status_reason), '');
  if tg_op = 'UPDATE' and new.tenant_id <> old.tenant_id then
    raise exception 'vehicle tenant cannot change';
  end if;
  if tg_op = 'UPDATE' and new.status <> old.status and not (
    (old.status = 'draft' and new.status in ('active', 'retired')) or
    (old.status = 'active' and new.status in ('suspended', 'retired')) or
    (old.status = 'suspended' and new.status in ('active', 'retired'))
  ) then
    raise exception 'invalid vehicle lifecycle transition from % to %', old.status, new.status;
  end if;
  if tg_op = 'UPDATE' and new.status in ('suspended', 'retired') and exists (
    select 1 from public.driver_vehicle_assignments assignment
    where assignment.tenant_id = new.tenant_id
      and assignment.vehicle_id = new.vehicle_id
      and assignment.ended_at is null
  ) then
    raise exception 'unassign the vehicle before suspending or retiring it';
  end if;
  return new;
end;
$$;
create trigger vehicles_validate_change before insert or update on public.vehicles
  for each row execute function public.validate_vehicle_change();

create or replace function public.validate_driver_vehicle_assignment()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.driver_profile_id is distinct from old.driver_profile_id
    or new.vehicle_id is distinct from old.vehicle_id
    or new.assigned_at is distinct from old.assigned_at
    or new.created_by_person_id is distinct from old.created_by_person_id
    or old.ended_at is not null
    or new.ended_at is null
  ) then raise exception 'vehicle assignment history is immutable; only an active assignment can be ended';
  end if;
  if new.ended_at is null and not exists (
    select 1 from public.vehicles vehicle
    where vehicle.tenant_id = new.tenant_id and vehicle.vehicle_id = new.vehicle_id
      and vehicle.status = 'active'
  ) then raise exception 'only active vehicles can be assigned'; end if;
  if new.ended_at is null and not exists (
    select 1 from public.driver_profiles driver
    where driver.tenant_id = new.tenant_id and driver.driver_profile_id = new.driver_profile_id
      and driver.status not in ('suspended', 'inactive', 'archived')
  ) then raise exception 'this driver cannot receive a vehicle assignment'; end if;
  return new;
end;
$$;
create trigger driver_vehicle_assignments_validate before insert or update
  on public.driver_vehicle_assignments for each row
  execute function public.validate_driver_vehicle_assignment();

create or replace function public.audit_vehicle_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    new.tenant_id,
    case when tg_op = 'INSERT' then 'vehicle.created'
      when new.status is distinct from old.status then 'vehicle.status_changed'
      else 'vehicle.updated' end,
    'person', public.current_person_id(), '{}',
    coalesce(new.status_reason, case when tg_op = 'INSERT'
      then 'Vehicle created.' else 'Vehicle updated.' end),
    gen_random_uuid(), 'vehicle', new.vehicle_id::text,
    jsonb_build_object('vehicle_number', new.vehicle_number, 'status', new.status)
  );
  return new;
end;
$$;
create trigger vehicles_audit after insert or update on public.vehicles
  for each row execute function public.audit_vehicle_change();

create or replace function public.audit_driver_vehicle_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    new.tenant_id,
    case when tg_op = 'INSERT' then 'vehicle.assigned' else 'vehicle.unassigned' end,
    'person', public.current_person_id(), '{}',
    case when tg_op = 'INSERT' then 'Vehicle assigned to driver.' else 'Vehicle assignment ended.' end,
    gen_random_uuid(), 'driver_vehicle_assignment', new.assignment_id::text,
    jsonb_build_object('driver_profile_id', new.driver_profile_id, 'vehicle_id', new.vehicle_id)
  );
  return new;
end;
$$;
create trigger driver_vehicle_assignments_audit after insert or update of ended_at
  on public.driver_vehicle_assignments for each row
  execute function public.audit_driver_vehicle_assignment();

alter table public.vehicles enable row level security;
alter table public.driver_vehicle_assignments enable row level security;
create policy vehicles_select_authorized on public.vehicles for select to authenticated
  using (public.can_read_vehicle_management(tenant_id));
create policy vehicles_insert_manager on public.vehicles for insert to authenticated
  with check (public.can_manage_vehicle_management(tenant_id)
    and created_by_person_id = public.current_person_id()
    and updated_by_person_id = public.current_person_id());
create policy vehicles_update_manager on public.vehicles for update to authenticated
  using (public.can_manage_vehicle_management(tenant_id))
  with check (public.can_manage_vehicle_management(tenant_id)
    and updated_by_person_id = public.current_person_id());
create policy assignments_select_authorized on public.driver_vehicle_assignments for select to authenticated
  using (public.can_read_vehicle_management(tenant_id));
create policy assignments_insert_manager on public.driver_vehicle_assignments for insert to authenticated
  with check (public.can_manage_vehicle_management(tenant_id)
    and created_by_person_id = public.current_person_id());
create policy assignments_update_manager on public.driver_vehicle_assignments for update to authenticated
  using (public.can_manage_vehicle_management(tenant_id))
  with check (public.can_manage_vehicle_management(tenant_id)
    and ended_by_person_id = public.current_person_id());

insert into public.tenant_capabilities (
  tenant_id, capability_key, enabled, enabled_at, disabled_at, updated_by_person_id
)
select capability.tenant_id, 'vehicle.management', capability.enabled,
  case when capability.enabled then now() else null end,
  case when capability.enabled then null else now() end,
  capability.updated_by_person_id
from public.tenant_capabilities capability
where capability.capability_key = 'driver.management'
on conflict (tenant_id, capability_key) do nothing;

create or replace function public.seed_driver_management_capability()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tenant_capabilities (
    tenant_id, capability_key, enabled, disabled_at, updated_by_person_id
  ) values
    (new.tenant_id, 'driver.management', false, now(), public.current_person_id()),
    (new.tenant_id, 'vehicle.management', false, now(), public.current_person_id())
  on conflict (tenant_id, capability_key) do nothing;
  return new;
end;
$$;

grant select, insert, update on public.vehicles to authenticated;
grant select, insert, update on public.driver_vehicle_assignments to authenticated;
grant execute on function public.can_read_vehicle_management(uuid) to authenticated;
grant execute on function public.can_manage_vehicle_management(uuid) to authenticated;

create or replace function public.my_driver_portal_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'driverProfileId', driver.driver_profile_id,
    'driverNumber', driver.driver_number,
    'displayName', driver.display_name,
    'email', driver.email,
    'phone', driver.phone,
    'status', driver.status,
    'onboardingStatus', checklist.review_status,
    'documentCompliance', checklist.documents_reviewed,
    'notificationPreferences', jsonb_build_object(
      'expirationRemindersEnabled', coalesce(preferences.expiration_reminders_enabled, true)
    ),
    'vehicle', (
      select jsonb_build_object(
        'vehicleId', vehicle.vehicle_id, 'vehicleNumber', vehicle.vehicle_number,
        'make', vehicle.make, 'model', vehicle.model, 'modelYear', vehicle.model_year,
        'color', vehicle.color, 'licensePlate', vehicle.license_plate,
        'status', vehicle.status, 'hasPhoto', vehicle.photo_storage_path is not null,
        'photoStorageBucket', vehicle.photo_storage_bucket,
        'photoStoragePath', vehicle.photo_storage_path
      )
      from public.driver_vehicle_assignments assignment
      join public.vehicles vehicle on vehicle.vehicle_id = assignment.vehicle_id
      where assignment.driver_profile_id = driver.driver_profile_id and assignment.ended_at is null
      limit 1
    ),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'evidenceType', requirement.evidence_type,
        'requiredForActivation', requirement.required_for_activation,
        'expirationRequired', requirement.expiration_required,
        'reviewStatus', case
          when evidence.evidence_id is null then 'missing'
          when evidence.review_status = 'approved' and requirement.expiration_required
            and evidence.expires_on is null then 'expiration_missing'
          when evidence.review_status = 'approved' and requirement.expiration_required
            and evidence.expires_on <= current_date then 'expired'
          when evidence.review_status = 'approved' and evidence.expires_on is not null
            and evidence.expires_on < current_date then 'expired'
          else evidence.review_status end,
        'reviewNotes', evidence.review_notes, 'expiresOn', evidence.expires_on,
        'submittedAt', evidence.submitted_at, 'originalFileName', evidence.original_file_name
      ) order by requirement.evidence_type)
      from public.driver_evidence_requirements requirement
      left join lateral (
        select submitted.* from public.driver_evidence submitted
        where submitted.tenant_id = driver.tenant_id
          and submitted.driver_profile_id = driver.driver_profile_id
          and submitted.evidence_type = requirement.evidence_type
        order by submitted.submitted_at desc, submitted.created_at desc limit 1
      ) evidence on true where requirement.tenant_id = driver.tenant_id
    ), '[]'::jsonb)
  )
  from public.driver_profiles driver
  join public.person_profiles person on person.person_id = driver.person_id
  left join public.driver_onboarding_checklists checklist
    on checklist.driver_profile_id = driver.driver_profile_id
  left join public.driver_notification_preferences preferences
    on preferences.driver_profile_id = driver.driver_profile_id
  where person.auth_user_id = auth.uid()
  order by driver.created_at limit 1;
$$;
grant execute on function public.my_driver_portal_summary() to authenticated;
