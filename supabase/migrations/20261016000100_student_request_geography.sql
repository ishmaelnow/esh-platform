-- Student-only permanent geography, equipment constraints and private immutable history.
alter table public.student_transportation_requests
  add column geography_status text not null default 'unverified' check (geography_status in ('unverified','geocoded')),
  add column geography jsonb,
  add column intake_hash text,
  add constraint student_request_geography_shape check (
    (geography_status='unverified' and geography is null and intake_hash is null)
    or (geography_status='geocoded' and geography is not null and intake_hash is not null
      and jsonb_typeof(geography)='object' and geography->>'safetyStatus'='unreviewed'));

-- Server-written proof: authenticated callers cannot insert or alter trusted geography.
create table public.student_request_geography_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  auth_user_id uuid not null references auth.users,
  input_hash text not null,
  payload jsonb not null,
  expires_at timestamptz not null default now()+interval '30 minutes',
  foreign key(tenant_id,customer_id) references public.student_transportation_customers(tenant_id,customer_id)
);
alter table public.student_request_geography_receipts enable row level security;
revoke all on public.student_request_geography_receipts from public,anon,authenticated;
grant select,insert,delete on public.student_request_geography_receipts to service_role;
create index student_geography_receipt_expiry on public.student_request_geography_receipts(expires_at);

create table public.student_request_history (
  history_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  request_id uuid not null references public.student_transportation_requests on delete restrict,
  actor_person_id uuid references public.person_profiles,
  event_name text not null check(event_name in ('baseline','submitted','withdrawn')),
  recorded_at timestamptz not null default clock_timestamp(),
  snapshot jsonb not null,
  foreign key(tenant_id,customer_id) references public.student_transportation_customers(tenant_id,customer_id)
);
alter table public.student_request_history enable row level security;
revoke all on public.student_request_history from public,anon,authenticated,service_role;
grant select on public.student_request_history to authenticated,service_role;
create policy student_history_read on public.student_request_history for select to authenticated using (
  public.has_student_customer_access(tenant_id,customer_id)
  or public.has_student_enrollment_access(tenant_id,'school_admin')
  or public.has_student_enrollment_access(tenant_id,'reviewer'));
create index student_request_history_lookup on public.student_request_history(tenant_id,request_id,recorded_at);

create function public.prevent_student_history_mutation() returns trigger
language plpgsql set search_path=public as $$ begin raise exception 'Student request history is immutable'; end; $$;
create trigger student_history_immutable before update or delete or truncate on public.student_request_history
  for each statement execute function public.prevent_student_history_mutation();

-- Migration baseline is a snapshot now, not a fabricated historical change/actor.
insert into public.student_request_history(tenant_id,customer_id,request_id,actor_person_id,event_name,snapshot)
  select tenant_id,customer_id,request_id,null,'baseline',to_jsonb(r) from public.student_transportation_requests r;

create function public.capture_student_request_history() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then raise exception 'Student requests cannot be deleted'; end if;
  if tg_op='UPDATE' then
    if (to_jsonb(new)-'status'-'updated_at') is distinct from (to_jsonb(old)-'status'-'updated_at')
      or old.status<>'submitted' or new.status<>'withdrawn' then
      raise exception 'Request snapshots cannot be edited; withdraw and submit a new request';
    end if;
  end if;
  insert into public.student_request_history(tenant_id,customer_id,request_id,actor_person_id,event_name,snapshot)
    values(new.tenant_id,new.customer_id,new.request_id,
      case when tg_op='INSERT' then new.submitted_by else public.current_person_id() end,
      case when tg_op='INSERT' then 'submitted' else 'withdrawn' end,to_jsonb(new));
  return new;
end; $$;
create trigger student_request_history after insert or update or delete on public.student_transportation_requests
  for each row execute function public.capture_student_request_history();

