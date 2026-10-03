-- Driver-owned application status and atomic evidence submission, including vehicle insurance.
alter table public.driver_applications add constraint driver_applications_tenant_application_unique
  unique (tenant_id, driver_application_id);
alter table public.vehicle_evidence add constraint vehicle_evidence_tenant_evidence_unique
  unique (tenant_id, evidence_id);

create table public.driver_application_insurance (
  insurance_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  driver_application_id uuid not null,
  storage_bucket text not null default 'driver-application-files' check (storage_bucket = 'driver-application-files'),
  storage_path text not null check (length(btrim(storage_path)) > 0),
  original_file_name text not null check (length(btrim(original_file_name)) between 1 and 200),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 1000000),
  submitted_at timestamptz not null default now(),
  vehicle_evidence_id uuid,
  unique (tenant_id, driver_application_id),
  unique (storage_bucket, storage_path),
  foreign key (tenant_id, driver_application_id) references public.driver_applications (tenant_id, driver_application_id) on delete restrict,
  foreign key (tenant_id, vehicle_evidence_id) references public.vehicle_evidence (tenant_id, evidence_id) on delete restrict
);
alter table public.driver_application_insurance enable row level security;
create policy driver_application_insurance_read on public.driver_application_insurance for select to authenticated
  using (public.can_manage_driver_management(tenant_id));
grant select on public.driver_application_insurance to authenticated;
grant all on public.driver_application_insurance to service_role;

create or replace function public.my_driver_applications()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare applicant_id uuid := auth.uid();
begin
  if applicant_id is null or not exists (
    select 1 from auth.users u where u.id = applicant_id and u.email_confirmed_at is not null
      and lower(btrim(u.email)) = lower(btrim(auth.jwt() ->> 'email'))
  ) then raise exception 'A verified email session is required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'applicationId', a.driver_application_id, 'tenantSlug', c.tenant_slug,
      'companyName', c.display_name, 'fullName', a.full_name, 'phone', a.phone,
      'status', a.application_status, 'submittedAt', a.submitted_at,
      'documents', coalesce((select jsonb_agg(doc order by submitted_at desc) from (
        select jsonb_build_object(
        'type', e.evidence_type, 'status', e.review_status, 'fileName', e.original_file_name,
        'reviewNotes', e.review_notes
      ) doc, e.submitted_at from public.driver_evidence e
        where e.driver_application_id = a.driver_application_id and e.tenant_id = a.tenant_id
        union all
        select jsonb_build_object('type', 'insurance', 'status', case
          when ve.evidence_id is null then 'awaiting_vehicle'
          when ve.review_status = 'approved' and ve.expires_on <= current_date then 'expired'
          when ve.review_status = 'approved' and r.expiration_required and ve.expires_on is null then 'expiration_missing'
          else ve.review_status end,
          'fileName', i.original_file_name, 'reviewNotes', ve.review_notes), i.submitted_at
        from public.driver_application_insurance i
        left join public.vehicle_evidence ve on ve.tenant_id = i.tenant_id and ve.evidence_id = i.vehicle_evidence_id
        left join public.vehicle_evidence_requirements r on r.tenant_id = i.tenant_id and r.evidence_type = 'insurance'
        where i.driver_application_id = a.driver_application_id and i.tenant_id = a.tenant_id
      ) uploads), '[]'::jsonb)
    ) order by a.submitted_at desc)
    from public.driver_applications a
    join public.tenant_configurations c on c.tenant_id = a.tenant_id
    where a.applicant_auth_user_id = applicant_id
      and lower(btrim(a.email)) = lower(btrim(auth.jwt() ->> 'email'))
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.my_driver_applications() from public, anon;
grant execute on function public.my_driver_applications() to authenticated;

