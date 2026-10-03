-- Owner-run, disposable/local Supabase database only. Requires all repository migrations.
-- Run with psql -v ON_ERROR_STOP=1 -f tooling/sql/driver-applicant-portal-test.sql
-- Uses storage metadata fixtures only, sends no emails and rolls back every change.
begin;

create function pg_temp.driver_assert(label text, condition boolean) returns void
language plpgsql as $$ begin
  if condition is not true then raise exception 'Driver applicant test failed: %', label; end if;
end; $$;

do $$
declare
  tenant_id_value uuid := gen_random_uuid();
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  owner_id uuid := gen_random_uuid();
  membership_id_value uuid := gen_random_uuid();
begin
  perform set_config('app.driver_test_tenant', tenant_id_value::text, true);
  perform set_config('app.driver_test_user_a', user_a::text, true);
  perform set_config('app.driver_test_user_b', user_b::text, true);
  perform set_config('app.driver_test_owner', owner_id::text, true);
  perform set_config('app.driver_test_slug', 'driver-test-' || tenant_id_value::text, true);
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (user_a, 'authenticated', 'authenticated', 'driver-test-' || user_a || '@example.invalid', now(), now(), now()),
    (user_b, 'authenticated', 'authenticated', 'driver-test-' || user_b || '@example.invalid', now(), now(), now()),
    (owner_id, 'authenticated', 'authenticated', 'driver-test-owner-' || owner_id || '@example.invalid', now(), now(), now());
  insert into public.person_profiles (person_id, auth_user_id, status, display_name, primary_email, normalized_email, activated_at)
  values (owner_id, owner_id, 'active', 'Driver test owner', 'driver-test-owner-' || owner_id || '@example.invalid',
    'driver-test-owner-' || owner_id || '@example.invalid', now());
  insert into public.tenants (tenant_id, status) values (tenant_id_value, 'provisioning');
  insert into public.tenant_configurations (tenant_id, tenant_slug, legal_name, display_name, default_time_zone, support_contact_email)
  values (tenant_id_value, current_setting('app.driver_test_slug'), 'Driver test company', 'Driver test company', 'America/Chicago', 'driver-test-support@example.invalid');
  insert into public.tenant_memberships (membership_id, tenant_id, person_id, status, activated_at)
  values (membership_id_value, tenant_id_value, owner_id, 'active', now());
  insert into public.tenant_role_assignments (tenant_id, membership_id, role_key, status, assigned_at)
  values (tenant_id_value, membership_id_value, 'tenant_owner', 'active', now());
  update public.tenants set status = 'active', activated_at = now() where tenant_id = tenant_id_value;
  insert into public.tenant_capabilities (tenant_id, capability_key, enabled, enabled_at)
  values (tenant_id_value, 'driver.management', true, now()), (tenant_id_value, 'vehicle.management', true, now())
  on conflict (tenant_id, capability_key) do update set enabled = true, enabled_at = now(), disabled_at = null;
  insert into storage.objects (bucket_id, name)
  select 'driver-application-files', tenant_id_value || '/' || u || '/fixture/' || kind || '.jpg'
    from unnest(array[user_a, user_b]) u
    cross join unnest(array['personal_photo', 'vehicle_photo', 'reference_document', 'insurance']) kind;
end; $$;

create function pg_temp.driver_test_files(target_user uuid) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('evidence_type', kind,
    'storage_path', current_setting('app.driver_test_tenant') || '/' || target_user || '/fixture/' || kind || '.jpg',
    'original_file_name', kind || '.jpg', 'mime_type', 'image/jpeg', 'size_bytes', 10))
  from unnest(array['personal_photo', 'vehicle_photo', 'reference_document', 'insurance']) kind;
$$;

set local role anon;
do $$ begin
  begin
    perform public.my_driver_applications();
    raise exception 'Anonymous status access unexpectedly succeeded' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;

-- The server-only RPC must not be executable by an authenticated browser.
set local role authenticated;
do $$ begin
  begin
    perform public.submit_driver_application_with_evidence_internal(
      current_setting('app.driver_test_user_a')::uuid, current_setting('app.driver_test_slug'), 'Driver test applicant', '', '[]');
    raise exception 'Browser submission unexpectedly succeeded' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;

