-- Internal planning only. Does not alter Student activation or ordinary dispatch/resources.
create function public.can_read_student_planning(t uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.has_student_enrollment_access(t,'school_admin') or public.has_student_enrollment_access(t,'reviewer');
$$;
create table public.student_planning_entities (
  entity_id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants,
  customer_id uuid, kind text not null check(kind in ('student','point','policy','resource','schedule')),
  reference text not null check(length(reference) between 1 and 100),
  unique(tenant_id,entity_id),
  foreign key(tenant_id,customer_id) references public.student_transportation_customers(tenant_id,customer_id),
  check ((kind='resource' and customer_id is null) or (kind in ('student','point','policy','schedule') and customer_id is not null))
);
create unique index student_planning_reference on public.student_planning_entities
  (tenant_id,kind,coalesce(customer_id,'00000000-0000-0000-0000-000000000000'::uuid),reference);
create table public.student_planning_versions (
  tenant_id uuid not null, entity_id uuid not null, revision integer not null check(revision>0),
  state text not null check(state in ('active','revoked','draft','planning_approved','cancelled')),
  data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=100000),
  check(state<>'planning_approved' or data->'operationallyReady' is not distinct from 'false'::jsonb),
  actor_id uuid not null references public.person_profiles, recorded_at timestamptz not null default clock_timestamp(),
  reason text not null check(length(btrim(reason)) between 3 and 300),
  primary key(tenant_id,entity_id,revision), foreign key(tenant_id,entity_id) references public.student_planning_entities(tenant_id,entity_id)
);
create table public.student_planning_links (
  tenant_id uuid not null, schedule_id uuid not null, schedule_revision integer not null,
  slot text not null, entity_id uuid not null, revision integer not null,
  primary key(tenant_id,schedule_id,schedule_revision,slot),
  foreign key(tenant_id,schedule_id,schedule_revision) references public.student_planning_versions(tenant_id,entity_id,revision),
  foreign key(tenant_id,entity_id,revision) references public.student_planning_versions(tenant_id,entity_id,revision)
);
create table public.student_daily_manifests (
  tenant_id uuid not null, schedule_id uuid not null, service_date date not null, revision integer not null check(revision>0),
  schedule_revision integer not null, state text not null check(state in ('planned','cancelled')),
  snapshot jsonb not null check(snapshot->'operationallyReady' is not distinct from 'false'::jsonb), actor_id uuid not null references public.person_profiles,
  recorded_at timestamptz not null default clock_timestamp(), reason text not null check(length(btrim(reason)) between 3 and 300),
  primary key(tenant_id,schedule_id,service_date,revision),
  foreign key(tenant_id,schedule_id,schedule_revision) references public.student_planning_versions(tenant_id,entity_id,revision)
);
create table public.student_planning_reservations (
  tenant_id uuid not null, schedule_id uuid not null, service_date date not null, manifest_revision integer not null,
  resource_id uuid not null, resource_revision integer not null,
  starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at), active boolean not null default true,
  primary key(tenant_id,schedule_id,service_date,manifest_revision,resource_id),
  foreign key(tenant_id,schedule_id,service_date,manifest_revision) references public.student_daily_manifests(tenant_id,schedule_id,service_date,revision),
  foreign key(tenant_id,resource_id,resource_revision) references public.student_planning_versions(tenant_id,entity_id,revision)
);
create index student_resource_time on public.student_planning_reservations(tenant_id,resource_id,starts_at,ends_at) where active;
create table public.student_planning_mutations (
  tenant_id uuid not null, actor_id uuid not null, request_key uuid not null, fingerprint text not null, result jsonb not null,
  primary key(tenant_id,actor_id,request_key)
);

