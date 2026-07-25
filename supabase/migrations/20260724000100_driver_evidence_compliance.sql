-- Driver evidence and compliance MVP.
-- Evidence metadata is tenant scoped; driver activation derives from approved, unexpired requirements.

create table public.driver_evidence_requirements (
  tenant_id uuid not null references public.tenants (tenant_id) on delete cascade,
  evidence_type text not null,
  required_for_activation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  primary key (tenant_id, evidence_type),
  constraint driver_evidence_requirements_type_check check (
    evidence_type in ('personal_photo', 'reference_document', 'vehicle_photo')
  )
);

create trigger driver_evidence_requirements_set_updated_at
  before update on public.driver_evidence_requirements
  for each row execute function public.set_updated_at();

create table public.driver_evidence (
  evidence_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  driver_application_id uuid references public.driver_applications (driver_application_id) on delete restrict,
  driver_profile_id uuid references public.driver_profiles (driver_profile_id) on delete restrict,
  evidence_type text not null,
  storage_bucket text not null default 'driver-application-files',
  storage_path text not null,
  original_file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  review_status text not null default 'pending',
  review_notes text,
  expires_on date,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_evidence_subject_check check (
    driver_application_id is not null or driver_profile_id is not null
  ),
  constraint driver_evidence_type_check check (
    evidence_type in ('personal_photo', 'reference_document', 'vehicle_photo')
  ),
  constraint driver_evidence_review_status_check check (
    review_status in ('pending', 'approved', 'rejected')
  ),
  constraint driver_evidence_file_name_not_blank check (length(btrim(original_file_name)) > 0),
  constraint driver_evidence_mime_type_check check (
    mime_type in ('image/jpeg', 'image/png', 'application/pdf')
  ),
  constraint driver_evidence_size_check check (size_bytes > 0 and size_bytes <= 5000000),
  constraint driver_evidence_review_fields_check check (
    (review_status = 'pending' and reviewed_at is null and reviewed_by_person_id is null)
    or
    (review_status in ('approved', 'rejected') and reviewed_at is not null and reviewed_by_person_id is not null)
  ),
  constraint driver_evidence_rejection_notes_check check (
    review_status <> 'rejected' or length(btrim(review_notes)) > 0
  ),
  unique (storage_bucket, storage_path)
);

create index driver_evidence_tenant_review_idx
  on public.driver_evidence (tenant_id, review_status, submitted_at desc);

create index driver_evidence_application_idx
  on public.driver_evidence (driver_application_id, evidence_type)
  where driver_application_id is not null;

create index driver_evidence_profile_idx
  on public.driver_evidence (driver_profile_id, evidence_type)
  where driver_profile_id is not null;

create trigger driver_evidence_set_updated_at
  before update on public.driver_evidence
  for each row execute function public.set_updated_at();

alter table public.driver_evidence_requirements enable row level security;
alter table public.driver_evidence enable row level security;

create policy driver_evidence_requirements_select
  on public.driver_evidence_requirements for select to authenticated
  using (public.can_read_driver_management(tenant_id));

create policy driver_evidence_requirements_manage
  on public.driver_evidence_requirements for all to authenticated
  using (public.can_manage_driver_management(tenant_id))
  with check (public.can_manage_driver_management(tenant_id));

create policy driver_evidence_select
  on public.driver_evidence for select to authenticated
  using (public.can_read_driver_management(tenant_id));

create policy driver_evidence_review
  on public.driver_evidence for update to authenticated
  using (public.can_manage_driver_management(tenant_id))
  with check (public.can_manage_driver_management(tenant_id));

grant select, insert, update, delete on public.driver_evidence_requirements to authenticated;
grant select, update on public.driver_evidence to authenticated;
grant all on public.driver_evidence_requirements, public.driver_evidence to service_role;

insert into public.driver_evidence_requirements (tenant_id, evidence_type, required_for_activation)
select tenant_id, evidence_type, true
from public.tenants
cross join (values ('personal_photo'), ('reference_document')) as defaults(evidence_type)
on conflict do nothing;

create or replace function public.seed_driver_evidence_requirements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.driver_evidence_requirements (tenant_id, evidence_type, required_for_activation)
  values
    (new.tenant_id, 'personal_photo', true),
    (new.tenant_id, 'reference_document', true)
  on conflict do nothing;
  return new;
end;
$$;

create trigger tenants_seed_driver_evidence_requirements
  after insert on public.tenants
  for each row execute function public.seed_driver_evidence_requirements();

-- Backfill metadata for files submitted before evidence records existed.
insert into public.driver_evidence (
  tenant_id, driver_application_id, driver_profile_id, evidence_type, storage_path,
  original_file_name, mime_type, size_bytes
)
select
  tenant_id, driver_application_id, driver_profile_id, evidence_type, storage_path,
  regexp_replace(storage_path, '^.*/', ''),
  case when lower(storage_path) like '%.pdf' then 'application/pdf' else 'image/jpeg' end,
  1