create function public.submit_geographic_student_request(target_tenant_id uuid,target_customer_id uuid,
  idempotency_key_value uuid,receipt_id_value uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=public.current_person_id(); receipt public.student_request_geography_receipts;
  prior public.student_transportation_requests; body jsonb; student jsonb; stop jsonb;
  result_id uuid; fingerprint text;
begin
  perform 1 from public.student_transportation_customers where tenant_id=target_tenant_id and customer_id=target_customer_id for share;
  perform 1 from public.student_transportation_enrollment_programs where tenant_id=target_tenant_id for share;
  if not public.has_student_customer_access(target_tenant_id,target_customer_id) then raise exception 'Customer access required'; end if;
  if idempotency_key_value is null then raise exception 'Request identifier required'; end if;
  select * into receipt from public.student_request_geography_receipts where receipt_id=receipt_id_value
    and tenant_id=target_tenant_id and customer_id=target_customer_id and auth_user_id=auth.uid();
  if not found then raise exception 'Verified preview required'; end if;
  body:=receipt.payload;
  fingerprint:=receipt.input_hash;
  -- Serialize same-actor retries before inspecting or inserting. Geography may vary on a fresh provider lookup;
  -- the server input hash identifies the unchanged user intent.
  perform pg_advisory_xact_lock(hashtextextended(target_tenant_id::text||actor::text||idempotency_key_value::text,0));
  select * into prior from public.student_transportation_requests where tenant_id=target_tenant_id
    and submitted_by=actor and idempotency_key=idempotency_key_value;
  if found then
    if prior.intake_hash is distinct from fingerprint then raise exception 'Request identifier already used'; end if;
    return prior.request_id;
  end if;
  if receipt.expires_at<=now() then raise exception 'Preview expired; verify the stops again'; end if;
  if octet_length(body::text)>60000 or jsonb_typeof(body->'students') is distinct from 'array'
    or jsonb_array_length(body->'students') not between 1 and 20
    or (body->>'scheduledAt')::timestamptz<=now() or (body->>'scheduledAt')::timestamptz>now()+interval '1 year'
    or body->>'scheduledAt' is null or body->'geography'->>'safetyStatus' is distinct from 'unreviewed'
    then raise exception 'Valid geographic request required'; end if;
  for student in select value from jsonb_array_elements(body->'students') loop
    if jsonb_typeof(student->'name') is distinct from 'string' or length(btrim(student->>'name')) not between 1 and 120
      or jsonb_typeof(student->'pickupAddress') is distinct from 'string' or length(student->>'pickupAddress') not between 5 and 400
      or jsonb_typeof(student->'accommodations') is distinct from 'array'
      or jsonb_array_length(student->'accommodations')>4
      or exists(select 1 from jsonb_array_elements_text(student->'accommodations') t(value)
        where value not in ('wheelchair_lift','booster_seat','car_seat','attendant'))
      then raise exception 'Valid student equipment requirements required'; end if;
  end loop;
  if jsonb_typeof(body->'geography'->'stops') is distinct from 'array'
    or jsonb_array_length(body->'geography'->'stops')<>jsonb_array_length(body->'students')+1 then raise exception 'Verified stops required'; end if;
  for stop in select value from jsonb_array_elements(body->'geography'->'stops') loop
    if (stop->>'latitude')::numeric not between -90 and 90 or (stop->>'longitude')::numeric not between -180 and 180
      or stop->>'latitude' is null or stop->>'longitude' is null
      or stop->>'safetyStatus' is distinct from 'unreviewed'
      or length(stop->>'address') not between 5 and 400 then raise exception 'Verified stop required'; end if;
  end loop;
  insert into public.student_transportation_requests(tenant_id,customer_id,submitted_by,idempotency_key,payload_hash,
    scheduled_at,destination_address,students,geography_status,geography,intake_hash)
    values(target_tenant_id,target_customer_id,actor,idempotency_key_value,md5(body::text),
      (body->>'scheduledAt')::timestamptz,body->>'destination',body->'students','geocoded',body->'geography',fingerprint)
    returning request_id into result_id;
  perform public.student_enrollment_audit(target_tenant_id,'student_request.submitted',result_id::text,
    'Customer submitted a geographic request for review.',jsonb_build_object('student_count',jsonb_array_length(body->'students'),'geography_status','geocoded'));
  return result_id;
end; $$;
revoke all on function public.submit_geographic_student_request(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.submit_geographic_student_request(uuid,uuid,uuid,uuid) to authenticated;
revoke all on function public.prevent_student_history_mutation(),public.capture_student_request_history() from public,anon,authenticated;
