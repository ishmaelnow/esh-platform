-- Private, current-assignment text only. No public table access or message previews in alerts.
create table public.trip_messages (
  message_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, booking_id uuid not null, rider_profile_id uuid not null,
  driver_profile_id uuid not null, sender_role text not null check(sender_role in ('rider','driver')),
  request_id uuid not null, body text not null check(char_length(btrim(body)) between 1 and 1000),
  sent_at timestamptz not null default now(),
  foreign key(tenant_id,booking_id) references public.dispatch_bookings(tenant_id,booking_id) on delete cascade,
  foreign key(tenant_id,rider_profile_id) references public.rider_profiles(tenant_id,rider_profile_id),
  foreign key(tenant_id,driver_profile_id) references public.driver_profiles(tenant_id,driver_profile_id),
  unique(booking_id,sender_role,request_id)
);
create index trip_messages_thread on public.trip_messages(booking_id,sent_at,message_id);
alter table public.trip_messages enable row level security;
revoke all on public.trip_messages from public,anon,authenticated;
grant all on public.trip_messages to service_role;

create function public.require_trip_message_access(booking_value uuid,role_value text) returns uuid
language plpgsql stable security definer set search_path=public as $$
declare b public.dispatch_bookings; person_value uuid:=public.current_person_id();
begin
  select * into b from public.dispatch_bookings where booking_id=booking_value;
  if auth.uid() is null or person_value is null or role_value is null or role_value not in ('rider','driver')
    or b.booking_id is null or b.status not in ('accepted','arrived','in_progress')
    or b.rider_profile_id is null or b.current_driver_profile_id is null
    or not exists(select 1 from public.tenants where tenant_id=b.tenant_id and status='active')
    or not exists(select 1 from public.rider_profiles r where r.rider_profile_id=b.rider_profile_id
      and r.tenant_id=b.tenant_id and r.status='active')
    or not exists(select 1 from public.driver_profiles d where d.driver_profile_id=b.current_driver_profile_id
      and d.tenant_id=b.tenant_id and d.status='active') then raise exception 'Trip messages are unavailable'; end if;
  if role_value='rider' and exists(select 1 from public.rider_profiles where rider_profile_id=b.rider_profile_id
    and tenant_id=b.tenant_id and person_id=person_value and rider_profile_id=public.current_rider_profile_id(b.tenant_id))
    then return person_value; end if;
  if role_value='driver' and exists(select 1 from public.driver_profiles where driver_profile_id=b.current_driver_profile_id
    and tenant_id=b.tenant_id and person_id=person_value and driver_profile_id=public.current_driver_profile_id())
    then return person_value; end if;
  raise exception 'Trip messages are unavailable';
end; $$;

