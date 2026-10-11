-- Private, trip-bound Driver support. No direct table access, automatic refunds or Driver disclosure.
create table public.driver_trip_support_cases (
  case_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  booking_id uuid not null,
  driver_profile_id uuid not null,
  category text not null check (category in ('trip_issue','lost_item')),
  description text not null check (char_length(btrim(description)) between 10 and 2000),
  request_id uuid not null,
  status text not null default 'open' check (status in ('open','in_review','resolved')),
  response text not null default '' check (char_length(response) <= 2000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id,booking_id) references public.dispatch_bookings(tenant_id,booking_id),
  foreign key (tenant_id,driver_profile_id) references public.driver_profiles(tenant_id,driver_profile_id),
  unique (booking_id,category), unique (driver_profile_id,request_id)
);
create index driver_trip_support_queue on public.driver_trip_support_cases(tenant_id,created_at desc,case_id desc);
create table public.driver_trip_support_updates (
  update_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.driver_trip_support_cases(case_id),
  actor_person_id uuid not null references public.person_profiles(person_id),
  status text not null check (status in ('open','in_review','resolved')),
  response text not null check (char_length(btrim(response)) between 1 and 2000),
  version integer not null,
  created_at timestamptz not null default now(),
  unique(case_id,version)
);
alter table public.driver_trip_support_cases enable row level security;
alter table public.driver_trip_support_updates enable row level security;
revoke all on public.driver_trip_support_cases,public.driver_trip_support_updates from public,anon,authenticated;
grant all on public.driver_trip_support_cases,public.driver_trip_support_updates to service_role;

create function public.require_driver_support_access(booking_value uuid) returns uuid
language plpgsql stable security definer set search_path=public as $$
declare b public.dispatch_bookings; actor uuid:=public.current_person_id();
begin
  select * into b from public.dispatch_bookings where booking_id=booking_value;
  if auth.uid() is null or actor is null or b.booking_id is null
    or b.status not in ('completed','cancelled')
    or not exists(select 1 from public.tenants where tenant_id=b.tenant_id and status='active')
    or not exists(select 1 from public.driver_profiles r where r.tenant_id=b.tenant_id
      and r.driver_profile_id=b.current_driver_profile_id and r.status='active' and r.person_id=actor
      and r.driver_profile_id=public.current_driver_profile_id())
    then raise exception 'Trip support is unavailable for this trip'; end if;
  return actor;
end; $$;