-- Trusted Driver server only. Identity comes from auth.getUser(), never from multipart input.
-- Uploads precede this transaction; only existing private objects may be attached.
create or replace function public.submit_driver_application_with_evidence_internal(
  applicant_user_id uuid, application_tenant_slug text, applicant_name text,
  applicant_phone text, uploaded_evidence jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  target_tenant uuid;
  verified_email text;
  app public.driver_applications;
  item jsonb;
  accepted_paths jsonb := '[]'::jsonb;
  required_type text;
begin
  select lower(btrim(u.email)) into verified_email from auth.users u
    where u.id = applicant_user_id and u.email_confirmed_at is not null;
  if verified_email is null then raise exception 'A verified email session is required'; end if;
  if applicant_name is null or length(btrim(applicant_name)) not between 2 and 120
    or coalesce(length(applicant_phone), 0) > 40 then raise exception 'Invalid applicant details'; end if;
  select c.tenant_id into target_tenant from public.tenant_configurations c
    join public.tenants t on t.tenant_id = c.tenant_id
    join public.tenant_capabilities cap on cap.tenant_id = c.tenant_id
      and cap.capability_key = 'driver.management' and cap.enabled
    where c.tenant_slug = lower(btrim(application_tenant_slug)) and t.status = 'active';
  if target_tenant is null then raise exception 'This company is not accepting applications'; end if;
  if uploaded_evidence is null or jsonb_typeof(uploaded_evidence) <> 'array' then
    raise exception 'Evidence is required';
  end if;
  if jsonb_array_length(uploaded_evidence) not between 1 and 4 then raise exception 'Invalid evidence count'; end if;

  -- Serialize retries, duplicate requests, and creation for this verified identity/company.
  perform pg_advisory_xact_lock(hashtextextended(target_tenant::text || applicant_user_id::text, 0));
  select * into app from public.driver_applications a
    where a.tenant_id = target_tenant and a.applicant_auth_user_id = applicant_user_id
      and a.application_status in ('submitted', 'under_review', 'approved')
    order by a.submitted_at desc limit 1 for update;
  if app.driver_application_id is null then
    insert into public.driver_applications (
      tenant_id, applicant_auth_user_id, email_verified_at, full_name, email, phone
    ) values (target_tenant, applicant_user_id, now(), btrim(applicant_name), verified_email,
      nullif(btrim(applicant_phone), '')) returning * into app;
  end if;
  if app.application_status <> 'submitted' or lower(btrim(app.email)) <> verified_email then
    raise exception 'This application cannot receive new uploads; refresh its status';
  end if;

  for item in select value from jsonb_array_elements(uploaded_evidence) loop
    if item ->> 'evidence_type' is null or item ->> 'evidence_type' not in
      ('personal_photo', 'vehicle_photo', 'reference_document', 'insurance')
      or item ->> 'storage_path' is null
      or item ->> 'storage_path' not like target_tenant::text || '/' || applicant_user_id::text || '/%'
      or item ->> 'mime_type' is null or item ->> 'mime_type' not in ('image/jpeg', 'image/png', 'application/pdf')
      or (item ->> 'mime_type' = 'application/pdf' and item ->> 'evidence_type' not in ('reference_document', 'insurance'))
      or coalesce((item ->> 'size_bytes')::bigint, 0) not between 1 and 1000000
      or coalesce(length(btrim(item ->> 'original_file_name')), 0) not between 1 and 200
    then raise exception 'Invalid application evidence'; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'driver-application-files'
      and o.name = item ->> 'storage_path') then raise exception 'Evidence upload is missing'; end if;
    -- Preserve existing evidence and every administrator review. Concurrent retries are harmless.
    if item ->> 'evidence_type' = 'insurance' then
      if not exists (select 1 from public.driver_application_insurance i where i.tenant_id = target_tenant
        and i.driver_application_id = app.driver_application_id) then
        insert into public.driver_application_insurance (tenant_id, driver_application_id,
          storage_path, original_file_name, mime_type, size_bytes)
        values (target_tenant, app.driver_application_id, item ->> 'storage_path',
          item ->> 'original_file_name', item ->> 'mime_type', (item ->> 'size_bytes')::bigint);
        accepted_paths := accepted_paths || jsonb_build_array(item ->> 'storage_path');
      end if;
    elsif not exists (select 1 from public.driver_evidence e where e.tenant_id = target_tenant
      and e.driver_application_id = app.driver_application_id and e.evidence_type = item ->> 'evidence_type') then
      insert into public.driver_evidence (tenant_id, driver_application_id, evidence_type,
        storage_path, original_file_name, mime_type, size_bytes)
      values (target_tenant, app.driver_application_id, item ->> 'evidence_type',
        item ->> 'storage_path', item ->> 'original_file_name', item ->> 'mime_type', (item ->> 'size_bytes')::bigint);
      accepted_paths := accepted_paths || jsonb_build_array(item ->> 'storage_path');
      update public.driver_applications set
        personal_photo_path = case when item ->> 'evidence_type' = 'personal_photo' then item ->> 'storage_path' else personal_photo_path end,
        vehicle_photo_path = case when item ->> 'evidence_type' = 'vehicle_photo' then item ->> 'storage_path' else vehicle_photo_path end,
        document_path = case when item ->> 'evidence_type' = 'reference_document' then item ->> 'storage_path' else document_path end
      where driver_application_id = app.driver_application_id;
    end if;
  end loop;
  if not exists (select 1 from public.driver_application_insurance i where i.tenant_id = target_tenant
    and i.driver_application_id = app.driver_application_id) then
    raise exception 'Vehicle insurance document is required';
  end if;
  foreach required_type in array array['personal_photo', 'vehicle_photo', 'reference_document'] loop
    if not exists (select 1 from public.driver_evidence e where e.tenant_id = target_tenant
      and e.driver_application_id = app.driver_application_id and e.evidence_type = required_type) then
      raise exception 'All four application files are required';
    end if;
  end loop;
  if jsonb_array_length(accepted_paths) > 0 then
    insert into public.tenant_audit_events (tenant_id, event_name, actor_type, reason,
      correlation_id, resource_type, resource_id, metadata)
    values (target_tenant, 'driver.application_evidence_submitted', 'service_principal',
      'Verified applicant submitted evidence through ESH Driver.', gen_random_uuid(),
      'driver_application', app.driver_application_id::text,
      jsonb_build_object('applicant_auth_user_id', applicant_user_id, 'file_count', jsonb_array_length(accepted_paths)));
  end if;
  return jsonb_build_object('applicationId', app.driver_application_id, 'acceptedPaths', accepted_paths);