create function public.my_trip_messages(booking_value uuid,role_value text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  -- Serializes reads with assignment/lifecycle changes, just like sends.
  perform 1 from public.dispatch_bookings where booking_id=booking_value for share;
  perform public.require_trip_message_access(booking_value,role_value);
  select coalesce(jsonb_agg(jsonb_build_object('messageId',message_id,'senderRole',sender_role,
    'body',body,'sentAt',sent_at) order by sent_at,message_id),'[]'::jsonb) into result from (
    select m.* from public.trip_messages m join public.dispatch_bookings b on b.booking_id=m.booking_id
    where m.booking_id=booking_value and m.tenant_id=b.tenant_id and m.rider_profile_id=b.rider_profile_id
      and m.driver_profile_id=b.current_driver_profile_id order by m.sent_at desc,m.message_id desc limit 100
  ) recent;
  return result;
end; $$;

create function public.send_my_trip_message(booking_value uuid,role_value text,body_value text,request_value uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare b public.dispatch_bookings; actor_value uuid; existing public.trip_messages; new_id uuid;
  recipient_person uuid; recipient_email_value text;
begin
  select * into b from public.dispatch_bookings where booking_id=booking_value for update;
  actor_value:=public.require_trip_message_access(booking_value,role_value);
  if body_value is null or char_length(btrim(body_value)) not between 1 and 1000 or request_value is null
    then raise exception 'Enter a message of 1 to 1000 characters'; end if;
  select * into existing from public.trip_messages where booking_id=booking_value and sender_role=role_value and request_id=request_value;
  if existing.message_id is not null then
    if existing.body<>btrim(body_value) then raise exception 'Retry must contain the same message'; end if;
    return existing.message_id;
  end if;
  if (select count(*) from public.trip_messages where booking_id=booking_value and sender_role=role_value
    and sent_at>now()-interval '10 seconds')>=5 then raise exception 'Please wait before sending another message'; end if;
  insert into public.trip_messages(tenant_id,booking_id,rider_profile_id,driver_profile_id,sender_role,request_id,body)
    values(b.tenant_id,b.booking_id,b.rider_profile_id,b.current_driver_profile_id,role_value,request_value,btrim(body_value))
    returning message_id into new_id;
  if role_value='rider' then
    select person_id,email into recipient_person,recipient_email_value from public.driver_profiles where driver_profile_id=b.current_driver_profile_id;
  else
    select person_id,email into recipient_person,recipient_email_value from public.rider_profiles where rider_profile_id=b.rider_profile_id;
  end if;
  insert into public.notification_outbox(tenant_id,person_id,rider_profile_id,driver_profile_id,notification_type,
    recipient_email,payload,dedupe_key,email_delivery_enabled)
  values(b.tenant_id,recipient_person,case when role_value='driver' then b.rider_profile_id end,
    case when role_value='rider' then b.current_driver_profile_id end,
    case when role_value='driver' then 'rider_trip_message' else 'driver_trip_message' end,
    recipient_email_value,jsonb_build_object('booking_id',b.booking_id,'tenant_slug',
      (select tenant_slug from public.tenant_configurations where tenant_id=b.tenant_id)),
    'trip-message:'||new_id::text,false);
  insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,
    reason,correlation_id,resource_type,resource_id,metadata)
  values(b.tenant_id,'trip.message_sent','person',actor_value,'{}','Participant sent a private trip message.',
    gen_random_uuid(),'dispatch_booking',b.booking_id::text,jsonb_build_object('message_id',new_id,'sender_role',role_value));
  return new_id;
end; $$;

-- Extend the existing constraint without discarding any previously supported event types.
do $$ declare definition text; begin
  select pg_get_constraintdef(oid) into definition from pg_constraint
    where conrelid='public.notification_outbox'::regclass and conname='notification_outbox_type_check';
  if definition is null then raise exception 'Notification type constraint is required'; end if;
  alter table public.notification_outbox drop constraint notification_outbox_type_check;
  execute 'alter table public.notification_outbox add constraint notification_outbox_type_check check (('
    || substring(definition from 7) || ') or notification_type in (''rider_trip_message'',''driver_trip_message''))';
end; $$;

create function public.trip_message_email_mask() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.notification_type in ('rider_trip_message','driver_trip_message') then new.email_delivery_enabled:=false; end if;
  return new;
end; $$;
create trigger notification_trip_message_mask before insert or update on public.notification_outbox
  for each row execute function public.trip_message_email_mask();

create function public.close_trip_messages() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status not in ('accepted','arrived','in_progress') or new.current_driver_profile_id is distinct from old.current_driver_profile_id
    or new.rider_profile_id is distinct from old.rider_profile_id or new.tenant_id is distinct from old.tenant_id then
    update public.notification_outbox set delivery_status='canceled',delivery_error='Trip conversation closed.'
      where tenant_id=old.tenant_id and payload->>'booking_id'=old.booking_id::text
        and notification_type in ('rider_trip_message','driver_trip_message') and delivery_status in ('queued','failed','sending','email_disabled');
    delete from public.trip_messages where booking_id=old.booking_id;
    if found then
      insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,
        reason,correlation_id,resource_type,resource_id,metadata)
      values(old.tenant_id,'trip.messages_closed','platform_system',null,'{}','Trip or assignment ended.',
        gen_random_uuid(),'dispatch_booking',old.booking_id::text,'{}');
    end if;
  end if;
  return new;
end; $$;
create trigger dispatch_close_trip_messages after update of status,current_driver_profile_id,rider_profile_id,tenant_id
  on public.dispatch_bookings for each row execute function public.close_trip_messages();

revoke all on function public.require_trip_message_access(uuid,text),public.my_trip_messages(uuid,text),
  public.send_my_trip_message(uuid,text,text,uuid),public.trip_message_email_mask(),public.close_trip_messages() from public,anon,authenticated;
grant execute on function public.my_trip_messages(uuid,text),public.send_my_trip_message(uuid,text,text,uuid) to authenticated;