create function public.my_driver_trip_support(booking_value uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  perform public.require_driver_support_access(booking_value);
  select coalesce(jsonb_agg(jsonb_build_object('caseId',c.case_id,'bookingId',c.booking_id,
    'category',c.category,'description',c.description,'status',c.status,'response',c.response,
    'version',c.version,'createdAt',c.created_at,'updatedAt',c.updated_at,
    'updates',(select coalesce(jsonb_agg(jsonb_build_object('status',u.status,'response',u.response,
      'createdAt',u.created_at) order by u.version),'[]'::jsonb)
      from public.driver_trip_support_updates u where u.case_id=c.case_id)) order by c.created_at,c.case_id),'[]'::jsonb)
    into result from public.driver_trip_support_cases c join public.dispatch_bookings b
      on b.booking_id=c.booking_id and b.tenant_id=c.tenant_id and b.current_driver_profile_id=c.driver_profile_id
    where c.booking_id=booking_value;
  return result;
end; $$;

create function public.create_my_driver_trip_support(booking_value uuid,category_value text,description_value text,request_value uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare b public.dispatch_bookings; actor uuid; existing public.driver_trip_support_cases; new_id uuid;
begin
  select * into b from public.dispatch_bookings where booking_id=booking_value for update;
  actor:=public.require_driver_support_access(booking_value);
  if category_value is null or category_value not in ('trip_issue','lost_item') or request_value is null
    or description_value is null or char_length(btrim(description_value)) not between 10 and 2000
    then raise exception 'Choose a report type and enter 10 to 2000 characters'; end if;
  select * into existing from public.driver_trip_support_cases
    where driver_profile_id=b.current_driver_profile_id and request_id=request_value;
  if existing.case_id is not null then
    if existing.booking_id<>booking_value or existing.category<>category_value or existing.description<>btrim(description_value)
      then raise exception 'Retry must contain the same report'; end if;
    return existing.case_id;
  end if;
  if exists(select 1 from public.driver_trip_support_cases where booking_id=booking_value and category=category_value)
    then raise exception 'A report of this type already exists. Refresh to view its progress'; end if;
  insert into public.driver_trip_support_cases(tenant_id,booking_id,driver_profile_id,category,description,request_id)
    values(b.tenant_id,b.booking_id,b.current_driver_profile_id,category_value,btrim(description_value),request_value)
    returning case_id into new_id;
  insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,
    reason,correlation_id,resource_type,resource_id,metadata)
  values(b.tenant_id,'trip.driver_support_created','person',actor,'{}','Driver submitted a trip support report.',
    gen_random_uuid(),'driver_trip_support_case',new_id::text,jsonb_build_object('booking_id',b.booking_id,'category',category_value));
  return new_id;
end; $$;

create function public.admin_driver_trip_support(tenant_value uuid,status_value text default 'all',offset_value integer default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; total integer;
begin
  if auth.uid() is null or public.current_person_id() is null or not coalesce(public.can_manage_dispatch(tenant_value),false)
    then raise exception 'Dispatch management permission is required'; end if;
  if status_value is null or status_value not in ('all','open','in_review','resolved') or offset_value is null or offset_value<0
    then raise exception 'Choose a valid queue filter'; end if;
  select count(*) into total from public.driver_trip_support_cases where tenant_id=tenant_value
    and (status_value='all' or status=status_value);
  select coalesce(jsonb_agg(to_jsonb(row) order by row."createdAt" desc,row."caseId" desc),'[]'::jsonb) into result from (
    select c.case_id as "caseId",c.booking_id as "bookingId",c.category,c.description,c.status,c.response,c.version,
      c.created_at as "createdAt",c.updated_at as "updatedAt",r.display_name as "driverName",
      b.pickup_address as "pickupAddress",b.destination_address as "destinationAddress",
      (select coalesce(jsonb_agg(jsonb_build_object('status',u.status,'response',u.response,'createdAt',u.created_at)
        order by u.version),'[]'::jsonb) from public.driver_trip_support_updates u where u.case_id=c.case_id) as updates
    from public.driver_trip_support_cases c join public.dispatch_bookings b on b.tenant_id=c.tenant_id and b.booking_id=c.booking_id
      join public.driver_profiles r on r.tenant_id=c.tenant_id and r.driver_profile_id=c.driver_profile_id
    where c.tenant_id=tenant_value and (status_value='all' or c.status=status_value)
    order by c.created_at desc,c.case_id desc limit 50 offset offset_value
  ) row;
  return jsonb_build_object('cases',result,'total',total);
end; $$;

create function public.review_driver_trip_support(case_value uuid,status_value text,response_value text,version_value integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare c public.driver_trip_support_cases; actor uuid:=public.current_person_id();
begin
  select * into c from public.driver_trip_support_cases where case_id=case_value for update;
  if auth.uid() is null or actor is null or c.case_id is null or not coalesce(public.can_manage_dispatch(c.tenant_id),false)
    then raise exception 'Dispatch management permission is required'; end if;
  if status_value is null or status_value not in ('open','in_review','resolved') or response_value is null
    or char_length(btrim(response_value)) not between 1 and 2000 then raise exception 'Enter a Driver-visible response of 1 to 2000 characters'; end if;
  -- Identical retries succeed after a lost response; stale conflicting edits never overwrite a review.
  if c.version=version_value+1 and c.status=status_value and c.response=btrim(response_value) then return true; end if;
  if version_value is null or c.version<>version_value then raise exception 'This report changed. Refresh before reviewing'; end if;
  update public.driver_trip_support_cases set status=status_value,response=btrim(response_value),version=version+1,updated_at=now()
    where case_id=c.case_id;
  insert into public.driver_trip_support_updates(case_id,actor_person_id,status,response,version)
    values(c.case_id,actor,status_value,btrim(response_value),c.version+1);
  insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,
    reason,correlation_id,resource_type,resource_id,metadata)
  values(c.tenant_id,'trip.driver_support_reviewed','person',actor,'{}','Administrator updated a trip support report.',
    gen_random_uuid(),'driver_trip_support_case',c.case_id::text,jsonb_build_object('status',status_value,'version',c.version+1));
  return true;
end; $$;

revoke all on function public.require_driver_support_access(uuid),public.my_driver_trip_support(uuid),
  public.create_my_driver_trip_support(uuid,text,text,uuid),public.admin_driver_trip_support(uuid,text,integer),
  public.review_driver_trip_support(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.my_driver_trip_support(uuid),public.create_my_driver_trip_support(uuid,text,text,uuid),
  public.admin_driver_trip_support(uuid,text,integer),public.review_driver_trip_support(uuid,text,text,integer) to authenticated;


create or replace function public.notification_email_channel_enabled(tenant_value uuid,rider_value uuid,driver_value uuid,type_value text)
returns boolean language sql stable security definer set search_path=public as $$
  select case
    when rider_value is not null and type_value in ('rider_payment_succeeded','rider_refund_succeeded',
      'rider_recurring_autopay_failed','rider_recurring_autopay_succeeded') then
      coalesce((select payment_email_enabled from public.rider_notification_preferences
        where tenant_id=tenant_value and rider_profile_id=rider_value),true)
    when rider_value is not null and type_value like 'rider_%' then
      coalesce((select trip_email_enabled from public.rider_notification_preferences
        where tenant_id=tenant_value and rider_profile_id=rider_value),true)
    when driver_value is not null and type_value in ('dispatch_offer_created','driver_support_update') then
      coalesce((select trip_email_enabled from public.driver_notification_preferences
        where tenant_id=tenant_value and driver_profile_id=driver_value),true)
    when driver_value is not null and type_value in ('driver_earnings_recorded','driver_transfer_succeeded',
      'driver_bank_payout_created','driver_bank_payout_paid','driver_bank_payout_failed') then
      coalesce((select earnings_email_enabled from public.driver_notification_preferences
        where tenant_id=tenant_value and driver_profile_id=driver_value),true)
    when driver_value is not null and type_value in ('driver_evidence_expiring_30d','driver_evidence_expiring_7d',
      'driver_evidence_expired','vehicle_evidence_expiring_30d','vehicle_evidence_expiring_7d','vehicle_evidence_expired') then
      coalesce((select expiration_email_enabled from public.driver_notification_preferences
        where tenant_id=tenant_value and driver_profile_id=driver_value),true)
    else true end;
$$;

-- Generic support alerts; descriptions and responses never enter the outbox.
do $$ declare definition text; begin
  select pg_get_constraintdef(oid) into definition from pg_constraint
    where conrelid='public.notification_outbox'::regclass and conname='notification_outbox_type_check';
  if definition is null then raise exception 'Notification type constraint is required'; end if;
  alter table public.notification_outbox drop constraint notification_outbox_type_check;
  execute 'alter table public.notification_outbox add constraint notification_outbox_type_check check (('
    || substring(definition from 7) || ') or notification_type = ''driver_support_update'')';
end; $$;

create function public.driver_support_alert_current(notification_value uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.notification_outbox n
    join public.driver_trip_support_cases c on c.case_id::text=n.payload->>'case_id'
      and c.booking_id::text=n.payload->>'booking_id' and c.tenant_id=n.tenant_id and c.driver_profile_id=n.driver_profile_id
    join public.dispatch_bookings b on b.booking_id=c.booking_id and b.tenant_id=c.tenant_id
      and b.current_driver_profile_id=c.driver_profile_id and b.status in ('completed','cancelled')
    join public.driver_profiles r on r.driver_profile_id=c.driver_profile_id and r.tenant_id=c.tenant_id
      and r.status='active' and r.person_id=n.person_id
    join public.person_profiles p on p.person_id=r.person_id and p.status='active' and p.auth_user_id is not null
    join public.tenants t on t.tenant_id=c.tenant_id and t.status='active'
    where n.notification_id=notification_value and n.notification_type='driver_support_update'
      and n.delivery_status not in ('canceled','cancelled'));
$$;
revoke all on function public.driver_support_alert_current(uuid) from public,anon,authenticated;
grant execute on function public.driver_support_alert_current(uuid) to service_role;

create function public.queue_driver_trip_support_update() returns trigger
language plpgsql security definer set search_path=public as $$
declare c public.driver_trip_support_cases; r public.driver_profiles; email_enabled boolean;
begin
  select * into c from public.driver_trip_support_cases where case_id=new.case_id;
  select * into r from public.driver_profiles where driver_profile_id=c.driver_profile_id
    and tenant_id=c.tenant_id and status='active';
  if r.driver_profile_id is null or not exists(select 1 from public.person_profiles
    where person_id=r.person_id and status='active' and auth_user_id is not null)
    or not exists(select 1 from public.tenants where tenant_id=c.tenant_id and status='active') then return new; end if;
  email_enabled:=public.notification_email_channel_enabled(c.tenant_id,null,r.driver_profile_id,'driver_support_update');
  if not email_enabled and not public.has_device_notification_channel(c.tenant_id,null,r.driver_profile_id) then return new; end if;
  insert into public.notification_outbox(tenant_id,person_id,driver_profile_id,notification_type,
    recipient_email,payload,dedupe_key,email_delivery_enabled)
  values(c.tenant_id,r.person_id,r.driver_profile_id,'driver_support_update',r.email,
    jsonb_build_object('booking_id',c.booking_id,'case_id',c.case_id,'tenant_slug',
      (select tenant_slug from public.tenant_configurations where tenant_id=c.tenant_id)),
    'driver-trip-support:'||c.case_id::text||':'||new.version::text,email_enabled)
  on conflict (dedupe_key) do nothing;
  return new;
end; $$;
revoke all on function public.queue_driver_trip_support_update() from public,anon,authenticated;
create trigger driver_trip_support_update_notification after insert on public.driver_trip_support_updates
  for each row execute function public.queue_driver_trip_support_update();


create or replace function public.claim_native_push_attempts(tenant_value uuid default null,notification_value uuid default null,
  limit_value integer default 20,platforms_value text[] default array['ios','android'])
returns jsonb language plpgsql security definer set search_path=public as $$
declare attempt public.native_push_attempts; registration public.native_push_registrations;
  notification public.notification_outbox; result jsonb := '[]'; new_claim uuid;
begin
  update public.native_push_attempts set status='expired',claim_id=null,failure_code='retry_limit'
  where status='sending' and attempt_count>=5 and claimed_at<now()-interval '2 minutes'
    and (tenant_value is null or tenant_id=tenant_value);
  for attempt in select * from public.native_push_attempts a
    where (tenant_value is null or a.tenant_id=tenant_value)
      and (notification_value is null or a.notification_id=notification_value)
      and a.attempt_count<5 and a.next_attempt_at<=now()
      and exists(select 1 from public.native_push_registrations r
        where r.registration_id=a.registration_id and r.platform=any(platforms_value))
      and (a.status in ('pending','failed') or (a.status='sending' and a.claimed_at<now()-interval '2 minutes'))
    order by a.next_attempt_at limit least(greatest(limit_value,1),50) for update skip locked
  loop
    select * into registration from public.native_push_registrations where registration_id=attempt.registration_id;
    select * into notification from public.notification_outbox where notification_id=attempt.notification_id;
    if attempt.expires_at<=now() or registration.status<>'active' or notification.delivery_status in ('canceled','cancelled')
      or (notification.notification_type='driver_support_update' and not public.driver_support_alert_current(notification.notification_id))
      or (notification.notification_type='rider_support_update' and not public.support_alert_current(notification.notification_id))
      or (notification.notification_type='driver_preorder_available' and not public.preorder_alert_current(notification.notification_id))
      or not exists(select 1 from public.tenants t where t.tenant_id=registration.tenant_id and t.status='active')
      or registration.refreshed_at<now()-interval '30 days'
      or not exists(select 1 from auth.sessions s where s.id=registration.auth_session_id and s.user_id=registration.auth_user_id
        and (s.not_after is null or s.not_after>now()))
      or not exists(select 1 from public.person_profiles p where p.person_id=registration.person_id and p.status='active'
        and p.auth_user_id=registration.auth_user_id)
      or (registration.product='rider' and not exists(select 1 from public.rider_profiles p
        where p.rider_profile_id=registration.rider_profile_id and p.status='active' and p.person_id=registration.person_id))
      or (registration.product='driver' and not exists(select 1 from public.driver_profiles p
        where p.driver_profile_id=registration.driver_profile_id and p.status='active' and p.person_id=registration.person_id))
      or (notification.notification_type='dispatch_offer_created' and not exists(select 1 from public.dispatch_offers o
        where o.offer_id::text=notification.payload->>'offer_id' and o.tenant_id=notification.tenant_id
          and o.driver_profile_id=registration.driver_profile_id and o.status='pending' and o.expires_at>now())) then
      update public.native_push_attempts set status='expired',claim_id=null,failure_code='no_longer_eligible' where attempt_id=attempt.attempt_id;
      continue;
    end if;
    if not (registration.platform=any(platforms_value)) then continue; end if;
    new_claim := gen_random_uuid();
    update public.native_push_attempts set status='sending',claim_id=new_claim,claimed_at=now(),
      attempt_count=attempt_count+1 where attempt_id=attempt.attempt_id;
    result := result||jsonb_build_array(jsonb_build_object('attemptId',attempt.attempt_id,'claimId',new_claim,
      'registrationId',registration.registration_id,'token',registration.device_token,'platform',registration.platform,
      'product',registration.product,'notificationType',notification.notification_type,
      'tenantSlug',(select tenant_slug from public.tenant_configurations where tenant_id=registration.tenant_id),
      'expiresAt',attempt.expires_at) || case when notification.notification_type in ('rider_support_update','driver_support_update')
        then jsonb_build_object('bookingId',notification.payload->>'booking_id','caseId',notification.payload->>'case_id') else '{}'::jsonb end);
  end loop;
  return result;
end; $$;





create function public.my_driver_support_trips() returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(to_jsonb(trip) order by trip."finishedAt" desc,trip."bookingId"),'[]'::jsonb)
  from (select b.booking_id as "bookingId",b.pickup_address as "pickupAddress",
    b.destination_address as "destinationAddress",b.status,
    coalesce(b.completed_at,b.created_at) as "finishedAt"
    from public.dispatch_bookings b
    join public.driver_profiles d on d.driver_profile_id=b.current_driver_profile_id and d.tenant_id=b.tenant_id
    join public.tenants t on t.tenant_id=b.tenant_id and t.status='active'
    where auth.uid() is not null and public.current_person_id() is not null
      and d.driver_profile_id=public.current_driver_profile_id() and d.person_id=public.current_person_id()
      and d.status='active' and b.status in ('completed','cancelled')
    order by coalesce(b.completed_at,b.created_at) desc,b.booking_id limit 50) trip;
$$;
revoke all on function public.my_driver_support_trips() from public,anon,authenticated;
grant execute on function public.my_driver_support_trips() to authenticated;

