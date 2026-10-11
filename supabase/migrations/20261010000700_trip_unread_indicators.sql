-- Private attention state, independent of email/device consent and provider delivery.
create table public.trip_attention_reads (
  person_id uuid not null references public.person_profiles(person_id),
  role text not null check(role in ('rider','driver')),
  kind text not null check(kind in ('messages','support')),
  resource_id uuid not null,
  booking_id uuid not null references public.dispatch_bookings(booking_id) on delete cascade,
  version integer not null check(version > 0),
  primary key(person_id,role,kind,resource_id)
);
create index trip_attention_reads_resource on public.trip_attention_reads(kind,resource_id);
create index trip_attention_reads_booking on public.trip_attention_reads(booking_id);
alter table public.trip_attention_reads enable row level security;
revoke all on public.trip_attention_reads from public,anon,authenticated;
grant all on public.trip_attention_reads to service_role;

create function public.my_trip_attention(role_value text,tenant_value uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare actor uuid:=public.current_person_id(); result jsonb;
begin
  if auth.uid() is null or actor is null or role_value is null or role_value not in ('rider','driver')
    then raise exception 'Updates unavailable'; end if;
  with owned as (
    select b.* from public.dispatch_bookings b join public.tenants t on t.tenant_id=b.tenant_id and t.status='active'
    where (tenant_value is null or b.tenant_id=tenant_value) and (
      (role_value='rider' and exists(select 1 from public.rider_profiles r where r.tenant_id=b.tenant_id
        and r.rider_profile_id=b.rider_profile_id and r.status='active' and r.person_id=actor
        and r.rider_profile_id=public.current_rider_profile_id(b.tenant_id))) or
      (role_value='driver' and exists(select 1 from public.driver_profiles d where d.tenant_id=b.tenant_id
        and d.driver_profile_id=b.current_driver_profile_id and d.status='active' and d.person_id=actor
        and d.driver_profile_id=public.current_driver_profile_id())))
  ), incoming as (
    select b.booking_id,count(*)::integer as unread from owned b
    cross join lateral (select m.* from public.trip_messages m where m.booking_id=b.booking_id
      and m.tenant_id=b.tenant_id and m.rider_profile_id=b.rider_profile_id and m.driver_profile_id=b.current_driver_profile_id
      order by m.sent_at desc,m.message_id desc limit 100) m
    where b.status in ('accepted','arrived','in_progress') and m.sender_role<>role_value
      and exists(select 1 from public.rider_profiles r where r.tenant_id=b.tenant_id and r.rider_profile_id=b.rider_profile_id and r.status='active')
      and exists(select 1 from public.driver_profiles d where d.tenant_id=b.tenant_id and d.driver_profile_id=b.current_driver_profile_id and d.status='active')
      and not exists(select 1 from public.trip_attention_reads a where a.person_id=actor and a.role=role_value
        and a.kind='messages' and a.resource_id=m.message_id)
    group by b.booking_id
  ), cases as (
    select c.case_id,c.booking_id,c.version from public.trip_support_cases c join owned b
      on b.booking_id=c.booking_id and b.tenant_id=c.tenant_id and b.rider_profile_id=c.rider_profile_id
      where role_value='rider' and b.status in ('completed','cancelled') and c.version>1
    union all
    select c.case_id,c.booking_id,c.version from public.driver_trip_support_cases c join owned b
      on b.booking_id=c.booking_id and b.tenant_id=c.tenant_id and b.current_driver_profile_id=c.driver_profile_id
      where role_value='driver' and b.status in ('completed','cancelled') and c.version>1
  ), updates as (
    select 'messages'::text as kind,booking_id as "bookingId",booking_id as "itemId",unread as count from incoming
    union all
    select 'support',c.booking_id,c.case_id,1 from cases c where c.version>coalesce((select a.version
      from public.trip_attention_reads a where a.person_id=actor and a.role=role_value and a.kind='support' and a.resource_id=c.case_id),1)
  ) select coalesce(jsonb_agg(to_jsonb(u) order by kind,"bookingId","itemId"),'[]'::jsonb) into result from updates u;
  return result;
end; $$;

create function public.mark_my_trip_messages_read(booking_value uuid,role_value text,message_values uuid[]) returns boolean
language plpgsql security definer set search_path=public as $$
declare actor uuid; b public.dispatch_bookings; changed integer;
begin
  select * into b from public.dispatch_bookings where booking_id=booking_value for share;
  actor:=public.require_trip_message_access(booking_value,role_value);
  if message_values is null or cardinality(message_values) not between 1 and 100
    or array_position(message_values,null) is not null then raise exception 'Updates unavailable'; end if;
  if exists(select 1 from unnest(message_values) v where not exists(select 1 from public.trip_messages m
    where m.message_id=v and m.booking_id=b.booking_id and m.tenant_id=b.tenant_id
      and m.rider_profile_id=b.rider_profile_id and m.driver_profile_id=b.current_driver_profile_id and m.sender_role<>role_value))
    then raise exception 'Updates unavailable'; end if;
  insert into public.trip_attention_reads(person_id,role,kind,resource_id,booking_id,version)
    select actor,role_value,'messages',v,b.booking_id,1 from unnest(message_values) v on conflict do nothing;
  get diagnostics changed=row_count;
  if changed>0 then
    insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,
      reason,correlation_id,resource_type,resource_id,metadata)
    values(b.tenant_id,'trip.messages_viewed','person',actor,'{}','Participant viewed trip messages.',
      gen_random_uuid(),'dispatch_booking',b.booking_id::text,jsonb_build_object('role',role_value,'count',changed));
  end if;
  return true;
