-- Let activated drivers see requirement status and submit private replacement evidence.

drop policy if exists driver_self_service_evidence_upload on storage.objects;
create policy driver_self_service_evidence_upload
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'driver-application-files'
    and (storage.foldername(name))[1] = 'driver-self-service'
    and (storage.foldername(name))[2] = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'pdf')
    and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 5000000
    and coalesce(metadata ->> 'mimetype', '') in ('image/jpeg', 'image/png', 'application/pdf')
    and exists (
      select 1
      from public.driver_profiles driver
      join public.person_profiles person on person.person_id = driver.person_id
      where driver.driver_profile_id::text = (storage.foldername(name))[3]
        and person.auth_user_id = auth.uid()
    )
  );

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
  if target_evidence_type not in ('personal_photo', 'reference_document', 'vehicle_photo') then
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

create or replace function public.my_driver_portal_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'driverProfileId', driver.driver_profile_id,
    'driverNumber', driver.driver_number,
    'displayName', driver.display_name,
    'email', driver.email,
    'phone', driver.phone,
    'status', driver.status,
    'onboardingStatus', checklist.review_status,
    'documentCompliance', checklist.documents_reviewed,
    'documents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'evidenceType', requirement.evidence_type,
          'requiredForActivation', requirement.required_for_activation,
          'reviewStatus', case
            when evidence.evidence_id is null then 'missing'
            when evidence.review_status = 'approved'
              and evidence.expires_on is not null
              and evidence.expires_on < current_date then 'expired'
            else evidence.review_status
          end,
          'reviewNotes', evidence.review_notes,
          'expiresOn', evidence.expires_on,
          'submittedAt', evidence.submitted_at,
          'originalFileName', evidence.original_file_name
        )
        order by requirement.evidence_type
      )
      from public.driver_evidence_requirements requirement
      left join lateral (
        select submitted.*
        from public.driver_evidence submitted
        where submitted.tenant_id = driver.tenant_id
          and submitted.driver_profile_id = driver.driver_profile_id
          and submitted.evidence_type = requirement.evidence_type
        order by submitted.submitted_at desc, submitted.created_at desc
        limit 1
      ) evidence on true
      where requirement.tenant_id = driver.tenant_id
    ), '[]'::jsonb)
  )
  from public.driver_profiles driver
  join public.person_profiles person on person.person_id = driver.person_id
  left join public.driver_onboarding_checklists checklist
    on checklist.driver_profile_id = driver.driver_profile_id
  where person.auth_user_id = auth.uid()
  order by driver.created_at
  limit 1;
$$;

grant execute on function public.my_driver_portal_summary() to authenticated;
