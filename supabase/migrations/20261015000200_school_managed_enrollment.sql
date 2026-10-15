-- School staff enroll students; parents have no enrollment authority.
-- Existing guardian grants are retired, never promoted automatically to school staff.
alter table public.student_transportation_enrollment_access add column can_manage_enrollments boolean not null default false;
insert into public.tenant_audit_events (tenant_id,event_name,actor_type,actor_person_id,
  actor_platform_roles,reason,correlation_id,resource_type,resource_id,metadata)
select tenant_id,'student_enrollment.access_changed','platform_system',null,'{}',
  'Retired parent enrollment authority; school staff require explicit admission.',gen_random_uuid(),
  'student_enrollment',person_id::text,jsonb_build_object('role','guardian','enabled',false,'reason_code','role_model_correction')
from public.student_transportation_enrollment_access where can_enroll;
update public.student_transportation_enrollment_access set can_enroll=false where can_enroll;
comment on column public.student_transportation_enrollment_access.can_enroll is 'Retired guardian permission; never authorizes enrollment.';
comment on column public.student_transportation_students.guardian_person_id is 'Legacy column name: creating enrollment staff identity, not a parent tracking relationship.';

create or replace function public.has_student_enrollment_access(target_tenant_id uuid, purpose text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
    and exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null)
    and public.has_active_tenant_membership(target_tenant_id)
    and exists (select 1 from public.tenants where tenant_id=target_tenant_id and status='active')
    and exists (select 1 from public.student_transportation_enrollment_programs where tenant_id=target_tenant_id and enrollment_enabled)
    and exists (select 1 from public.student_transportation_enrollment_access
      where tenant_id=target_tenant_id and person_id=public.current_person_id()
      and case purpose when 'school_admin' then can_manage_enrollments when 'reviewer' then can_review else false end);
$$;

create or replace function public.can_read_student_enrollment(target_tenant_id uuid, target_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.student_transportation_students
    where tenant_id=target_tenant_id and student_id=target_student_id
    and ((guardian_person_id=public.current_person_id() and public.has_student_enrollment_access(target_tenant_id, 'school_admin'))
      or public.has_student_enrollment_access(target_tenant_id, 'reviewer')));
$$;