from (
  select tenant_id, driver_application_id, driver_profile_id, 'personal_photo'::text as evidence_type,
    personal_photo_path as storage_path
  from public.driver_applications where personal_photo_path is not null
  union all
  select tenant_id, driver_application_id, driver_profile_id, 'vehicle_photo', vehicle_photo_path
  from public.driver_applications where vehicle_photo_path is not null
  union all
  select tenant_id, driver_application_id, driver_profile_id, 'reference_document', document_path
  from public.driver_applications where document_path is not null
) legacy;

create or replace function public.driver_compliance_satisfied(target_driver_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.driver_profiles dp
    join public.driver_evidence_requirements requirement
      on requirement.tenant_id = dp.tenant_id
      and requirement.required_for_activation
    where dp.driver_profile_id = target_driver_profile_id
      and not exists (
        select 1
        from public.driver_evidence evidence
        where evidence.tenant_id = dp.tenant_id
          and evidence.driver_profile_id = dp.driver_profile_id
          and evidence.evidence_type = requirement.evidence_type
          and evidence.review_status = 'approved'
          and (evidence.expires_on is null or evidence.expires_on >= current_date)
      )
  );
$$;

create or replace function public.enforce_driver_compliance_activation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'active'
    and old.status is distinct from 'active'
    and (
      not public.driver_compliance_satisfied(new.driver_profile_id)
      or not exists (
        select 1
        from public.driver_onboarding_checklists checklist
        where checklist.driver_profile_id = new.driver_profile_id
          and checklist.review_status = 'approved'
      )
    )
  then
    raise exception 'driver onboarding and evidence requirements must be approved before activation';
  end if;
  return new;
end;
$$;

create trigger driver_profiles_enforce_compliance_activation
  before update on public.driver_profiles
  for each row execute function public.enforce_driver_compliance_activation();

create or replace function public.sync_driver_document_compliance(target_driver_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.driver_onboarding_checklists
  set documents_reviewed = public.driver_compliance_satisfied(target_driver_profile_id)
  where driver_profile_id = target_driver_profile_id;
end;
$$;

create or replace function public.audit_driver_evidence_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := public.current_person_id();
begin
  if new.review_status is distinct from old.review_status then
    insert into public.tenant_audit_events (
      tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles,
      reason, correlation_id, resource_type, resource_id, metadata
    ) values (
      new.tenant_id,
      'driver.evidence_reviewed',
      'person',
      actor_id,
      '{}',
      coalesce(new.review_notes, 'Driver evidence review status changed.'),
      gen_random_uuid(),
      'driver_evidence',
      new.evidence_id::text,
      jsonb_build_object(
        'evidence_type', new.evidence_type,
        'previous_status', old.review_status,
        'status', new.review_status,
        'driver_profile_id', new.driver_profile_id
      )
    );
  end if;

  if new.driver_profile_id is not null then
    perform public.sync_driver_document_compliance(new.driver_profile_id);
  end if;
  return new;
end;
$$;

create trigger driver_evidence_audit_review
  after update on public.driver_evidence
  for each row execute function public.audit_driver_evidence_review();

-- Existing upload policies allowed every anonymous or authenticated caller to write/read the whole bucket.
drop policy if exists driver_application_files_insert on storage.objects;
drop policy if exists driver_application_files_select on storage.objects;

revoke execute on function public.attach_driver_application_files(uuid, text, text, text)
  from anon, authenticated;
grant execute on function public.attach_driver_application_files(uuid, text, text, text)
  to service_role;

create or replace function public.approve_driver_application(target_application_id uuid, actor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.driver_applications;
  new_driver uuid;
begin
  if not public.can_manage_driver_management(
    (select tenant_id from public.driver_applications where driver_application_id = target_application_id)
  ) then
    raise exception 'driver management permission is required';
  end if;

  select * into app
  from public.driver_applications
  where driver_application_id = target_application_id
  for update;

  if app.driver_application_id is null then raise exception 'application not found'; end if;
  if app.application_status = 'approved' and app.driver_profile_id is not null then
    return app.driver_profile_id;
  end if;

  insert into public.driver_profiles (
    tenant_id, driver_number, display_name, email, phone, status,
    created_by_person_id, updated_by_person_id
  )
  values (
    app.tenant_id,
    lpad((
      select coalesce(max(nullif(driver_number, '')::int), 0) + 1
      from public.driver_profiles
      where tenant_id = app.tenant_id and driver_number ~ '^[0-9]+$'
    )::text, 3, '0'),
    app.full_name, app.email, app.phone, 'draft', actor_id, actor_id
  )
  returning driver_profile_id into new_driver;

  update public.driver_applications
  set application_status = 'approved', driver_profile_id = new_driver,
      reviewed_by_person_id = actor_id, reviewed_at = now()
  where driver_application_id = target_application_id;

  update public.driver_evidence
  set driver_profile_id = new_driver
  where driver_application_id = target_application_id;

  perform public.sync_driver_document_compliance(new_driver);
  return new_driver;
end;
$$;
