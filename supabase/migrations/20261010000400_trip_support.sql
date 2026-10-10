-- Private, trip-bound Rider support. No direct table access, automatic refunds or Driver disclosure.
create table public.trip_support_cases (
  case_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  booking_id uuid not null,
  rider_profile_id uuid not null,
  category text not null check (category in ('trip_issue','lost_item')),
  description text not null check (char_length(btrim(description)) between 10 and 2000),
  request_id uuid not null,
  status text not null default 'open' check (status in ('open','in_review','resolved')),
  response text not null default '' check (char_length(response) <= 2000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id,booking_id) references public.dispatch_bookings(tenant_id,booking_id),
  foreign key (tenant_id,rider_profile_id) references public.rider_profiles(tenant_id,rider_profile_id),
  unique (booking_id,category), unique (rider_profile_id,request_id)
);
create index trip_support_queue on public.trip_support_cases(tenant_id,created_at desc,case_id desc);
create table public.trip_support_updates (
  update_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.trip_support_cases(case_id),
  actor_person_id uuid not null references public.person_profiles(person_id),
  status text not null check (status in ('open','in_review','resolved')),
  response text not null check (char_length(btrim(response)) between 1 and 2000),
  version integer not null,
  created_at timestamptz not null default now(),
  unique(case_id,version)
);
alter table public.trip_support_cases enable row level security;
alter table public.trip_support_updates enable row level security;
revoke all on public.trip_support_cases,public.trip_support_updates from public,anon,authenticated;
grant all on public.trip_support_cases,public.trip_support_updates to service_role;

create function public.require_rider_support_access(booking_value uuid) returns uuid
language plpgsql stable security definer set search_path=public as $$
declare b public.dispatch_bookings; actor uuid:=public.current_person_id();
begin
  select * into b from public.dispatch_bookings where booking_id=booking_value;
  if auth.uid() is null or actor is null or b.booking_id is null
    or b.status not in ('completed','cancelled')
    or not exists(select 1 from public.tenants where tenant_id=b.tenant_id and status='active')
    or not exists(select 1 from public.rider_profiles r where r.tenant_id=b.tenant_id
      and r.rider_profile_id=b.rider_profile_id and r.status='active' and r.person_id=actor
      and r.rider_profile_id=public.current_rider_profile_id(b.tenant_id))
    then raise exception 'Trip support is unavailable for this trip'; end if;
  return actor;
end; $$;