end;
$$;
revoke all on function public.submit_driver_application_with_evidence_internal(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_driver_application_with_evidence_internal(uuid, text, text, text, jsonb)
  to service_role;

-- Explicit administrative handoff to the actual assigned vehicle; never infer a vehicle from a photo.
create or replace function public.link_driver_application_insurance(
  target_application_id uuid, target_vehicle_id uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare app public.driver_applications; insurance public.driver_application_insurance;
  actor_id uuid := public.current_person_id(); result_id uuid; existing_vehicle uuid;
begin
  select * into app from public.driver_applications where driver_application_id = target_application_id for update;
  if app.driver_application_id is null or actor_id is null
    or not public.can_manage_driver_management(app.tenant_id)
    or not public.can_manage_vehicle_management(app.tenant_id) then raise exception 'Driver and vehicle management permission is required'; end if;
  if app.application_status <> 'approved' or app.driver_profile_id is null then raise exception 'An approved application is required'; end if;
  perform 1 from public.driver_vehicle_assignments where tenant_id = app.tenant_id
    and driver_profile_id = app.driver_profile_id and vehicle_id = target_vehicle_id and ended_at is null for update;
  if not found then raise exception 'This vehicle is not assigned to this applicant'; end if;
  select * into insurance from public.driver_application_insurance where tenant_id = app.tenant_id
    and driver_application_id = app.driver_application_id for update;
  if insurance.insurance_id is null then raise exception 'Application insurance is missing'; end if;
  if insurance.vehicle_evidence_id is not null then
    select vehicle_id into existing_vehicle from public.vehicle_evidence
      where tenant_id = app.tenant_id and evidence_id = insurance.vehicle_evidence_id;
    if existing_vehicle <> target_vehicle_id then raise exception 'Insurance is already linked to a different vehicle'; end if;
    return insurance.vehicle_evidence_id;
  end if;
  perform 1 from public.vehicles where tenant_id = app.tenant_id and vehicle_id = target_vehicle_id for update;
  -- Do not replace newer/reviewed vehicle insurance with an older application upload.
  if exists (select 1 from public.vehicle_evidence where tenant_id = app.tenant_id
    and vehicle_id = target_vehicle_id and evidence_type = 'insurance') then
    raise exception 'This vehicle already has insurance evidence; use its existing review workflow';
  end if;
  insert into public.vehicle_evidence (tenant_id, vehicle_id, evidence_type, storage_bucket,
    storage_path, original_file_name, mime_type, size_bytes, submitted_by_person_id)
  values (app.tenant_id, target_vehicle_id, 'insurance', insurance.storage_bucket,
    insurance.storage_path, insurance.original_file_name, insurance.mime_type, insurance.size_bytes, actor_id)
  returning evidence_id into result_id;
  update public.driver_application_insurance set vehicle_evidence_id = result_id where insurance_id = insurance.insurance_id;
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_person_id,
    reason, correlation_id, resource_type, resource_id, metadata)
  values (app.tenant_id, 'driver.application_insurance_linked', 'person', actor_id,
    'Application insurance linked for assigned vehicle review.', gen_random_uuid(), 'vehicle_evidence', result_id::text,
    jsonb_build_object('driver_application_id', target_application_id, 'vehicle_id', target_vehicle_id));
  return result_id;
end; $$;
revoke all on function public.link_driver_application_insurance(uuid, uuid) from public, anon;
grant execute on function public.link_driver_application_insurance(uuid, uuid) to authenticated;

-- Serialize insurance inserts so the explicit handoff cannot supersede a concurrent newer upload.
create function public.serialize_vehicle_insurance_upload() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.evidence_type = 'insurance' then
    perform 1 from public.vehicles where tenant_id = new.tenant_id and vehicle_id = new.vehicle_id for update;
    if exists (select 1 from public.driver_application_insurance i where i.tenant_id = new.tenant_id
      and i.storage_bucket = new.storage_bucket and i.storage_path = new.storage_path)
      and exists (select 1 from public.vehicle_evidence e where e.tenant_id = new.tenant_id
        and e.vehicle_id = new.vehicle_id and e.evidence_type = 'insurance') then
      raise exception 'This vehicle already has insurance evidence; use its existing review workflow';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.serialize_vehicle_insurance_upload() from public, anon, authenticated;
create trigger vehicle_insurance_serialize_upload before insert on public.vehicle_evidence
  for each row execute function public.serialize_vehicle_insurance_upload();