do $$ declare name text; begin
  foreach name in array array['student_planning_entities','student_planning_versions','student_planning_links','student_daily_manifests','student_planning_reservations','student_planning_mutations'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',name);
    if name<>'student_planning_mutations' then
      execute format('grant select on public.%I to authenticated',name);
      execute format('create policy internal_planning_read on public.%I for select to authenticated using(public.can_read_student_planning(tenant_id))',name);
    end if;
    if name<>'student_planning_reservations' then
      execute format('create trigger planning_immutable before update or delete or truncate on public.%I for each statement execute function public.prevent_student_history_mutation()',name);
    end if;
  end loop;
end $$;

create function public.student_plan_snapshot(t uuid,d jsonb,resources_required boolean) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare r public.student_transportation_requests; c uuid; first_day date:=(d->>'startDate')::date; last_day date:=(d->>'endDate')::date;
  item jsonb; p jsonb; s jsonb; policy jsonb; vehicle jsonb; driver jsonb; attendant jsonb;
  students jsonb:='[]'; points jsonb:='[]'; crew jsonb:='[]'; segments jsonb:='[]';
  ids text[]:='{}'; indices integer[]:='{}'; idx integer; n integer; seats integer:=0; wheels integer:=0;
  boosters integer:=0; carseats integer:=0; helpers integer:=0; lift_needed boolean:=false; key_value text;
  equipment_tag text; needed_tags text[]:='{}'; conditional_keys jsonb;
  passenger_seats integer:=0; passenger_wheels integer:=0; segment_boosters integer:=0; segment_carseats integer:=0; i integer;
begin
  select * into r from public.student_transportation_requests where tenant_id=t and request_id=(d->>'requestId')::uuid;
  c:=r.customer_id;
  if r.request_id is null or r.status<>'submitted' or r.geography_status<>'geocoded'
    or not exists(select 1 from public.student_transportation_customers where tenant_id=t and customer_id=c and status='active') then raise exception 'Submitted geographic request and active customer required'; end if;
  if jsonb_typeof(d->'students') is distinct from 'array' or jsonb_typeof(d->'points') is distinct from 'array'
    or jsonb_array_length(d->'students')<>jsonb_array_length(r.students)
    or jsonb_array_length(d->'points')<>jsonb_array_length(r.students)+1 then raise exception 'Review every student and loading point'; end if;
  n:=jsonb_array_length(r.students);
  for item in select value from jsonb_array_elements(d->'students') loop
    idx:=(item->>'sourceIndex')::integer;
    if idx is null or idx<0 or idx>=n or idx=any(indices) or (item->>'id')=any(ids)
      or item->'identityConfirmed' is distinct from 'true'::jsonb then raise exception 'Explicit unique request-to-student identity mapping required'; end if;
    indices:=array_append(indices,idx); ids:=array_append(ids,item->>'id');
    s:=public.student_planning_ref(t,item,'student',c);
    if (s->'data'->>'validFrom')::date>first_day or (s->'data'->>'validUntil')::date<last_day then raise exception 'Student authority/requirements review does not cover the full term'; end if;
    -- Intake needs cannot silently disappear in review; corrected needs require a new intake.
    for key_value in select jsonb_array_elements_text(coalesce(r.students->idx->'accommodations','[]')) loop
      if not (s->'data'->'requirements' ? key_value) then raise exception 'A requested student requirement is missing from the review'; end if;
    end loop;
    for equipment_tag in select jsonb_array_elements_text(s->'data'->'requirements') loop
      if equipment_tag<>'attendant' and not equipment_tag=any(needed_tags) then needed_tags:=array_append(needed_tags,equipment_tag); end if;
    end loop;
    students:=students||jsonb_build_array(s||jsonb_build_object('sourceIndex',idx,'requestedName',r.students->idx->>'name'));
    if s->'data'->>'seating'='wheelchair' then wheels:=wheels+1; else seats:=seats+1; end if;
    if s->'data'->'requirements' ? 'wheelchair_lift' then lift_needed:=true; end if;
    if s->'data'->'requirements' ? 'booster_seat' then boosters:=boosters+1; end if;
    if s->'data'->'requirements' ? 'car_seat' then carseats:=carseats+1; end if;
    if s->'data'->'requirements' ? 'attendant' then helpers:=helpers+1; end if;
  end loop;
  i:=0;
  for item in select value from jsonb_array_elements(d->'points') loop
    p:=public.student_planning_ref(t,item,'point',c);
    idx:=case when d->>'direction'='outbound' then case when i=0 then n else indices[i] end
      else case when i=n then n else indices[i+1] end end;
    if p->'data'->>'requestId'<>r.request_id::text or (p->'data'->>'stopIndex')::integer<>idx
      or (p->'data'->>'validFrom')::date>first_day or (p->'data'->>'validUntil')::date<last_day then raise exception 'Approved loading point does not match this stop or term'; end if;
    points:=points||jsonb_build_array(p); i:=i+1;
  end loop;
  if resources_required then
    policy:=public.student_planning_ref(t,d->'policy','policy',c);
    vehicle:=public.student_planning_ref(t,d->'vehicle','resource');
    driver:=public.student_planning_ref(t,d->'driver','resource');
    if vehicle->'data'->>'role'<>'vehicle' or driver->'data'->>'role'<>'driver'
      or jsonb_typeof(d->'attendants') is distinct from 'array' or jsonb_array_length(d->'attendants')<>helpers then raise exception 'Assign a vehicle, driver and one dedicated attendant per requiring student'; end if;
    ids:=array[vehicle->>'id',driver->>'id'];
    for item in select value from jsonb_array_elements(d->'attendants') loop
      attendant:=public.student_planning_ref(t,item,'resource');
      if attendant->'data'->>'role'<>'attendant' or attendant->>'id'=any(ids) then raise exception 'Distinct qualified attendants required'; end if;
      ids:=array_append(ids,attendant->>'id'); crew:=crew||jsonb_build_array(attendant);
    end loop;
    for item in select value from jsonb_array_elements(jsonb_build_array(policy,vehicle,driver)||crew) loop
      if (item->'data'->>'validFrom')::date>first_day or (item->'data'->>'validUntil')::date<last_day then raise exception 'Resource or policy review expires before the schedule ends'; end if;
    end loop;
    for key_value in select jsonb_array_elements_text(policy->'data'->'driverKeys') loop
      if not exists(select 1 from jsonb_array_elements(driver->'data'->'credentials') cr where cr->>'key'=key_value
        and (cr->>'validFrom')::date<=first_day and (cr->>'validUntil')::date>=last_day) then raise exception 'Driver required credential missing or expiring during term'; end if;
    end loop;
    for attendant in select value from jsonb_array_elements(crew) loop
      for key_value in select jsonb_array_elements_text(policy->'data'->'attendantKeys') loop
        if not exists(select 1 from jsonb_array_elements(attendant->'data'->'credentials') cr where cr->>'key'=key_value
          and (cr->>'validFrom')::date<=first_day and (cr->>'validUntil')::date>=last_day) then raise exception 'Attendant required credential missing or expiring during term'; end if;
      end loop;
    end loop;
    foreach equipment_tag in array needed_tags loop
      conditional_keys:=coalesce(policy->'data'->'equipmentDriverKeys'->equipment_tag,'[]');
      if jsonb_array_length(conditional_keys)=0 then raise exception 'Policy must specify Driver qualification for each required equipment tag'; end if;
      for key_value in select jsonb_array_elements_text(conditional_keys) loop
        if not exists(select 1 from jsonb_array_elements(driver->'data'->'credentials') cr where cr->>'key'=key_value
          and (cr->>'validFrom')::date<=first_day and (cr->>'validUntil')::date>=last_day) then raise exception 'Driver equipment-specific credential missing or expiring during term'; end if;
      end loop;
      if helpers>0 then
        conditional_keys:=coalesce(policy->'data'->'equipmentAttendantKeys'->equipment_tag,'[]');
        if jsonb_array_length(conditional_keys)=0 then raise exception 'Policy must specify attendant qualification for required equipment'; end if;
        for attendant in select value from jsonb_array_elements(crew) loop
          for key_value in select jsonb_array_elements_text(conditional_keys) loop
            if not exists(select 1 from jsonb_array_elements(attendant->'data'->'credentials') cr where cr->>'key'=key_value
              and (cr->>'validFrom')::date<=first_day and (cr->>'validUntil')::date>=last_day) then raise exception 'Attendant equipment-specific credential missing or expiring during term'; end if;
          end loop;
        end loop;
      end if;
    end loop;
    if (lift_needed and vehicle->'data'->'lift' is distinct from 'true'::jsonb)
      or (wheels>0 and vehicle->'data'->'securementReviewed' is distinct from 'true'::jsonb)
      or (vehicle->'data'->>'seats')::integer<seats+helpers or (vehicle->'data'->>'wheelchairPositions')::integer<wheels
      or (vehicle->'data'->>'boosterSeats')::integer<boosters or (vehicle->'data'->>'carSeats')::integer<carseats then
      raise exception 'Vehicle configuration cannot satisfy seats, wheelchair positions, restraints or attendant seats'; end if;
  end if;
  -- Per-segment demand: all homes before school inbound; school then homes outbound.
  passenger_seats:=case when d->>'direction'='outbound' then seats else 0 end;
  passenger_wheels:=case when d->>'direction'='outbound' then wheels else 0 end;
  segment_boosters:=case when d->>'direction'='outbound' then boosters else 0 end;
  segment_carseats:=case when d->>'direction'='outbound' then carseats else 0 end;
  for i in 0..n-1 loop
    if d->>'direction'='inbound' then s:=students->i;
      if s->'data'->>'seating'='wheelchair' then passenger_wheels:=passenger_wheels+1; else passenger_seats:=passenger_seats+1; end if;
      if s->'data'->'requirements' ? 'booster_seat' then segment_boosters:=segment_boosters+1; end if;
      if s->'data'->'requirements' ? 'car_seat' then segment_carseats:=segment_carseats+1; end if;
    elsif i>0 then s:=students->(i-1);
      if s->'data'->>'seating'='wheelchair' then passenger_wheels:=passenger_wheels-1; else passenger_seats:=passenger_seats-1; end if;
      if s->'data'->'requirements' ? 'booster_seat' then segment_boosters:=segment_boosters-1; end if;
      if s->'data'->'requirements' ? 'car_seat' then segment_carseats:=segment_carseats-1; end if;
    end if;
    segments:=segments||jsonb_build_array(jsonb_build_object('fromStop',i,'toStop',i+1,'studentSeats',passenger_seats,
      'wheelchairPositions',passenger_wheels,'attendantSeats',helpers,'boosterSeats',segment_boosters,'carSeats',segment_carseats));
  end loop;
  return jsonb_build_object('students',students,'points',points,'policy',policy,'vehicle',vehicle,'driver',driver,'attendants',crew,'segments',segments);
end $$;

create function public.save_student_route_plan(t uuid,entity_value uuid,expected_revision integer,reference_value text,
  data_value jsonb,reason_value text,request_key uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor uuid:=public.current_person_id(); prior public.student_planning_mutations; h public.student_planning_versions;
  e public.student_planning_entities; r public.student_transportation_requests; fingerprint text; id uuid:=coalesce(entity_value,gen_random_uuid());
  d jsonb; item jsonb; snapshot jsonb; rev integer; day_number integer;
begin
  perform public.student_planning_lock(t);
  fingerprint:=md5(jsonb_build_array('schedule',entity_value,expected_revision,reference_value,data_value,reason_value)::text);
  select * into prior from public.student_planning_mutations where tenant_id=t and actor_id=actor and student_planning_mutations.request_key=save_student_route_plan.request_key;
  if found then if prior.fingerprint<>fingerprint then raise exception 'Request identifier already used'; end if; return prior.result; end if;
  if request_key is null or expected_revision is null or expected_revision<0 or coalesce(length(btrim(reference_value)),0) not between 1 and 100
    or coalesce(length(btrim(reason_value)),0) not between 3 and 300 or jsonb_typeof(data_value) is distinct from 'object'
    or octet_length(data_value::text)>50000 then raise exception 'Complete schedule and change reason required'; end if;
  select * into r from public.student_transportation_requests where tenant_id=t and request_id=(data_value->>'requestId')::uuid;
  if r.request_id is null then raise exception 'Source request unavailable'; end if;
  if entity_value is not null then
    select * into e from public.student_planning_entities where tenant_id=t and entity_id=id;
    h:=public.student_planning_head(t,id);
    if e.kind is distinct from 'schedule' or e.customer_id<>r.customer_id or e.reference<>upper(btrim(reference_value))
      or h.revision is distinct from expected_revision or h.data->>'requestId'<>r.request_id::text then raise exception 'Schedule changed; refresh before revising'; end if;
  elsif expected_revision<>0 then raise exception 'New schedule must start at revision zero'; end if;
  if data_value->'calendarReviewed' is distinct from 'true'::jsonb or coalesce(length(btrim(data_value->>'name')),0) not between 1 and 120 or coalesce(data_value->>'direction','') not in ('inbound','outbound')
    or not exists(select 1 from pg_timezone_names where name=data_value->>'timeZone' and (name like '%/%' or name='UTC') and name not like 'posix/%' and name not like 'right/%')
    or (data_value->>'startDate')::date is null or (data_value->>'endDate')::date is null
    or (data_value->>'endDate')::date<(data_value->>'startDate')::date
    or (data_value->>'endDate')::date>(data_value->>'startDate')::date+366
    or coalesce(data_value->>'startTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or coalesce(data_value->>'endTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or (data_value->>'endTime')::time<=(data_value->>'startTime')::time
    or jsonb_typeof(data_value->'weekdays') is distinct from 'array' or jsonb_array_length(data_value->'weekdays') not between 1 and 7
    or jsonb_typeof(data_value->'exceptions') is distinct from 'array' or jsonb_array_length(data_value->'exceptions')>100
    or coalesce((data_value->>'bufferMinutes')::integer,-1) not between 0 and 120 then raise exception 'Valid term, IANA time zone, weekdays and same-day service window required'; end if;
  for day_number in select value::integer from jsonb_array_elements_text(data_value->'weekdays') loop
    if day_number not between 1 and 7 then raise exception 'Weekdays must use ISO days one through seven'; end if;
  end loop;
  for item in select value from jsonb_array_elements(data_value->'exceptions') loop
    if (item->>'date')::date is null or (item->>'date')::date not between (data_value->>'startDate')::date and (data_value->>'endDate')::date
      or coalesce(length(btrim(item->>'reason')),0) not between 3 and 200 then raise exception 'Calendar exceptions need term dates and reasons'; end if;
  end loop;
  d:=jsonb_build_object('requestId',r.request_id,'name',btrim(data_value->>'name'),'direction',data_value->>'direction','timeZone',data_value->>'timeZone',
    'startDate',(data_value->>'startDate')::date,'endDate',(data_value->>'endDate')::date,'startTime',data_value->>'startTime','endTime',data_value->>'endTime',
    'weekdays',data_value->'weekdays','exceptions',data_value->'exceptions','bufferMinutes',(data_value->>'bufferMinutes')::integer,
    'calendarReviewed',true,'students',data_value->'students','points',data_value->'points','policy',data_value->'policy','vehicle',data_value->'vehicle',
    'driver',data_value->'driver','attendants',coalesce(data_value->'attendants','[]'));
  snapshot:=public.student_plan_snapshot(t,d,false);
  if entity_value is null then insert into public.student_planning_entities values(id,t,r.customer_id,'schedule',upper(btrim(reference_value))); end if;
  rev:=coalesce(h.revision,0)+1;
  insert into public.student_planning_versions values(t,id,rev,'draft',d,actor,clock_timestamp(),btrim(reason_value));
  for item in select value from jsonb_array_elements((d->'students')||(d->'points')) with ordinality v(value,ord) loop
    insert into public.student_planning_links values(t,id,rev,(select count(*)::text from public.student_planning_links where tenant_id=t and schedule_id=id and schedule_revision=rev),
      (item->>'id')::uuid,(item->>'revision')::integer);
  end loop;
  perform public.student_enrollment_audit(t,'student_planning.schedule_drafted',id::text,'Internal reviewer saved a schedule revision.',jsonb_build_object('revision',rev));
  d:=jsonb_build_object('id',id,'revision',rev);
  insert into public.student_planning_mutations values(t,actor,request_key,fingerprint,d); return d;
end $$;

create function public.student_route_plan_preview(t uuid,id uuid,revision_value integer) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare h public.student_planning_versions; snapshot jsonb;
begin
  if not public.can_read_student_planning(t) then raise exception 'Internal planning access required'; end if;
  h:=public.student_planning_head(t,id);
  if h.revision is distinct from revision_value or h.state='cancelled' then raise exception 'Schedule changed; refresh first'; end if;
  snapshot:=public.student_plan_snapshot(t,h.data,false);
  return jsonb_build_object('planId',id,'revision',h.revision,'planHash',md5(h.data::text),'customerId',
    (select customer_id from public.student_planning_entities where tenant_id=t and entity_id=id),'snapshot',snapshot);
end $$;

create function public.approve_student_route_plan(t uuid,id uuid,expected_revision integer,receipt_value uuid,reason_value text,request_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare h public.student_planning_versions; receipt public.student_request_geography_receipts; actor uuid:=public.current_person_id();
  prior public.student_planning_mutations; fingerprint text; snapshot jsonb; result jsonb; item jsonb; rev integer;
begin
  perform public.student_planning_lock(t);
  fingerprint:=md5(jsonb_build_array('approve',id,expected_revision,receipt_value,reason_value)::text);
  select * into prior from public.student_planning_mutations where tenant_id=t and actor_id=actor and student_planning_mutations.request_key=approve_student_route_plan.request_key;
  if found then if prior.fingerprint<>fingerprint then raise exception 'Request identifier already used'; end if; return prior.result; end if;
  h:=public.student_planning_head(t,id);
  if h.revision is distinct from expected_revision or h.state<>'draft' or request_key is null or coalesce(length(btrim(reason_value)),0) not between 3 and 300 then raise exception 'Current draft and approval reason required'; end if;
  if exists(select 1 from public.student_transportation_requests where request_id=(h.data->>'requestId')::uuid and submitted_by=actor) then raise exception 'A different reviewer must approve this customer request'; end if;
  select * into receipt from public.student_request_geography_receipts where receipt_id=receipt_value and tenant_id=t and auth_user_id=auth.uid()
    and customer_id=(select customer_id from public.student_planning_entities where tenant_id=t and entity_id=id)
    and expires_at>now() and payload->>'kind'='planning' and payload->>'planId'=id::text
    and (payload->>'revision')::integer=h.revision and payload->>'planHash'=md5(h.data::text);
  if not found then raise exception 'Fresh server road preview of this exact revision required'; end if;
  if (receipt.payload->>'durationSeconds')::numeric<=0 or (receipt.payload->>'durationSeconds')::numeric is null
    or (receipt.payload->>'durationSeconds')::numeric>extract(epoch from ((h.data->>'endTime')::time-(h.data->>'startTime')::time)) then
    raise exception 'Road duration does not fit the service window; allow loading time too'; end if;
  snapshot:=public.student_plan_snapshot(t,h.data,true);
  rev:=h.revision+1;
  insert into public.student_planning_versions values(t,id,rev,'planning_approved',h.data||jsonb_build_object('approvedSnapshot',snapshot,
    'roadPreview',jsonb_build_object('distanceMeters',receipt.payload->'distanceMeters','durationSeconds',receipt.payload->'durationSeconds',
      'verifiedAt',receipt.payload->'verifiedAt'),'operationallyReady',false),actor,clock_timestamp(),btrim(reason_value));
  for item in select value from jsonb_array_elements((h.data->'students')||(h.data->'points')||jsonb_build_array(h.data->'policy',h.data->'vehicle',h.data->'driver')||(h.data->'attendants')) loop
    insert into public.student_planning_links values(t,id,rev,(select count(*)::text from public.student_planning_links where tenant_id=t and schedule_id=id and schedule_revision=rev),(item->>'id')::uuid,(item->>'revision')::integer);
  end loop;
  perform public.student_enrollment_audit(t,'student_planning.schedule_approved',id::text,'Internal reviewer approved planning data, not transport execution.',jsonb_build_object('revision',rev));
  result:=jsonb_build_object('id',id,'revision',rev);
  insert into public.student_planning_mutations values(t,actor,request_key,fingerprint,result); return result;
end $$;

create function public.student_planning_head(t uuid,id uuid) returns public.student_planning_versions
language sql stable security definer set search_path=public as $$
  select v from public.student_planning_versions v where tenant_id=t and entity_id=id order by revision desc limit 1;
$$;
create function public.student_planning_ref(t uuid,ref jsonb,k text,c uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare h public.student_planning_versions; e public.student_planning_entities;
begin
  select * into e from public.student_planning_entities where tenant_id=t and entity_id=(ref->>'id')::uuid;
  h:=public.student_planning_head(t,e.entity_id);
  if e.entity_id is null or e.kind<>k or (c is not null and e.customer_id is distinct from c)
    or h.revision is distinct from (ref->>'revision')::integer or h.state<>'active' then
    raise exception 'A referenced review is missing, revoked or superseded; refresh and review again'; end if;
  return jsonb_build_object('id',e.entity_id,'revision',h.revision,'kind',e.kind,'reference',e.reference,'data',h.data,
    'reviewedBy',h.actor_id,'reviewedAt',h.recorded_at);
end $$;

-- Shared internal gate/tenant lock serializes revisions and reservations. No client-supplied actor.
create function public.student_planning_lock(t uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_student_enrollment_access(t,'reviewer') then raise exception 'Explicit internal reviewer access required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('student-planning:'||t::text,0));
  perform 1 from public.student_transportation_enrollment_programs where tenant_id=t for share;
  perform 1 from public.student_transportation_enrollment_access where tenant_id=t and person_id=public.current_person_id() for share;
  if not public.has_student_enrollment_access(t,'reviewer') then raise exception 'Explicit internal reviewer access required'; end if;
end $$;

-- Approved policy defines actual required evidence keys; no built-in legal clearance assumptions.
create function public.save_student_planning_record(t uuid,kind_value text,customer_value uuid,reference_value text,
  entity_value uuid,expected_revision integer,state_value text,data_value jsonb,reason_value text,request_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=public.current_person_id(); fingerprint text; prior public.student_planning_mutations;
  e public.student_planning_entities; h public.student_planning_versions; id uuid; rev integer; d jsonb; item jsonb;
  r public.student_transportation_requests; index_value integer; key_value text; clean_credentials jsonb:='[]';
  tag_value text; driver_equipment jsonb:='{}'; attendant_equipment jsonb:='{}'; values_list jsonb;
begin
  perform public.student_planning_lock(t);
  fingerprint:=md5(jsonb_build_array(kind_value,customer_value,reference_value,entity_value,expected_revision,state_value,data_value,reason_value)::text);
  select * into prior from public.student_planning_mutations where tenant_id=t and actor_id=actor and student_planning_mutations.request_key=save_student_planning_record.request_key;
  if found then if prior.fingerprint<>fingerprint then raise exception 'Request identifier already used'; end if; return prior.result; end if;
  if request_key is null or expected_revision is null or expected_revision<0 or coalesce(length(btrim(reason_value)),0) not between 3 and 300
    or kind_value is null or kind_value not in ('student','point','policy','resource') or state_value not in ('active','revoked')
    or state_value is null or coalesce(length(btrim(reference_value)),0) not between 1 and 100
    or jsonb_typeof(data_value) is distinct from 'object' or octet_length(data_value::text)>20000 then raise exception 'Complete reviewed record and reason required'; end if;
  if kind_value in ('student','point','policy') then
    if not exists(select 1 from public.student_transportation_customers where tenant_id=t and customer_id=customer_value and status='active') then raise exception 'Active customer required'; end if;
  elsif customer_value is not null then raise exception 'Dedicated resources are business-scoped'; end if;
  id:=coalesce(entity_value,gen_random_uuid());
  if entity_value is not null then
    select * into e from public.student_planning_entities where tenant_id=t and entity_id=id;
    h:=public.student_planning_head(t,id);
    if e.entity_id is null or e.kind<>kind_value or e.customer_id is distinct from customer_value or e.reference<>upper(btrim(reference_value))
      or h.revision is distinct from expected_revision then raise exception 'Record changed; refresh before saving'; end if;
  elsif expected_revision<>0 then raise exception 'New record must start at revision zero'; end if;
  if kind_value='student' then
    if coalesce(length(btrim(data_value->>'name')),0) not between 1 and 120
      or data_value->'authorityReviewed' is distinct from 'true'::jsonb or data_value->'requirementsReviewed' is distinct from 'true'::jsonb
      or coalesce(length(btrim(data_value->>'authorityReference')),0) not between 3 and 200
      or coalesce(data_value->>'seating','') not in ('seat','wheelchair') or jsonb_typeof(data_value->'requirements') is distinct from 'array'
      or jsonb_array_length(data_value->'requirements')>4 then raise exception 'Student identity, authority and requirements review required'; end if;
    for key_value in select jsonb_array_elements_text(data_value->'requirements') loop
      if key_value not in ('wheelchair_lift','booster_seat','car_seat','attendant') then raise exception 'Unknown operational requirement'; end if;
    end loop;
    if (data_value->>'seating'='wheelchair' and (not (data_value->'requirements' ? 'wheelchair_lift') or data_value->'requirements' ? 'booster_seat' or data_value->'requirements' ? 'car_seat'))
      or (data_value->'requirements' ? 'booster_seat' and data_value->'requirements' ? 'car_seat') then raise exception 'Resolve seating and restraint requirements'; end if;
    d:=jsonb_build_object('name',btrim(data_value->>'name'),'authorityReviewed',true,'authorityReference',btrim(data_value->>'authorityReference'),
      'requirementsReviewed',true,'requirements',data_value->'requirements','seating',data_value->>'seating',
      'validFrom',(data_value->>'validFrom')::date,'validUntil',(data_value->>'validUntil')::date);
  elsif kind_value='point' then
    select * into r from public.student_transportation_requests where tenant_id=t and customer_id=customer_value and request_id=(data_value->>'requestId')::uuid;
    index_value:=(data_value->>'stopIndex')::integer;
    if r.request_id is null or r.status<>'submitted' or r.geography_status<>'geocoded' or index_value is null
      or index_value<0 or index_value>=jsonb_array_length(r.geography->'stops')
      or coalesce(length(btrim(data_value->>'label')),0) not between 1 and 100
      or coalesce(data_value->>'loadingType','') not in ('curb','driveway_loop','designated_zone')
      or data_value->'siteReviewed' is distinct from 'true'::jsonb
      or coalesce(length(btrim(data_value->>'siteReference')),0) not between 3 and 200
      or (data_value->>'latitude')::numeric not between -90 and 90 or (data_value->>'longitude')::numeric not between -180 and 180
      or data_value->>'latitude' is null or data_value->>'longitude' is null
      or coalesce(length(data_value->>'instructions'),0)>300 then raise exception 'Specific loading point and site review required'; end if;
    -- Large address changes require a fresh geographic request, not a misleading approval pin.
    if abs((data_value->>'latitude')::numeric-(r.geography->'stops'->index_value->>'latitude')::numeric)>0.005
      or abs((data_value->>'longitude')::numeric-(r.geography->'stops'->index_value->>'longitude')::numeric)>0.005 then
      raise exception 'Loading point moved too far; submit a newly verified address'; end if;
    d:=jsonb_build_object('requestId',r.request_id,'stopIndex',index_value,'address',r.geography->'stops'->index_value->>'address',
      'latitude',(data_value->>'latitude')::numeric,'longitude',(data_value->>'longitude')::numeric,'label',btrim(data_value->>'label'),
      'loadingType',data_value->>'loadingType','instructions',coalesce(data_value->>'instructions',''),'siteReviewed',true,
      'siteReference',btrim(data_value->>'siteReference'),'validFrom',(data_value->>'validFrom')::date,'validUntil',(data_value->>'validUntil')::date);
  elsif kind_value='policy' then
    if data_value->'policyReviewed' is distinct from 'true'::jsonb or coalesce(length(btrim(data_value->>'sourceReference')),0) not between 3 and 200
      or jsonb_typeof(data_value->'driverKeys') is distinct from 'array' or jsonb_typeof(data_value->'attendantKeys') is distinct from 'array'
      or jsonb_array_length(data_value->'driverKeys') not between 1 and 20 or jsonb_array_length(data_value->'attendantKeys') not between 1 and 20 then raise exception 'Approved district policy and required credential keys required'; end if;
    for key_value in select jsonb_array_elements_text((data_value->'driverKeys')||(data_value->'attendantKeys')) loop
      if key_value !~ '^[a-z][a-z0-9_]{1,63}$' then raise exception 'Use explicit credential keys'; end if;
    end loop;
    foreach tag_value in array array['wheelchair_lift','booster_seat','car_seat'] loop
      values_list:=coalesce(data_value->'equipmentDriverKeys'->tag_value,'[]');
      if jsonb_typeof(values_list)<>'array' or jsonb_array_length(values_list)>20 then raise exception 'Equipment credential keys must be bounded lists'; end if;
      for key_value in select jsonb_array_elements_text(values_list) loop
        if key_value !~ '^[a-z][a-z0-9_]{1,63}$' then raise exception 'Use explicit equipment credential keys'; end if;
      end loop;
      driver_equipment:=driver_equipment||jsonb_build_object(tag_value,values_list);
      values_list:=coalesce(data_value->'equipmentAttendantKeys'->tag_value,'[]');
      if jsonb_typeof(values_list)<>'array' or jsonb_array_length(values_list)>20 then raise exception 'Equipment credential keys must be bounded lists'; end if;
      for key_value in select jsonb_array_elements_text(values_list) loop
        if key_value !~ '^[a-z][a-z0-9_]{1,63}$' then raise exception 'Use explicit equipment credential keys'; end if;
      end loop;
      attendant_equipment:=attendant_equipment||jsonb_build_object(tag_value,values_list);
    end loop;
    d:=jsonb_build_object('sourceReference',btrim(data_value->>'sourceReference'),'driverKeys',data_value->'driverKeys','attendantKeys',data_value->'attendantKeys',
      'equipmentDriverKeys',driver_equipment,'equipmentAttendantKeys',attendant_equipment,
      'policyReviewed',true,'validFrom',(data_value->>'validFrom')::date,'validUntil',(data_value->>'validUntil')::date);
  else
    if coalesce(data_value->>'role','') not in ('vehicle','driver','attendant') or coalesce(length(btrim(data_value->>'label')),0) not between 1 and 120
      or data_value->'dedicatedReviewed' is distinct from 'true'::jsonb or coalesce(length(btrim(data_value->>'evidenceReference')),0) not between 3 and 200
      or jsonb_typeof(data_value->'credentials') is distinct from 'array' or jsonb_array_length(data_value->'credentials')>20 then raise exception 'Dedicated resource and reviewed evidence required'; end if;
    for item in select value from jsonb_array_elements(data_value->'credentials') loop
      if coalesce(item->>'key','') !~ '^[a-z][a-z0-9_]{1,63}$' or coalesce(length(btrim(item->>'reference')),0) not between 3 and 200
        or (item->>'validFrom')::date is null or (item->>'validUntil')::date is null or (item->>'validUntil')::date<(item->>'validFrom')::date then raise exception 'Credential review dates and evidence reference required'; end if;
      clean_credentials:=clean_credentials||jsonb_build_array(jsonb_build_object('key',item->>'key','reference',btrim(item->>'reference'),
        'validFrom',(item->>'validFrom')::date,'validUntil',(item->>'validUntil')::date));
    end loop;
    if entity_value is not null and h.data->>'role' is distinct from data_value->>'role' then raise exception 'Resource role cannot change; register a distinct resource'; end if;
    if data_value->>'role'='vehicle' and (
      (data_value->>'seats')::integer not between 0 and 100 or (data_value->>'wheelchairPositions')::integer not between 0 and 20
      or (data_value->>'boosterSeats')::integer not between 0 and 100 or (data_value->>'carSeats')::integer not between 0 and 100
      or data_value->>'seats' is null or data_value->>'wheelchairPositions' is null or data_value->>'boosterSeats' is null or data_value->>'carSeats' is null
      or jsonb_typeof(data_value->'lift') is distinct from 'boolean' or jsonb_typeof(data_value->'securementReviewed') is distinct from 'boolean') then raise exception 'Vehicle configuration capacities required'; end if;
    d:=jsonb_build_object('role',data_value->>'role','label',btrim(data_value->>'label'),'dedicatedReviewed',true,
      'evidenceReference',btrim(data_value->>'evidenceReference'),'credentials',clean_credentials,
      'validFrom',(data_value->>'validFrom')::date,'validUntil',(data_value->>'validUntil')::date,
      'seats',case when data_value->>'role'='vehicle' then (data_value->>'seats')::integer else 0 end,
      'wheelchairPositions',case when data_value->>'role'='vehicle' then (data_value->>'wheelchairPositions')::integer else 0 end,
      'boosterSeats',case when data_value->>'role'='vehicle' then (data_value->>'boosterSeats')::integer else 0 end,
      'carSeats',case when data_value->>'role'='vehicle' then (data_value->>'carSeats')::integer else 0 end,
      'lift',coalesce((data_value->>'lift')::boolean,false),'securementReviewed',coalesce((data_value->>'securementReviewed')::boolean,false));
  end if;
  if d->>'validFrom' is null or d->>'validUntil' is null or (d->>'validUntil')::date<(d->>'validFrom')::date then raise exception 'Effective review dates required'; end if;
  if entity_value is null then insert into public.student_planning_entities(entity_id,tenant_id,customer_id,kind,reference)
    values(id,t,customer_value,kind_value,upper(btrim(reference_value))); end if;
  rev:=coalesce(h.revision,0)+1;
  insert into public.student_planning_versions values(t,id,rev,state_value,d,actor,clock_timestamp(),btrim(reason_value));
  perform public.student_enrollment_audit(t,'student_planning.reviewed',id::text,'Internal reviewer recorded a planning revision.',jsonb_build_object('kind',kind_value,'revision',rev,'state',state_value));
  d:=jsonb_build_object('id',id,'revision',rev);
  insert into public.student_planning_mutations values(t,actor,request_key,fingerprint,d);
  return d;
end $$;

create function public.generate_student_manifests(t uuid,id uuid,expected_revision integer,from_day date,to_day date,
  reason_value text,request_key uuid,cancel_value boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor uuid:=public.current_person_id(); h public.student_planning_versions; prior public.student_planning_mutations;
  fingerprint text; reviewed_snapshot jsonb; result jsonb; item jsonb; resources jsonb; old public.student_daily_manifests;
  day_value date; local_start timestamp; local_end timestamp; start_value timestamptz; end_value timestamptz;
  included boolean; excluded_reason text; rev integer; count_value integer:=0; state_value text;
begin
  perform public.student_planning_lock(t);
  fingerprint:=md5(jsonb_build_array('manifests',id,expected_revision,from_day,to_day,reason_value,cancel_value)::text);
  select * into prior from public.student_planning_mutations where tenant_id=t and actor_id=actor and student_planning_mutations.request_key=generate_student_manifests.request_key;
  if found then if prior.fingerprint<>fingerprint then raise exception 'Request identifier already used'; end if; return prior.result; end if;
  h:=public.student_planning_head(t,id);
  if h.revision is distinct from expected_revision or request_key is null or coalesce(length(btrim(reason_value)),0) not between 3 and 300
    or from_day is null or to_day is null or to_day<from_day or to_day>from_day+13 or cancel_value is null then raise exception 'Current schedule, reason and at most fourteen dates required'; end if;
  if not exists(select 1 from public.student_planning_entities where tenant_id=t and entity_id=id and kind='schedule') then raise exception 'Schedule required'; end if;
  if not cancel_value then
    if h.state<>'planning_approved' then raise exception 'Planning-approved schedule required'; end if;
    reviewed_snapshot:=public.student_plan_snapshot(t,h.data,true);
    resources:=jsonb_build_array(reviewed_snapshot->'vehicle',reviewed_snapshot->'driver')||(reviewed_snapshot->'attendants');
  end if;
  for day_value in select generate_series(from_day::timestamp,to_day::timestamp,interval '1 day')::date loop
    if day_value<(now() at time zone (h.data->>'timeZone'))::date then raise exception 'Historical manifests cannot be rewritten'; end if;
    select * into old from public.student_daily_manifests where tenant_id=t and schedule_id=id and service_date=day_value order by revision desc limit 1;
    included:=not cancel_value and day_value between (h.data->>'startDate')::date and (h.data->>'endDate')::date
      and (h.data->'weekdays') @> jsonb_build_array(extract(isodow from day_value)::integer);
    select value->>'reason' into excluded_reason from jsonb_array_elements(h.data->'exceptions') where (value->>'date')::date=day_value limit 1;
    included:=included and excluded_reason is null;
    -- Explicit daily cancellations persist. Restoring service requires a newly reviewed template revision.
    if included and old.state='cancelled' and old.schedule_revision=h.revision then continue; end if;
    if not included and old.schedule_id is null then continue; end if;
    state_value:=case when included then 'planned' else 'cancelled' end;
    -- Existing identical daily output is stable even with a new request key.
    if old.schedule_id is not null and old.schedule_revision=h.revision and old.state=state_value then continue; end if;
    if included then
      local_start:=day_value+(h.data->>'startTime')::time; local_end:=day_value+(h.data->>'endTime')::time;
      start_value:=local_start at time zone (h.data->>'timeZone'); end_value:=local_end at time zone (h.data->>'timeZone');
      if start_value<=now() or end_value<=start_value
        or start_value at time zone (h.data->>'timeZone')<>local_start or end_value at time zone (h.data->>'timeZone')<>local_end
        or exists(select 1 from generate_series(-120,120,30) delta where delta<>0 and (
          (start_value+make_interval(mins=>delta)) at time zone (h.data->>'timeZone')=local_start
          or (end_value+make_interval(mins=>delta)) at time zone (h.data->>'timeZone')=local_end)) then
        raise exception 'Past, ambiguous or nonexistent local service window; revise the schedule'; end if;
      if (h.data->'roadPreview'->>'durationSeconds')::numeric>extract(epoch from end_value-start_value) then
        raise exception 'Road duration does not fit the actual dated service window'; end if;
      start_value:=start_value-make_interval(mins=>(h.data->>'bufferMinutes')::integer);
      end_value:=end_value+make_interval(mins=>(h.data->>'bufferMinutes')::integer);
      for item in select value from jsonb_array_elements(resources) loop
        if exists(select 1 from public.student_planning_reservations where tenant_id=t and resource_id=(item->>'id')::uuid
          and active and starts_at<end_value and ends_at>start_value and not(schedule_id=id and service_date=day_value)) then
          raise exception 'Driver, vehicle or attendant already reserved during this service window'; end if;
      end loop;
      -- Prevent a child being reserved on concurrent schedules, including two different vehicles.
      if exists(select 1 from public.student_daily_manifests m where m.tenant_id=t and m.state='planned'
        and not(m.schedule_id=id and m.service_date=day_value)
        and m.revision=(select max(m2.revision) from public.student_daily_manifests m2 where m2.tenant_id=t and m2.schedule_id=m.schedule_id and m2.service_date=m.service_date)
        and (m.snapshot->>'startsAt')::timestamptz<end_value and (m.snapshot->>'endsAt')::timestamptz>start_value
        and exists(select 1 from jsonb_array_elements(m.snapshot->'reviewedRecords'->'students') a
          join jsonb_array_elements(reviewed_snapshot->'students') b on a->>'id'=b->>'id')) then raise exception 'Student already reserved on an overlapping manifest'; end if;
    end if;
    rev:=coalesce(old.revision,0)+1;
    insert into public.student_daily_manifests values(t,id,day_value,rev,h.revision,state_value,
      jsonb_build_object('schedule',h.data,'reviewedRecords',case when included then reviewed_snapshot else old.snapshot->'reviewedRecords' end,
        'startsAt',case when included then start_value end,'endsAt',case when included then end_value end,
        'excludedReason',coalesce(excluded_reason,case when cancel_value then reason_value else 'Not a scheduled school day' end),
        'operationallyReady',false,'executionStatus','unavailable'),actor,clock_timestamp(),btrim(reason_value));
    update public.student_planning_reservations set active=false where tenant_id=t and schedule_id=id and service_date=day_value and active;
    if included then
      for item in select value from jsonb_array_elements(resources) loop
        insert into public.student_planning_reservations values(t,id,day_value,rev,(item->>'id')::uuid,(item->>'revision')::integer,start_value,end_value,true);
      end loop;
    end if;
    count_value:=count_value+1;
  end loop;
  result:=jsonb_build_object('changedDates',count_value);
  insert into public.student_planning_mutations values(t,actor,request_key,fingerprint,result);
  perform public.student_enrollment_audit(t,'student_planning.manifests_changed',id::text,'Internal reviewer generated or cancelled planning manifests.',jsonb_build_object('changed_dates',count_value,'cancelled',cancel_value));
  return result;
end $$;

create function public.my_student_planning(t uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare records jsonb; manifests jsonb;
begin
  if not public.can_read_student_planning(t) then raise exception 'Internal planning access required'; end if;
  select coalesce(jsonb_agg(row_value),'[]') into records from (
    select jsonb_build_object('id',e.entity_id,'kind',e.kind,'customerId',e.customer_id,'reference',e.reference,'revision',h.revision,
      'state',h.state,'data',h.data,'actorId',h.actor_id,'recordedAt',h.recorded_at,'reason',h.reason) row_value
    from public.student_planning_entities e cross join lateral public.student_planning_head(t,e.entity_id) h
    where e.tenant_id=t order by h.recorded_at desc limit 200
  ) q;
  select coalesce(jsonb_agg(row_value),'[]') into manifests from (
    select to_jsonb(m) row_value from public.student_daily_manifests m where tenant_id=t
    order by service_date desc,recorded_at desc limit 100
  ) q;
  return jsonb_build_object('records',records,'manifests',manifests,'recordLimit',200,'manifestLimit',100,'operationallyReady',false);
end $$;

-- A source withdrawal cancels future planning output without touching past snapshots.
create function public.cancel_withdrawn_student_plans() returns trigger language plpgsql security definer set search_path=public as $$
declare e public.student_planning_entities; h public.student_planning_versions; m public.student_daily_manifests; actor uuid:=public.current_person_id();
begin
  if old.status=new.status or new.status<>'withdrawn' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('student-planning:'||new.tenant_id::text,0));
  for e in select * from public.student_planning_entities where tenant_id=new.tenant_id and customer_id=new.customer_id and kind='schedule' loop
    h:=public.student_planning_head(new.tenant_id,e.entity_id);
    if h.data->>'requestId'<>new.request_id::text or h.state='cancelled' then continue; end if;
    insert into public.student_planning_versions values(new.tenant_id,e.entity_id,h.revision+1,'cancelled',h.data,actor,clock_timestamp(),'Source customer request withdrawn');
    for m in select x.* from public.student_daily_manifests x where x.tenant_id=new.tenant_id and x.schedule_id=e.entity_id
      and x.state='planned' and x.service_date>=(now() at time zone (h.data->>'timeZone'))::date
      and x.revision=(select max(y.revision) from public.student_daily_manifests y where y.tenant_id=x.tenant_id and y.schedule_id=x.schedule_id and y.service_date=x.service_date) loop
      insert into public.student_daily_manifests values(m.tenant_id,m.schedule_id,m.service_date,m.revision+1,h.revision+1,'cancelled',
        m.snapshot||jsonb_build_object('excludedReason','Source customer request withdrawn'),actor,clock_timestamp(),'Source customer request withdrawn');
    end loop;
    update public.student_planning_reservations set active=false where tenant_id=new.tenant_id and schedule_id=e.entity_id and active and ends_at>now();
    perform public.student_enrollment_audit(new.tenant_id,'student_planning.source_withdrawn',e.entity_id::text,'Source withdrawal cancelled future planning output.','{}');
  end loop;
  return new;
end $$;
create trigger student_source_withdrawal after update of status on public.student_transportation_requests
  for each row execute function public.cancel_withdrawn_student_plans();

revoke all on function public.can_read_student_planning(uuid),public.student_planning_head(uuid,uuid),public.student_planning_ref(uuid,jsonb,text,uuid),
  public.student_planning_lock(uuid),public.student_plan_snapshot(uuid,jsonb,boolean),public.cancel_withdrawn_student_plans(),
  public.save_student_planning_record(uuid,text,uuid,text,uuid,integer,text,jsonb,text,uuid),
  public.save_student_route_plan(uuid,uuid,integer,text,jsonb,text,uuid),public.student_route_plan_preview(uuid,uuid,integer),
  public.approve_student_route_plan(uuid,uuid,integer,uuid,text,uuid),public.generate_student_manifests(uuid,uuid,integer,date,date,text,uuid,boolean),
  public.my_student_planning(uuid) from public,anon,authenticated;
grant execute on function public.can_read_student_planning(uuid),public.save_student_planning_record(uuid,text,uuid,text,uuid,integer,text,jsonb,text,uuid),
  public.save_student_route_plan(uuid,uuid,integer,text,jsonb,text,uuid),public.student_route_plan_preview(uuid,uuid,integer),
  public.approve_student_route_plan(uuid,uuid,integer,uuid,text,uuid),public.generate_student_manifests(uuid,uuid,integer,date,date,text,uuid,boolean),
  public.my_student_planning(uuid) to authenticated;