set local role service_role;
do $$ begin
  begin
    perform public.submit_driver_application_with_evidence_internal(
      current_setting('app.driver_test_user_a')::uuid, current_setting('app.driver_test_slug'), 'Driver test applicant', '',
      jsonb_build_array(pg_temp.driver_test_files(current_setting('app.driver_test_user_a')::uuid) -> 0));
    raise exception 'Incomplete application unexpectedly committed' using errcode = 'XX000';
  exception when raise_exception then null; end;
  perform pg_temp.driver_assert('Incomplete submission rolls back its application',
    not exists (select 1 from public.driver_applications where applicant_auth_user_id = current_setting('app.driver_test_user_a')::uuid));
end; $$;

select public.submit_driver_application_with_evidence_internal(
  current_setting('app.driver_test_user_a')::uuid, current_setting('app.driver_test_slug'), 'Driver test applicant A', '',
  pg_temp.driver_test_files(current_setting('app.driver_test_user_a')::uuid));
select public.submit_driver_application_with_evidence_internal(
  current_setting('app.driver_test_user_b')::uuid, current_setting('app.driver_test_slug'), 'Driver test applicant B', '',
  pg_temp.driver_test_files(current_setting('app.driver_test_user_b')::uuid));

do $$ declare result jsonb; begin
  result := public.submit_driver_application_with_evidence_internal(
    current_setting('app.driver_test_user_a')::uuid, current_setting('app.driver_test_slug'), 'Ignored duplicate name', '',
    pg_temp.driver_test_files(current_setting('app.driver_test_user_a')::uuid));
  perform pg_temp.driver_assert('Retry attaches no duplicate evidence', jsonb_array_length(result -> 'acceptedPaths') = 0);
  perform pg_temp.driver_assert('One application per identity/company',
    (select count(*) = 1 from public.driver_applications where applicant_auth_user_id = current_setting('app.driver_test_user_a')::uuid));
  perform pg_temp.driver_assert('All evidence exists and stays pending',
    (select count(*) = 3 and bool_and(e.review_status = 'pending') from public.driver_evidence e
      join public.driver_applications a on a.driver_application_id = e.driver_application_id
      where a.applicant_auth_user_id = current_setting('app.driver_test_user_a')::uuid));
  perform pg_temp.driver_assert('Submitted applicant not auto-approved',
    (select bool_and(application_status = 'submitted' and driver_profile_id is null) from public.driver_applications
      where tenant_id = current_setting('app.driver_test_tenant')::uuid));
  perform pg_temp.driver_assert('Application insurance is retained separately without vehicle approval',
    (select count(*) = 2 and bool_and(vehicle_evidence_id is null) from public.driver_application_insurance
      where tenant_id = current_setting('app.driver_test_tenant')::uuid));
  perform pg_temp.driver_assert('Audit records one successful evidence transaction per applicant',
    (select count(*) = 2 from public.tenant_audit_events where tenant_id = current_setting('app.driver_test_tenant')::uuid
      and event_name = 'driver.application_evidence_submitted'));
end; $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('app.driver_test_user_a'),
  'role', 'authenticated', 'email', 'driver-test-' || current_setting('app.driver_test_user_a') || '@example.invalid')::text, true);
set local role authenticated;
do $$ declare result jsonb; begin
  result := public.my_driver_applications();
  perform pg_temp.driver_assert('Own-only status excludes other applicant',
    jsonb_array_length(result) = 1 and result -> 0 ->> 'fullName' = 'Driver test applicant A');
  perform pg_temp.driver_assert('No storage URLs/paths in status', result::text not like '%storage_path%' and result::text not like '%/fixture/%');
  perform pg_temp.driver_assert('Direct application reads remain denied',
    (select count(*) = 0 from public.driver_applications where tenant_id = current_setting('app.driver_test_tenant')::uuid));
  begin
    perform public.activate_my_driver_account();
    raise exception 'Unapproved applicant activation unexpectedly succeeded' using errcode = 'XX000';
  exception when raise_exception then null; end;
end; $$;
reset role;

-- A JWT with a mismatched email cannot claim an existing verified applicant's status.
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('app.driver_test_user_a'),
  'role', 'authenticated', 'email', 'other-email@example.invalid')::text, true);
set local role authenticated;
do $$ begin
  begin
    perform public.my_driver_applications();
    raise exception 'Mismatched email status unexpectedly succeeded' using errcode = 'XX000';
  exception when raise_exception then null; end;
end; $$;
reset role;

update public.driver_applications set application_status = 'under_review'
  where applicant_auth_user_id = current_setting('app.driver_test_user_a')::uuid;
