-- Customer invitation acceptance never grants a tenant or staff role.
create table public.student_transportation_customer_invitations (
  invitation_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  normalized_email text not null check(normalized_email=lower(btrim(normalized_email)) and length(normalized_email) between 3 and 254),
  status text not null default 'pending' check(status in ('pending','accepted')),
  expires_at timestamptz not null default now()+interval '7 days',
  last_email_attempt_at timestamptz,
  accepted_by uuid references public.person_profiles,
  accepted_at timestamptz,
  unique(tenant_id,customer_id),
  foreign key(tenant_id,customer_id) references public.student_transportation_customers(tenant_id,customer_id)
);
alter table public.student_transportation_customer_invitations enable row level security;
revoke all on public.student_transportation_customer_invitations from public,anon,authenticated;
grant all on public.student_transportation_customer_invitations to service_role;
grant select on public.student_transportation_customer_invitations to authenticated;
create policy student_customer_invitation_staff_read on public.student_transportation_customer_invitations
  for select to authenticated using(public.can_manage_student_customers(tenant_id));
create index student_customer_invitation_email on public.student_transportation_customer_invitations(normalized_email) where status='pending';

create function public.prepare_student_customer_invitation(target_tenant_id uuid,request_id_value uuid,name_value text,kind_value text,email_value text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=public.current_person_id(); result_id uuid; prior_hash text; fingerprint text; invite public.student_transportation_customer_invitations; send_allowed boolean;
begin
  if not public.can_manage_student_customers(target_tenant_id) then raise exception 'Internal customer management access required'; end if;
  if request_id_value is null or coalesce(length(btrim(name_value)),0) not between 1 and 160
    or kind_value is null or kind_value not in ('school','organization','group')
    or coalesce(length(btrim(email_value)),0) not between 3 and 254
    or btrim(email_value) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Valid customer details required'; end if;
  fingerprint:=md5(jsonb_build_array(btrim(name_value),kind_value,lower(btrim(email_value)))::text);
  insert into public.student_transportation_customers(tenant_id,display_name,customer_kind,created_by,request_id,creation_hash)
    values(target_tenant_id,btrim(name_value),kind_value,actor,request_id_value,fingerprint)
    on conflict(tenant_id,created_by,request_id) do nothing returning customer_id into result_id;
  if result_id is null then
    select customer_id,creation_hash into result_id,prior_hash from public.student_transportation_customers
      where tenant_id=target_tenant_id and created_by=actor and request_id=request_id_value;
    if prior_hash is distinct from fingerprint then raise exception 'Request identifier already used'; end if;
  else
    insert into public.student_transportation_customer_invitations(tenant_id,customer_id,normalized_email)
      values(target_tenant_id,result_id,lower(btrim(email_value)));
    perform public.student_enrollment_audit(target_tenant_id,'student_customer.invited',result_id::text,
      'Internal staff created a pending customer invitation.',jsonb_build_object('kind',kind_value));
  end if;
  select * into invite from public.student_transportation_customer_invitations
    where tenant_id=target_tenant_id and customer_id=result_id for update;
  if not found then raise exception 'Use the existing customer account'; end if;
  send_allowed:=invite.status='pending' and (invite.last_email_attempt_at is null or invite.last_email_attempt_at<=now()-interval '60 seconds');
  if send_allowed then
    update public.student_transportation_customer_invitations set last_email_attempt_at=now(),expires_at=now()+interval '7 days' where invitation_id=invite.invitation_id;
    perform public.student_enrollment_audit(target_tenant_id,'student_customer.invitation_email_requested',result_id::text,
      'Internal staff requested a verification email. Provider delivery is not confirmed.','{}');
  end if;
  return jsonb_build_object('customerId',result_id,'email',invite.normalized_email,'sendAllowed',send_allowed);
end; $$;

create function public.prepare_student_customer_resend(target_tenant_id uuid,target_customer_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare invite public.student_transportation_customer_invitations; send_allowed boolean;
begin
  if not public.can_manage_student_customers(target_tenant_id) then raise exception 'Internal customer management access required'; end if;
  perform 1 from public.student_transportation_customers where tenant_id=target_tenant_id and customer_id=target_customer_id and status='active' for share;
  if not found then raise exception 'Active customer account required'; end if;
  select * into invite from public.student_transportation_customer_invitations where tenant_id=target_tenant_id and customer_id=target_customer_id for update;
  if not found or invite.status<>'pending' then raise exception 'Pending customer invitation required'; end if;
  send_allowed:=invite.last_email_attempt_at is null or invite.last_email_attempt_at<=now()-interval '60 seconds';
  if send_allowed then
    update public.student_transportation_customer_invitations set last_email_attempt_at=now(),expires_at=now()+interval '7 days' where invitation_id=invite.invitation_id;
    perform public.student_enrollment_audit(target_tenant_id,'student_customer.invitation_email_requested',target_customer_id::text,
      'Internal staff requested a verification email. Provider delivery is not confirmed.','{}');
  end if;
  return jsonb_build_object('customerId',target_customer_id,'email',invite.normalized_email,'sendAllowed',send_allowed);
end; $$;

create function public.accept_my_student_customer_invitations()
returns integer language plpgsql security definer set search_path=public as $$
declare verified_email text; identity_id uuid:=auth.uid(); actor uuid; profile public.person_profiles;
  invite public.student_transportation_customer_invitations; accepted_count integer:=0;
begin
  select lower(btrim(email)) into verified_email from auth.users where id=identity_id and email_confirmed_at is not null;
  if verified_email is null then raise exception 'Verified email required'; end if;
  -- No identity creation unless an active, unexpired customer invitation matches verified email.
  for invite in select i.* from public.student_transportation_customer_invitations i
    join public.student_transportation_customers c on c.tenant_id=i.tenant_id and c.customer_id=i.customer_id
    join public.tenants t on t.tenant_id=c.tenant_id
    join public.student_transportation_enrollment_programs ep on ep.tenant_id=t.tenant_id
    where i.normalized_email=verified_email and i.status='pending' and i.expires_at>now()
      and c.status='active' and t.status='active' and ep.enrollment_enabled
    order by i.invitation_id for update of i
  loop
    if actor is null then
      insert into public.person_profiles(auth_user_id,status,display_name,primary_email,normalized_email,activated_at)
        values(identity_id,'active',verified_email,verified_email,verified_email,now())
        on conflict(normalized_email) do nothing;
      select * into profile from public.person_profiles where normalized_email=verified_email for update;
      if profile.status not in ('active','invited') or (profile.auth_user_id is not null and profile.auth_user_id<>identity_id) then
        raise exception 'Active matching identity required'; end if;
      update public.person_profiles set auth_user_id=identity_id,status='active',activated_at=coalesce(activated_at,now())
        where person_id=profile.person_id;
      actor:=profile.person_id;
    end if;
    insert into public.student_transportation_customer_users(tenant_id,customer_id,person_id)
      values(invite.tenant_id,invite.customer_id,actor) on conflict do nothing;
    update public.student_transportation_customer_invitations set status='accepted',accepted_by=actor,accepted_at=now()
      where invitation_id=invite.invitation_id;
    perform public.student_enrollment_audit(invite.tenant_id,'student_customer.invitation_accepted',invite.customer_id::text,
      'Verified recipient accepted customer-only access.','{}');
    accepted_count:=accepted_count+1;
  end loop;
  return accepted_count;
end; $$;
revoke all on function public.prepare_student_customer_invitation(uuid,uuid,text,text,text),
  public.prepare_student_customer_resend(uuid,uuid),public.accept_my_student_customer_invitations() from public,anon,authenticated;
grant execute on function public.prepare_student_customer_invitation(uuid,uuid,text,text,text),
  public.prepare_student_customer_resend(uuid,uuid),public.accept_my_student_customer_invitations() to authenticated;
