-- Customers are schools/organizations, not staff or tenant administrators.
create table public.student_transportation_customers (
  customer_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete restrict,
  display_name text not null check(length(btrim(display_name)) between 1 and 160),
  customer_kind text not null check(customer_kind in ('school','organization','group')),
  status text not null default 'active' check(status in ('active','paused')),
  created_by uuid not null references public.person_profiles,
  request_id uuid not null,
  creation_hash text not null,
  unique(tenant_id,customer_id), unique(tenant_id,created_by,request_id)
);
create table public.student_transportation_customer_users (
  tenant_id uuid not null,
  customer_id uuid not null,
  person_id uuid not null references public.person_profiles,
  primary key(tenant_id,customer_id,person_id),
  foreign key(tenant_id,customer_id) references public.student_transportation_customers(tenant_id,customer_id)
);
create table public.student_transportation_requests (
  request_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  submitted_by uuid not null references public.person_profiles,
  idempotency_key uuid not null,
  payload_hash text not null,
  scheduled_at timestamptz not null,
  destination_address text not null check(length(btrim(destination_address)) between 5 and 400),
  students jsonb not null check(jsonb_typeof(students)='array' and jsonb_array_length(students) between 1 and 20),
  status text not null default 'submitted' check(status in ('submitted','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,submitted_by,idempotency_key),
  foreign key(tenant_id,customer_id) references public.student_transportation_customers(tenant_id,customer_id)
);
create index student_customer_requests_recent on public.student_transportation_requests(tenant_id,customer_id,created_at desc);
alter table public.student_transportation_customers enable row level security;
alter table public.student_transportation_customer_users enable row level security;
alter table public.student_transportation_requests enable row level security;
revoke all on public.student_transportation_customers,public.student_transportation_customer_users,
  public.student_transportation_requests from public,anon,authenticated;
grant all on public.student_transportation_customers,public.student_transportation_customer_users,
  public.student_transportation_requests to service_role;

create function public.has_student_customer_access(target_tenant_id uuid,target_customer_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.person_profiles p join auth.users u on u.id=p.auth_user_id
    join public.student_transportation_customer_users m on m.person_id=p.person_id
    join public.student_transportation_customers c on c.tenant_id=m.tenant_id and c.customer_id=m.customer_id
    join public.tenants t on t.tenant_id=c.tenant_id
    join public.student_transportation_enrollment_programs ep on ep.tenant_id=t.tenant_id
    where u.id=auth.uid() and u.email_confirmed_at is not null and p.status='active'
      and m.tenant_id=target_tenant_id and m.customer_id=target_customer_id
      and c.status='active' and t.status='active' and ep.enrollment_enabled);
$$;
create function public.can_manage_student_customers(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.can_manage_student_enrollment(target_tenant_id)
    or public.has_student_enrollment_access(target_tenant_id,'school_admin');
$$;
create policy student_customer_read on public.student_transportation_customers for select to authenticated
  using(public.has_student_customer_access(tenant_id,customer_id) or public.can_manage_student_customers(tenant_id)
    or public.has_student_enrollment_access(tenant_id,'reviewer'));
create policy student_request_read on public.student_transportation_requests for select to authenticated
  using(public.has_student_customer_access(tenant_id,customer_id)
    or public.has_student_enrollment_access(tenant_id,'school_admin')
    or public.has_student_enrollment_access(tenant_id,'reviewer'));
grant select on public.student_transportation_customers,public.student_transportation_requests to authenticated;

create function public.create_student_customer(target_tenant_id uuid,request_id_value uuid,name_value text,kind_value text,email_value text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=public.current_person_id(); member_person uuid; result_id uuid; prior_hash text;
  fingerprint text;
begin
  if not public.can_manage_student_customers(target_tenant_id) then raise exception 'Internal customer management access required'; end if;
  if request_id_value is null or coalesce(length(btrim(name_value)),0) not between 1 and 160
    or coalesce(length(btrim(email_value)),0) not between 3 and 254
    or kind_value is null or kind_value not in ('school','organization','group') then raise exception 'Valid customer details required'; end if;
  select p.person_id into member_person from public.person_profiles p join auth.users u on u.id=p.auth_user_id
    where p.normalized_email=lower(btrim(email_value)) and p.status='active' and u.email_confirmed_at is not null;
  if member_person is null then raise exception 'Existing verified customer identity required'; end if;
  fingerprint:=md5(jsonb_build_array(btrim(name_value),kind_value,lower(btrim(email_value)))::text);
  -- Customer account membership is product-owned; no tenant/staff role is created.
  insert into public.student_transportation_customers(tenant_id,display_name,customer_kind,created_by,request_id,creation_hash)
    values(target_tenant_id,btrim(name_value),kind_value,actor,request_id_value,fingerprint)
    on conflict(tenant_id,created_by,request_id) do nothing returning customer_id into result_id;
  if result_id is null then
    select customer_id,creation_hash into result_id,prior_hash from public.student_transportation_customers
      where tenant_id=target_tenant_id and created_by=actor and request_id=request_id_value;
    if prior_hash is distinct from fingerprint then raise exception 'Request identifier already used'; end if;
    return result_id;
  end if;
  insert into public.student_transportation_customer_users values(target_tenant_id,result_id,member_person);
  perform public.student_enrollment_audit(target_tenant_id,'student_customer.created',result_id::text,
    'Internal staff created a customer account.',jsonb_build_object('kind',kind_value));
  return result_id;
end; $$;

create function public.my_student_customer_context()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('customers',coalesce((select jsonb_agg(jsonb_build_object('customerId',c.customer_id,
    'tenantId',c.tenant_id,'name',c.display_name)) from public.student_transportation_customers c
    where public.has_student_customer_access(c.tenant_id,c.customer_id)),'[]'::jsonb));
$$;

create function public.submit_student_transport_request(target_tenant_id uuid,target_customer_id uuid,
  idempotency_key_value uuid,scheduled_at_value timestamptz,destination_value text,students_value jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=public.current_person_id(); result_id uuid; prior_hash text; student jsonb;
  fingerprint text;
begin
  perform 1 from public.student_transportation_customers where tenant_id=target_tenant_id and customer_id=target_customer_id for share;
  perform 1 from public.student_transportation_enrollment_programs where tenant_id=target_tenant_id for share;
  if not public.has_student_customer_access(target_tenant_id,target_customer_id) then raise exception 'Customer access required'; end if;
  if idempotency_key_value is null then raise exception 'Request identifier required'; end if;
  if coalesce(octet_length(students_value::text),0)>20000 or coalesce(length(destination_value),0)>400 then
    raise exception 'Request payload is too large'; end if;
  fingerprint:=md5(jsonb_build_array(target_customer_id,scheduled_at_value,btrim(destination_value),students_value)::text);
  select request_id,payload_hash into result_id,prior_hash from public.student_transportation_requests
    where tenant_id=target_tenant_id and submitted_by=actor and idempotency_key=idempotency_key_value;
  if found then
    if prior_hash is distinct from fingerprint then raise exception 'Request identifier already used'; end if;
    return result_id;
  end if;
  if scheduled_at_value is null or scheduled_at_value<=now() or scheduled_at_value>now()+interval '1 year'
    or coalesce(length(btrim(destination_value)),0) not between 5 and 400
    or students_value is null or jsonb_typeof(students_value)<>'array' or octet_length(students_value::text)>20000 then
    raise exception 'Valid future schedule, destination and students required'; end if;
  if jsonb_array_length(students_value) not between 1 and 20 then raise exception 'Provide between one and twenty students'; end if;
  for student in select value from jsonb_array_elements(students_value) loop
    if jsonb_typeof(student)<>'object' or jsonb_typeof(student->'name') is distinct from 'string'
      or jsonb_typeof(student->'pickupAddress') is distinct from 'string'
      or coalesce(length(btrim(student->>'name')),0) not between 1 and 120
      or coalesce(length(btrim(student->>'pickupAddress')),0) not between 5 and 400
      or student - 'name' - 'pickupAddress' <> '{}'::jsonb then raise exception 'Student name and pickup address required'; end if;
  end loop;
  insert into public.student_transportation_requests(tenant_id,customer_id,submitted_by,idempotency_key,payload_hash,
    scheduled_at,destination_address,students)
    values(target_tenant_id,target_customer_id,actor,idempotency_key_value,fingerprint,scheduled_at_value,btrim(destination_value),students_value)
    on conflict(tenant_id,submitted_by,idempotency_key) do nothing returning request_id into result_id;
  if result_id is null then
    select request_id,payload_hash into result_id,prior_hash from public.student_transportation_requests
      where tenant_id=target_tenant_id and submitted_by=actor and idempotency_key=idempotency_key_value;
    if prior_hash is distinct from fingerprint then raise exception 'Request identifier already used'; end if;
    return result_id;
  end if;
  perform public.student_enrollment_audit(target_tenant_id,'student_request.submitted',result_id::text,
    'Customer submitted a transportation request for review.',jsonb_build_object('student_count',jsonb_array_length(students_value)));
  return result_id;
end; $$;

create function public.withdraw_student_transport_request(target_tenant_id uuid,target_request_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare row_value public.student_transportation_requests;
begin
  select * into row_value from public.student_transportation_requests
    where tenant_id=target_tenant_id and request_id=target_request_id for update;
  if not found or not public.has_student_customer_access(target_tenant_id,row_value.customer_id) then raise exception 'Customer access required'; end if;
  if row_value.status='withdrawn' then return true; end if;
  update public.student_transportation_requests set status='withdrawn',updated_at=now() where request_id=target_request_id;
  perform public.student_enrollment_audit(target_tenant_id,'student_request.withdrawn',target_request_id::text,
    'Customer withdrew an unassigned transportation request.','{}');
  return true;
end; $$;

revoke all on function public.has_student_customer_access(uuid,uuid),public.can_manage_student_customers(uuid),
  public.create_student_customer(uuid,uuid,text,text,text),public.my_student_customer_context(),
  public.submit_student_transport_request(uuid,uuid,uuid,timestamptz,text,jsonb),
  public.withdraw_student_transport_request(uuid,uuid) from public,anon,authenticated;
grant execute on function public.has_student_customer_access(uuid,uuid),public.can_manage_student_customers(uuid),
  public.create_student_customer(uuid,uuid,text,text,text),public.my_student_customer_context(),
  public.submit_student_transport_request(uuid,uuid,uuid,timestamptz,text,jsonb),
  public.withdraw_student_transport_request(uuid,uuid) to authenticated;

create function public.set_student_customer_status(target_tenant_id uuid,target_customer_id uuid,active_value boolean)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if active_value is null or not public.can_manage_student_customers(target_tenant_id) then raise exception 'Internal customer management access required'; end if;
  update public.student_transportation_customers set status=case when active_value then 'active' else 'paused' end
    where tenant_id=target_tenant_id and customer_id=target_customer_id;
  if not found then raise exception 'Customer account unavailable'; end if;
  perform public.student_enrollment_audit(target_tenant_id,'student_customer.status_changed',target_customer_id::text,
    'Internal staff updated customer access.',jsonb_build_object('active',active_value));
  return true;
end; $$;
revoke all on function public.set_student_customer_status(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_student_customer_status(uuid,uuid,boolean) to authenticated;