set local role service_role;
do $$ begin
  begin
    perform public.submit_driver_application_with_evidence_internal(
      current_setting('app.driver_test_user_a')::uuid, current_setting('app.driver_test_slug'), 'Driver test applicant', '',
      pg_temp.driver_test_files(current_setting('app.driver_test_user_a')::uuid));
    raise exception 'Reviewed application unexpectedly accepted uploads' using errcode = 'XX000';
  exception when raise_exception then null; end;
end; $$;
reset role;

-- Fixture-only approved profile and actual assignment for the explicit insurance handoff.
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('app.driver_test_owner'),
  'role', 'authenticated', 'email', 'driver-test-owner-' || current_setting('app.driver_test_owner') || '@example.invalid')::text, true);
do $$ declare profile uuid := gen_random_uuid(); vehicle uuid := gen_random_uuid(); begin
  perform set_config('app.driver_test_vehicle', vehicle::text, true);
  insert into public.driver_profiles (driver_profile_id, tenant_id, driver_number, display_name, created_by_person_id, updated_by_person_id)
  values (profile, current_setting('app.driver_test_tenant')::uuid, 'TEST-INSURANCE', 'Driver test insurance applicant',
    current_setting('app.driver_test_owner')::uuid, current_setting('app.driver_test_owner')::uuid);
  update public.driver_applications set application_status = 'approved', driver_profile_id = profile
    where applicant_auth_user_id = current_setting('app.driver_test_user_a')::uuid;
  insert into public.vehicles (vehicle_id, tenant_id, vehicle_number, make, model, model_year, color, license_plate, vin,
    status, photo_storage_bucket, photo_storage_path, photo_original_file_name, photo_mime_type, photo_size_bytes,
    created_by_person_id, updated_by_person_id)
  values (vehicle, current_setting('app.driver_test_tenant')::uuid, 'TEST-INSURANCE', 'Fixture', 'Vehicle', 2020, 'Silver',
    'TEST-INSURANCE', '1HGCM82633A004352', 'active', 'driver-application-files', 'fixture/vehicle.jpg', 'fixture.jpg', 'image/jpeg', 10,
    current_setting('app.driver_test_owner')::uuid, current_setting('app.driver_test_owner')::uuid);
  insert into public.driver_vehicle_assignments (tenant_id, driver_profile_id, vehicle_id, created_by_person_id)
  values (current_setting('app.driver_test_tenant')::uuid, profile, vehicle, current_setting('app.driver_test_owner')::uuid);
end; $$;

set local role authenticated;
do $$ declare application uuid; result_evidence uuid; begin
  select driver_application_id into application from public.driver_applications
    where applicant_auth_user_id = current_setting('app.driver_test_user_a')::uuid;
  begin
    perform public.link_driver_application_insurance(application, gen_random_uuid());
    raise exception 'Wrong-vehicle linkage unexpectedly succeeded' using errcode = 'XX000';
  exception when raise_exception then null; end;
  result_evidence := public.link_driver_application_insurance(application, current_setting('app.driver_test_vehicle')::uuid);
  perform pg_temp.driver_assert('Insurance link retries preserve the same evidence ID',
    result_evidence = public.link_driver_application_insurance(application, current_setting('app.driver_test_vehicle')::uuid));
  perform pg_temp.driver_assert('Insurance enters existing vehicle review pending and without expiration',
    exists (select 1 from public.vehicle_evidence where evidence_id = result_evidence
      and evidence_type = 'insurance' and review_status = 'pending' and expires_on is null));
  perform pg_temp.driver_assert('Upload/link does not satisfy vehicle compliance',
    public.vehicle_compliance_satisfied(current_setting('app.driver_test_vehicle')::uuid) = false);
end; $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('app.driver_test_user_a'),
  'role', 'authenticated', 'email', 'driver-test-' || current_setting('app.driver_test_user_a') || '@example.invalid')::text, true);
set local role authenticated;
do $$ declare application uuid; begin
  application := (public.my_driver_applications() -> 0 ->> 'applicationId')::uuid;
  begin
    perform public.link_driver_application_insurance(application, current_setting('app.driver_test_vehicle')::uuid);
    raise exception 'Applicant self-linkage unexpectedly succeeded' using errcode = 'XX000';
  exception when raise_exception then null; end;
  perform pg_temp.driver_assert('Applicant insurance table reads remain denied by RLS',
    (select count(*) = 0 from public.driver_application_insurance));
end; $$;
reset role;

rollback;
select 'Driver applicant checks passed; all fixtures rolled back.' as result;