end; $$;

create function public.mark_my_trip_support_read(booking_value uuid,role_value text,case_value uuid,version_value integer) returns boolean
language plpgsql security definer set search_path=public as $$
declare actor uuid; b public.dispatch_bookings; latest integer; changed integer;
begin
  select * into b from public.dispatch_bookings where booking_id=booking_value for share;
  if role_value='rider' then
    actor:=public.require_rider_support_access(booking_value);
    select c.version into latest from public.trip_support_cases c where c.case_id=case_value and c.booking_id=b.booking_id
      and c.tenant_id=b.tenant_id and c.rider_profile_id=b.rider_profile_id;
  elsif role_value='driver' then
    actor:=public.require_driver_support_access(booking_value);
    select c.version into latest from public.driver_trip_support_cases c where c.case_id=case_value and c.booking_id=b.booking_id
      and c.tenant_id=b.tenant_id and c.driver_profile_id=b.current_driver_profile_id;
  else raise exception 'Updates unavailable'; end if;
  if latest is null or version_value is null or version_value<2 or version_value>latest then raise exception 'Updates unavailable'; end if;
  insert into public.trip_attention_reads(person_id,role,kind,resource_id,booking_id,version)
    values(actor,role_value,'support',case_value,b.booking_id,version_value)
    on conflict(person_id,role,kind,resource_id) do update set version=excluded.version
      where trip_attention_reads.version<excluded.version;
  get diagnostics changed=row_count;
  if changed>0 then
    insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,
      reason,correlation_id,resource_type,resource_id,metadata)
    values(b.tenant_id,'trip.support_viewed','person',actor,'{}','Participant viewed a company response.',
      gen_random_uuid(),'dispatch_booking',b.booking_id::text,jsonb_build_object('role',role_value,'case_id',case_value,'version',version_value));
  end if;
  return true;
end; $$;

create function public.clear_trip_message_reads() returns trigger language plpgsql security definer set search_path=public as $$
begin delete from public.trip_attention_reads where kind='messages' and resource_id=old.message_id; return old; end; $$;
create trigger trip_message_reads_cleanup after delete on public.trip_messages for each row execute function public.clear_trip_message_reads();
revoke all on function public.my_trip_attention(text,uuid),public.mark_my_trip_messages_read(uuid,text,uuid[]),
  public.mark_my_trip_support_read(uuid,text,uuid,integer),public.clear_trip_message_reads() from public,anon,authenticated;
grant execute on function public.my_trip_attention(text,uuid),public.mark_my_trip_messages_read(uuid,text,uuid[]),
  public.mark_my_trip_support_read(uuid,text,uuid,integer) to authenticated;