create or replace function public.save_my_student_enrollment(target_tenant_id uuid, request_id_value uuid, student_id_value uuid, action_value text, payload_value jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor uuid:=public.current_person_id(); result_id uuid; prior public.student_transportation_students;
  fingerprint text;
  prior_hash text; contact jsonb;
begin
  if not public.has_student_enrollment_access(target_tenant_id,'school_admin') then raise exception 'School administrator enrollment access required'; end if;
  if request_id_value is null then raise exception 'Request identifier required'; end if;
  if coalesce(octet_length(payload_value::text),0)>12000 then raise exception 'Enrollment payload is too large'; end if;
  fingerprint:=md5(jsonb_build_object('student',student_id_value,'action',action_value,'payload',payload_value)::text);
  -- Serialize each actor's mutations so duplicate/new-child retries cannot create two children.
  perform 1 from public.student_transportation_enrollment_access where tenant_id=target_tenant_id and person_id=actor for update;
  perform 1 from public.student_transportation_enrollment_programs where tenant_id=target_tenant_id for share;
  if not public.has_student_enrollment_access(target_tenant_id,'school_admin') then raise exception 'School administrator enrollment access required'; end if;
  select payload_hash,student_id into prior_hash,result_id from public.student_transportation_enrollment_mutations
    where tenant_id=target_tenant_id and person_id=actor and request_id=request_id_value;
  if found then
    if prior_hash<>fingerprint then raise exception 'Request identifier already used for different content'; end if;
    return result_id;
  end if;
  if action_value is null or action_value not in ('save','submit','withdraw') then raise exception 'Invalid enrollment action'; end if;
  if student_id_value is not null then
    select * into prior from public.student_transportation_students where tenant_id=target_tenant_id
      and student_id=student_id_value and guardian_person_id=actor for update;
    if not found then raise exception 'Owned enrollment required'; end if;
    if prior.status in ('submitted','approved') and action_value<>'withdraw' then raise exception 'Withdraw before changing a submitted enrollment'; end if;
  end if;
  if action_value='withdraw' then
    if student_id_value is null then raise exception 'Owned enrollment required'; end if;
    update public.student_transportation_students set status='withdrawn',updated_at=now() where student_id=student_id_value;
    result_id:=student_id_value;
  else
    if payload_value is null or jsonb_typeof(payload_value)<>'object' or octet_length(payload_value::text)>12000
      or coalesce(length(btrim(payload_value->>'fullName')),0) not between 1 and 120
      or coalesce(length(btrim(payload_value->>'schoolName')),0) not between 1 and 200
      or coalesce(payload_value->>'grade','') not in ('K','1','2','3','4','5','6','7','8','9','10','11','12')
      or coalesce(payload_value->>'guardianPhone','') !~ '^[+0-9() .-]{7,32}$'
      or coalesce(length(btrim(payload_value->>'relationship')),0) not between 1 and 60
      then raise exception 'Enter valid student and guardian details'; end if;
    if jsonb_typeof(payload_value->'contacts') is distinct from 'array' then raise exception 'Contacts must be a list'; end if;
    if jsonb_array_length(payload_value->'contacts')>6 then raise exception 'At most six contacts are allowed'; end if;
    if action_value='submit' and (payload_value->'authorityAttested' is distinct from 'true'::jsonb or jsonb_array_length(payload_value->'contacts')=0)
      then raise exception 'Confirm school enrollment authority and add at least one contact'; end if;
    result_id:=coalesce(student_id_value,gen_random_uuid());
    insert into public.student_transportation_students(student_id,tenant_id,guardian_person_id,full_name,grade,school_name,guardian_phone,guardian_relationship,status,authority_attested,submitted_at)
    values(result_id,target_tenant_id,actor,btrim(payload_value->>'fullName'),payload_value->>'grade',btrim(payload_value->>'schoolName'),
      payload_value->>'guardianPhone',btrim(payload_value->>'relationship'),case when action_value='submit' then 'submitted' else 'draft' end,
      coalesce(payload_value->'authorityAttested'='true'::jsonb,false),case when action_value='submit' then now() else null end)
    on conflict(student_id) do update set full_name=excluded.full_name,grade=excluded.grade,school_name=excluded.school_name,
      guardian_phone=excluded.guardian_phone,guardian_relationship=excluded.guardian_relationship,status=excluded.status,
      authority_attested=excluded.authority_attested,submitted_at=excluded.submitted_at,reviewed_at=null,review_notes=null,updated_at=now();
    delete from public.student_transportation_contacts where tenant_id=target_tenant_id and student_id=result_id;
    for contact in select value from jsonb_array_elements(payload_value->'contacts') loop
      if jsonb_typeof(contact)<>'object' or jsonb_typeof(contact->'pickup') is distinct from 'boolean'
        or jsonb_typeof(contact->'dropoff') is distinct from 'boolean' then raise exception 'Invalid contact'; end if;
      insert into public.student_transportation_contacts(tenant_id,student_id,full_name,phone,relationship,proposed_pickup,proposed_dropoff)
        values(target_tenant_id,result_id,btrim(contact->>'fullName'),contact->>'phone',btrim(contact->>'relationship'),
          (contact->>'pickup')::boolean,(contact->>'dropoff')::boolean);
    end loop;
  end if;
  insert into public.student_transportation_enrollment_mutations values(target_tenant_id,actor,request_id_value,fingerprint,result_id);
  perform public.student_enrollment_audit(target_tenant_id,'student_enrollment.'||action_value,result_id::text,
    'School administrator changed an enrollment they created.',jsonb_build_object('action',action_value));
  return result_id;
end;
$$;

create or replace function public.review_student_enrollment(target_tenant_id uuid, student_id_value uuid, request_id_value uuid, decision_value text, notes_value text)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor uuid:=public.current_person_id(); prior public.student_transportation_students; prior_hash text; result_id uuid;
  fingerprint text;
begin
  if not public.has_student_enrollment_access(target_tenant_id,'reviewer') then raise exception 'Explicit enrollment reviewer access required'; end if;
  if request_id_value is null or decision_value is null or decision_value not in ('approved','rejected')
    or coalesce(length(notes_value),0)>1000 or (decision_value='rejected' and coalesce(length(btrim(notes_value)),0)=0)
    then raise exception 'Valid decision and rejection notes required'; end if;
  fingerprint:=md5(jsonb_build_object('student',student_id_value,'decision',decision_value,'notes',notes_value)::text);
  perform 1 from public.student_transportation_enrollment_access where tenant_id=target_tenant_id and person_id=actor for update;
  perform 1 from public.student_transportation_enrollment_programs where tenant_id=target_tenant_id for share;
  if not public.has_student_enrollment_access(target_tenant_id,'reviewer') then raise exception 'Explicit enrollment reviewer access required'; end if;
  select payload_hash,student_id into prior_hash,result_id from public.student_transportation_enrollment_mutations
    where tenant_id=target_tenant_id and person_id=actor and request_id=request_id_value;
  if found then
    if prior_hash<>fingerprint then raise exception 'Request identifier already used for different content'; end if;
    return result_id;
  end if;
  select * into prior from public.student_transportation_students where tenant_id=target_tenant_id and student_id=student_id_value for update;
  if not found or prior.guardian_person_id=actor or prior.status<>'submitted' then raise exception 'A submitted enrollment belonging to another submitter is required'; end if;
  update public.student_transportation_students set status=decision_value,review_notes=nullif(btrim(notes_value),''),reviewed_at=now(),updated_at=now() where student_id=student_id_value;
  insert into public.student_transportation_enrollment_mutations values(target_tenant_id,actor,request_id_value,fingerprint,student_id_value);
  perform public.student_enrollment_audit(target_tenant_id,'student_enrollment.reviewed',student_id_value::text,
    'Explicit reviewer reviewed an enrollment.',jsonb_build_object('decision',decision_value));
  return student_id_value;
end;
$$;

create or replace function public.set_student_enrollment_access(target_tenant_id uuid, email_value text, role_value text, enabled_value boolean, reason_value text)
returns boolean language plpgsql security definer set search_path = public as $$
declare target_person uuid;
begin
  if not public.can_manage_student_enrollment(target_tenant_id) then
    raise exception 'Active organization owner or authorized platform governance membership required';
  end if;
  if role_value not in ('school_admin','reviewer') or role_value is null or enabled_value is null
    or reason_value is null or reason_value not in ('school_administrator_assignment','reviewer_assignment','access_revoked') then raise exception 'Invalid access request'; end if;
  select p.person_id into target_person from public.person_profiles p
    join public.tenant_memberships m on m.person_id=p.person_id and m.tenant_id=target_tenant_id
    where p.normalized_email=lower(btrim(email_value)) and p.status='active' and m.status='active'
    and (m.expires_at is null or m.expires_at>now());
  if target_person is null then raise exception 'An existing active tenant member is required'; end if;
  insert into public.student_transportation_enrollment_access (tenant_id,person_id,can_manage_enrollments,can_review)
    values(target_tenant_id,target_person,role_value='school_admin' and enabled_value,role_value='reviewer' and enabled_value)
    on conflict(tenant_id,person_id) do update set
      can_manage_enrollments=case when role_value='school_admin' then enabled_value else student_transportation_enrollment_access.can_manage_enrollments end,
      can_review=case when role_value='reviewer' then enabled_value else student_transportation_enrollment_access.can_review end;
  perform public.student_enrollment_audit(target_tenant_id,'student_enrollment.access_changed',target_person::text,
    'Explicit enrollment access changed.',jsonb_build_object('role',role_value,'enabled',enabled_value,'reason_code',reason_value));
  return true;
end;
$$;

create or replace function public.my_student_enrollment_context()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('personId',public.current_person_id(),'programs',coalesce((select jsonb_agg(jsonb_build_object(
    'tenantId',t.tenant_id,'name',c.display_name,'canEnroll',public.has_student_enrollment_access(t.tenant_id,'school_admin'),
    'canReview',public.has_student_enrollment_access(t.tenant_id,'reviewer'),
    'canConfigure',public.can_manage_student_enrollment(t.tenant_id), 'enrollmentEnabled',coalesce(ep.enrollment_enabled,false)))
    from public.tenants t join public.tenant_configurations c using(tenant_id)
    left join public.student_transportation_enrollment_programs ep using(tenant_id)
    where t.status='active' and public.has_active_tenant_membership(t.tenant_id)
    and (public.has_student_enrollment_access(t.tenant_id,'school_admin') or public.has_student_enrollment_access(t.tenant_id,'reviewer') or public.can_manage_student_enrollment(t.tenant_id))), '[]'::jsonb));
$$;

