-- Link an approved applicant's Auth identity to the platform identity and driver profile.

create or replace function public.activate_my_driver_account()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_user uuid := auth.uid();
  auth_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  app public.driver_applications;
  person uuid;
  membership uuid;
begin
  if auth_user is null or auth_email = '' then raise exception 'authentication is required'; end if;

  select * into app
  from public.driver_applications
  where applicant_auth_user_id = auth_user
    and email = auth_email
    and application_status = 'approved'
    and driver_profile_id is not null
  order by reviewed_at desc nulls last
  limit 1;

  if app.driver_application_id is null then
    raise exception 'an approved driver application is required';
  end if;

  select person_id into person from public.person_profiles where auth_user_id = auth_user;
  if person is null then
    select person_id into person
    from public.person_profiles
    where normalized_email = auth_email and auth_user_id is null
    for update;
  end if;

  if person is null then
    insert into public.person_profiles (
      auth_user_id, status, display_name, primary_email, normalized_email, activated_at
    ) values (
      auth_user, 'active', app.full_name, auth_email, auth_email, now()
    ) returning person_id into person;
  else
    update public.person_profiles
    set auth_user_id = auth_user, status = 'active', activated_at = coalesce(activated_at, now())
    where person_id = person;
  end if;

  insert into public.tenant_memberships (
    tenant_id, person_id, status, activated_at
  ) values (
    app.tenant_id, person, 'active', now()
  )
  on conflict (tenant_id, person_id) do update
  set status = 'active', activated_at = coalesce(public.tenant_memberships.activated_at, now())
  returning membership_id into membership;

  insert into public.tenant_role_assignments (
    tenant_id, membership_id, role_key, status, assigned_at
  ) values (
    app.tenant_id, membership, 'tenant_member', 'active', now()
  )
  on conflict (membership_id, role_key) where status = 'active' do nothing;

  update public.driver_profiles
  set person_id = person, updated_by_person_id = person
  where driver_profile_id = app.driver_profile_id
    and tenant_id = app.tenant_id
    and (person_id is null or person_id = person);

  if not found then raise exception 'driver profile is linked to another identity'; end if;
  return app.driver_profile_id;
end;
$$;

grant execute on function public.activate_my_driver_account() to authenticated;

create or replace function public.my_driver_portal_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'driverProfileId', dp.driver_profile_id,
    'driverNumber', dp.driver_number,
    'displayName', dp.display_name,
    'email', dp.email,
    'phone', dp.phone,
    'status', dp.status,
    'onboardingStatus', checklist.review_status,
    'documentCompliance', checklist.documents_reviewed
  )
  from public.driver_profiles dp
  join public.person_profiles person on person.person_id = dp.person_id
  left join public.driver_onboarding_checklists checklist
    on checklist.driver_profile_id = dp.driver_profile_id
  where person.auth_user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.my_driver_portal_summary() to authenticated;