create function public.my_trip_support(booking_value uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  perform public.require_rider_support_access(booking_value);
  select coalesce(jsonb_agg(jsonb_build_object('caseId',c.case_id,'bookingId',c.booking_id,
    'category',c.category,'description',c.description,'status',c.status,'response',c.response,
    'version',c.version,'createdAt',c.created_at,'updatedAt',c.updated_at,
    'updates',(select coalesce(jsonb_agg(jsonb_build_object('status',u.status,'response',u.response,
      'createdAt',u.created_at) order by u.version),'[]'::jsonb)
      from public.trip_support_updates u where u.case_id=c.case_id)) order by c.created_at,c.case_id),'[]'::jsonb)
    into result from public.trip_support_cases c join public.dispatch_bookings b
      on b.booking_id=c.booking_id and b.tenant_id=c.tenant_id and b.rider_profile_id=c.rider_profile_id
    where c.booking_id=booking_value;
  return result;
end; $$;

create function public.create_my_trip_support(booking_value uuid,category_value text,description_value text,request_value uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare b public.dispatch_bookings; actor uuid; existing public.trip_support_cases; new_id uuid;
begin
  select * into b from public.dispatch_bookings where booking_id=booking_value for update;
  actor:=public.require_rider_support_access(booking_value);
  if category_value is null or category_value not in ('trip_issue','lost_item') or request_value is null
    or description_value is null or char_length(btrim(description_value)) not between 10 and 2000
    then raise exception 'Choose a report type and enter 10 to 2000 characters'; end if;
  select * into existing from public.trip_support_cases
    where rider_profile_id=b.rider_profile_id and request_id=request_value;
  if existing.case_id is not null then
    if existing.booking_id<>booking_value or existing.category<>category_value or existing.description<>btrim(description_value)
      then raise exception 'Retry must contain the same report'; end if;
    return existing.case_id;
  end if;
  if exists(select 1 from public.trip_support_cases where booking_id=booking_value and category=category_value)
    then raise exception 'A report of this type already exists. Refresh to view its progress'; end if;
  insert into public.trip_support_cases(tenant_id,booking_id,rider_profile_id,category,description,request_id)
    values(b.tenant_id,b.booking_id,b.rider_profile_id,category_value,btrim(description_value),request_value)
    returning case_id into new_id;
  insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,
    reason,correlation_id,resource_type,resource_id,metadata)
  values(b.tenant_id,'trip.support_created','person',actor,'{}','Rider submitted a trip support report.',
    gen_random_uuid(),'trip_support_case',new_id::text,jsonb_build_object('booking_id',b.booking_id,'category',category_value));
  return new_id;
end; $$;

create function public.admin_trip_support(tenant_value uuid,status_value text default 'all',offset_value integer default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; total integer;
begin
  if auth.uid() is null or public.current_person_id() is null or not coalesce(public.can_manage_dispatch(tenant_value),false)
    then raise exception 'Dispatch management permission is required'; end if;
  if status_value is null or status_value not in ('all','open','in_review','resolved') or offset_value is null or offset_value<0
    then raise exception 'Choose a valid queue filter'; end if;
  select count(*) into total from public.trip_support_cases where tenant_id=tenant_value
    and (status_value='all' or status=status_value);
  select coalesce(jsonb_agg(to_jsonb(row) order by row."createdAt" desc,row."caseId" desc),'[]'::jsonb) into result from (
    select c.case_id as "caseId",c.booking_id as "bookingId",c.category,c.description,c.status,c.response,c.version,
      c.created_at as "createdAt",c.updated_at as "updatedAt",r.display_name as "riderName",
      b.pickup_address as "pickupAddress",b.destination_address as "destinationAddress",
      (select coalesce(jsonb_agg(jsonb_build_object('status',u.status,'response',u.response,'createdAt',u.created_at)
        order by u.version),'[]'::jsonb) from public.trip_support_updates u where u.case_id=c.case_id) as updates
    from public.trip_support_cases c join public.dispatch_bookings b on b.tenant_id=c.tenant_id and b.booking_id=c.booking_id
      join public.rider_profiles r on r.tenant_id=c.tenant_id and r.rider_profile_id=c.rider_profile_id
    where c.tenant_id=tenant_value and (status_value='all' or c.status=status_value)
    order by c.created_at desc,c.case_id desc limit 50 offset offset_value
  ) row;
  return jsonb_build_object('cases',result,'total',total);
end; $$;

create function public.review_trip_support(case_value uuid,status_value text,response_value text,version_value integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare c public.trip_support_cases; actor uuid:=public.current_person_id();
begin
  select * into c from public.trip_support_cases where case_id=case_value for update;
  if auth.uid() is null or actor is null or c.case_id is null or not coalesce(public.can_manage_dispatch(c.tenant_id),false)
    then raise exception 'Dispatch management permission is required'; end if;
  if status_value is null or status_value not in ('open','in_review','resolved') or response_value is null
    or char_length(btrim(response_value)) not between 1 and 2000 then raise exception 'Enter a Rider-visible response of 1 to 2000 characters'; end if;
  -- Identical retries succeed after a lost response; stale conflicting edits never overwrite a review.
  if c.version=version_value+1 and c.status=status_value and c.response=btrim(response_value) then return true; end if;
  if version_value is null or c.version<>version_value then raise exception 'This report changed. Refresh before reviewing'; end if;
  update public.trip_support_cases set status=status_value,response=btrim(response_value),version=version+1,updated_at=now()
    where case_id=c.case_id;
  insert into public.trip_support_updates(case_id,actor_person_id,status,response,version)
    values(c.case_id,actor,status_value,btrim(response_value),c.version+1);
  insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,
    reason,correlation_id,resource_type,resource_id,metadata)
  values(c.tenant_id,'trip.support_reviewed','person',actor,'{}','Administrator updated a trip support report.',
    gen_random_uuid(),'trip_support_case',c.case_id::text,jsonb_build_object('status',status_value,'version',c.version+1));
  return true;
end; $$;

revoke all on function public.require_rider_support_access(uuid),public.my_trip_support(uuid),
  public.create_my_trip_support(uuid,text,text,uuid),public.admin_trip_support(uuid,text,integer),
  public.review_trip_support(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.my_trip_support(uuid),public.create_my_trip_support(uuid,text,text,uuid),
  public.admin_trip_support(uuid,text,integer),public.review_trip_support(uuid,text,text,integer) to authenticated;
