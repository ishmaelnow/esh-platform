-- Restore application insurance to the existing driver evidence review workflow.
-- Forward correction: the deployed applicant migration and historical records remain intact.
alter table public.driver_evidence drop constraint driver_evidence_type_check;
alter table public.driver_evidence add constraint driver_evidence_type_check
  check (evidence_type in ('personal_photo', 'reference_document', 'vehicle_photo', 'insurance'));
alter table public.driver_evidence_requirements drop constraint driver_evidence_requirements_type_check;
alter table public.driver_evidence_requirements add constraint driver_evidence_requirements_type_check
  check (evidence_type in ('personal_photo', 'reference_document', 'vehicle_photo', 'insurance'));

-- Prevent old clients from creating new vehicle links. Keep historical links/files for audit.
revoke all on function public.link_driver_application_insurance(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Preserve original file identity, timestamps and any actual linked review. No file is moved.
-- Add the insurance expiration requirement AFTER this import so historical expired approvals
-- remain historical approvals; ordinary compliance derives expiration using the original date.
insert into public.driver_evidence (
  evidence_id, tenant_id, driver_application_id, driver_profile_id, evidence_type,
  storage_bucket, storage_path, original_file_name, mime_type, size_bytes, submitted_at,
  review_status, review_notes, expires_on, reviewed_at, reviewed_by_person_id
)
select i.insurance_id, i.tenant_id, i.driver_application_id, a.driver_profile_id, 'insurance',
  i.storage_bucket, i.storage_path, i.original_file_name, i.mime_type, i.size_bytes, i.submitted_at,
  coalesce(v.review_status, 'pending'), v.review_notes, v.expires_on, v.reviewed_at, v.reviewed_by_person_id
from public.driver_application_insurance i
join public.driver_applications a on a.tenant_id = i.tenant_id
  and a.driver_application_id = i.driver_application_id
left join public.vehicle_evidence v on v.tenant_id = i.tenant_id and v.evidence_id = i.vehicle_evidence_id
on conflict (storage_bucket, storage_path) do nothing;

insert into public.tenant_audit_events (tenant_id, event_name, actor_type, reason,
  correlation_id, resource_type, resource_id, metadata)
select i.tenant_id, 'driver.application_insurance_review_restored', 'service_principal',
  'Application insurance restored to existing application evidence review.', gen_random_uuid(),
  'driver_application', i.driver_application_id::text,
  jsonb_build_object('evidence_id', e.evidence_id, 'legacy_insurance_id', i.insurance_id)
from public.driver_application_insurance i
join public.driver_evidence e on e.tenant_id = i.tenant_id
  and e.driver_application_id = i.driver_application_id
  and e.storage_bucket = i.storage_bucket and e.storage_path = i.storage_path
where e.evidence_type = 'insurance';

-- Insurance is an additional reviewable document, not a new blanket activation gate on
-- previously approved Drivers. Existing tenant requirements are untouched.
insert into public.driver_evidence_requirements
  (tenant_id, evidence_type, required_for_activation, expiration_required)
select tenant_id, 'insurance', false, true from public.tenants on conflict do nothing;

create or replace function public.seed_application_insurance_requirement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.driver_evidence_requirements
    (tenant_id, evidence_type, required_for_activation, expiration_required)
  values (new.tenant_id, 'insurance', false, true) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.seed_application_insurance_requirement() from public, anon, authenticated;
create trigger tenants_seed_application_insurance_requirement
  after insert on public.tenants for each row
  execute function public.seed_application_insurance_requirement();

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
    if not exists (select 1 from public.driver_evidence e where e.tenant_id = target_tenant
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
  foreach required_type in array array['personal_photo', 'vehicle_photo', 'reference_document', 'insurance'] loop
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

create or replace function public.submit_my_driver_evidence(
  target_driver_profile_id uuid,
  target_evidence_type text,
  target_storage_path text,
  target_original_file_name text,
  target_mime_type text,
  target_size_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_user uuid := auth.uid();
  target_tenant_id uuid;
  storage_object storage.objects;
  new_evidence_id uuid;
begin
  if auth_user is null then raise exception 'authentication is required'; end if;
  if target_evidence_type not in ('personal_photo', 'reference_document', 'vehicle_photo', 'insurance') then
    raise exception 'unsupported evidence type';
  end if;
  if target_mime_type not in ('image/jpeg', 'image/png', 'application/pdf')
    or target_size_bytes not between 1 and 5000000
    or length(btrim(target_original_file_name)) = 0
  then
    raise exception 'files must be JPEG, PNG, or PDF and 5MB or smaller';
  end if;

  select driver.tenant_id into target_tenant_id
  from public.driver_profiles driver
  join public.person_profiles person on person.person_id = driver.person_id
  where driver.driver_profile_id = target_driver_profile_id
    and person.auth_user_id = auth_user;

  if target_tenant_id is null then raise exception 'driver profile is unavailable'; end if;
  if not exists (
    select 1
    from public.driver_evidence_requirements requirement
    where requirement.tenant_id = target_tenant_id
      and requirement.evidence_type = target_evidence_type
  ) then
    raise exception 'evidence type is not configured for this driver';
  end if;

  if target_storage_path not like
    'driver-self-service/' || auth_user::text || '/' || target_driver_profile_id::text || '/%'
  then
    raise exception 'invalid driver evidence path';
  end if;

  select object.* into storage_object
  from storage.objects object
  where object.bucket_id = 'driver-application-files'
    and object.name = target_storage_path;

  if storage_object.id is null then raise exception 'uploaded evidence file was not found'; end if;
  if coalesce((storage_object.metadata ->> 'size')::bigint, 0) <> target_size_bytes
    or coalesce(storage_object.metadata ->> 'mimetype', '') <> target_mime_type
  then
    raise exception 'uploaded evidence metadata does not match';
  end if;

  insert into public.driver_evidence (
    tenant_id,
    driver_profile_id,
    evidence_type,
    storage_path,
    original_file_name,
    mime_type,
    size_bytes
  ) values (
    target_tenant_id,
    target_driver_profile_id,
    target_evidence_type,
    target_storage_path,
    btrim(target_original_file_name),
    target_mime_type,
    target_size_bytes
  )
  returning evidence_id into new_evidence_id;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles,
    reason, correlation_id, resource_type, resource_id, metadata
  ) values (
    target_tenant_id,
    'driver.evidence_submitted',
    'person',
    public.current_person_id(),
    '{}',
    'Driver submitted replacement evidence.',
    gen_random_uuid(),
    'driver_evidence',
    new_evidence_id::text,
    jsonb_build_object(
      'evidence_type', target_evidence_type,
      'driver_profile_id', target_driver_profile_id
    )
  );

  return new_evidence_id;
end;
$$;

grant execute on function public.submit_my_driver_evidence(uuid, text, text, text, text, bigint)
  to authenticated;


