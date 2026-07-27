-- Make self-service uploads reliable and ensure the newest evidence determines compliance.

update storage.buckets
set
  file_size_limit = 5000000,
  allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf']
where id = 'driver-application-files';

drop policy if exists driver_self_service_evidence_upload on storage.objects;
create policy driver_self_service_evidence_upload
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'driver-application-files'
    and (storage.foldername(name))[1] = 'driver-self-service'
    and (storage.foldername(name))[2] = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'pdf')
    and exists (
      select 1
      from public.driver_profiles driver
      join public.person_profiles person on person.person_id = driver.person_id
      where driver.driver_profile_id::text = (storage.foldername(name))[3]
        and person.auth_user_id = auth.uid()
    )
  );

create or replace function public.driver_compliance_satisfied(target_driver_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.driver_profiles driver
    join public.driver_evidence_requirements requirement
      on requirement.tenant_id = driver.tenant_id
      and requirement.required_for_activation
    left join lateral (
      select evidence.review_status, evidence.expires_on
      from public.driver_evidence evidence
      where evidence.tenant_id = driver.tenant_id
        and evidence.driver_profile_id = driver.driver_profile_id
        and evidence.evidence_type = requirement.evidence_type
      order by evidence.submitted_at desc, evidence.created_at desc
      limit 1
    ) latest on true
    where driver.driver_profile_id = target_driver_profile_id
      and (
        latest.review_status is distinct from 'approved'
        or (latest.expires_on is not null and latest.expires_on < current_date)
      )
  );
$$;

-- Recalculate existing checklist compliance using the corrected newest-evidence rule.
update public.driver_onboarding_checklists checklist
set documents_reviewed = public.driver_compliance_satisfied(checklist.driver_profile_id);
