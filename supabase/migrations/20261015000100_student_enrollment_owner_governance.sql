-- Match existing tenant governance: ownership is scoped to an organization, not a global role.
-- Does not grant reviewer access, enable rides or change other products' authorization.
create function public.can_manage_student_enrollment(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
    and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
    and public.has_active_tenant_membership(target_tenant_id)
    and exists(select 1 from public.tenants where tenant_id=target_tenant_id and status='active')
    and (public.is_platform_data_admin()
      or public.has_foundation_tenant_role(target_tenant_id,array['tenant_owner']));
$$;
revoke all on function public.can_manage_student_enrollment(uuid) from public,anon,authenticated;
grant execute on function public.can_manage_student_enrollment(uuid) to authenticated;

create or replace function public.configure_student_enrollment_program(target_tenant_id uuid, enabled_value boolean, reason_value text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_student_enrollment(target_tenant_id) then
    raise exception 'Active organization owner or authorized platform governance membership required';
  end if;
  if enabled_value is null or reason_value is null or reason_value not in ('pilot_setup','program_paused') then raise exception 'A valid governance reason is required'; end if;
  insert into public.student_transportation_enrollment_programs values(target_tenant_id, enabled_value)
    on conflict(tenant_id) do update set enrollment_enabled=excluded.enrollment_enabled;
  perform public.student_enrollment_audit(target_tenant_id,'student_enrollment.program_configured',target_tenant_id::text,
    'Enrollment pilot configuration changed.',jsonb_build_object('enabled',enabled_value,'reason_code',reason_value));
  -- Only fixed reason codes enter audit; no free-text student information.
  return true;
end;
$$;

create or replace function public.set_student_enrollment_access(target_tenant_id uuid, email_value text, role_value text, enabled_value boolean, reason_value text)
returns boolean language plpgsql security definer set search_path = public as $$
declare target_person uuid;
begin
  if not public.can_manage_student_enrollment(target_tenant_id) then
    raise exception 'Active organization owner or authorized platform governance membership required';
  end if;
  if role_value not in ('guardian','reviewer') or role_value is null or enabled_value is null
    or reason_value is null or reason_value not in ('guardian_invitation','reviewer_assignment','access_revoked') then raise exception 'Invalid access request'; end if;
  select p.person_id into target_person from public.person_profiles p
    join public.tenant_memberships m on m.person_id=p.person_id and m.tenant_id=target_tenant_id
    where p.normalized_email=lower(btrim(email_value)) and p.status='active' and m.status='active'
    and (m.expires_at is null or m.expires_at>now());
  if target_person is null then raise exception 'An existing active tenant member is required'; end if;
  insert into public.student_transportation_enrollment_access (tenant_id,person_id,can_enroll,can_review)
    values(target_tenant_id,target_person,role_value='guardian' and enabled_value,role_value='reviewer' and enabled_value)
    on conflict(tenant_id,person_id) do update set
      can_enroll=case when role_value='guardian' then enabled_value else student_transportation_enrollment_access.can_enroll end,
      can_review=case when role_value='reviewer' then enabled_value else student_transportation_enrollment_access.can_review end;
  perform public.student_enrollment_audit(target_tenant_id,'student_enrollment.access_changed',target_person::text,
    'Explicit enrollment access changed.',jsonb_build_object('role',role_value,'enabled',enabled_value,'reason_code',reason_value));
  return true;
end;
$$;

create or replace function public.my_student_enrollment_context()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('personId',public.current_person_id(),'programs',coalesce((select jsonb_agg(jsonb_build_object(
    'tenantId',t.tenant_id,'name',c.display_name,'canEnroll',public.has_student_enrollment_access(t.tenant_id,'guardian'),
    'canReview',public.has_student_enrollment_access(t.tenant_id,'reviewer'),
    'canConfigure',public.can_manage_student_enrollment(t.tenant_id), 'enrollmentEnabled',coalesce(ep.enrollment_enabled,false)))
    from public.tenants t join public.tenant_configurations c using(tenant_id)
    left join public.student_transportation_enrollment_programs ep using(tenant_id)
    where t.status='active' and public.has_active_tenant_membership(t.tenant_id)
    and (public.has_student_enrollment_access(t.tenant_id,'guardian') or public.has_student_enrollment_access(t.tenant_id,'reviewer') or public.can_manage_student_enrollment(t.tenant_id))), '[]'::jsonb));
$$;

