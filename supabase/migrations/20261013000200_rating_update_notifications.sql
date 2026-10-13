-- Generic participant alerts. No backfill, score/comment/decision-note payloads or disclosure changes.
do $$ declare definition text; begin
  select pg_get_constraintdef(oid) into definition from pg_constraint
    where conrelid='public.notification_outbox'::regclass and conname='notification_outbox_type_check';
  if definition is null then raise exception 'Notification type constraint is required'; end if;
  alter table public.notification_outbox drop constraint notification_outbox_type_check;
  execute 'alter table public.notification_outbox add constraint notification_outbox_type_check check (('
    || substring(definition from 7) || ') or notification_type in (''rider_rating_received'',''driver_rating_received'',
      ''rider_rating_reviewed'',''driver_rating_reviewed''))';
end; $$;

-- Extend the current definitions with guarded anchors; retain every existing preference/session/
-- offer/preorder/support/reminder/claim/retry check rather than forking that logic.
do $$ declare definition text; signature text; anchor text;
begin
  signature:='public.notification_email_channel_enabled(uuid,uuid,uuid,text)';
  definition:=pg_get_functiondef(signature::regprocedure);
  anchor:='''driver_support_update'',''driver_rating_reminder''';
  if strpos(definition,anchor)=0 then raise exception 'Expected Driver trip email gate missing'; end if;
  execute replace(definition,anchor,anchor||',''driver_rating_received'',''driver_rating_reviewed''');

  signature:='public.queue_native_push_attempts()';
  definition:=pg_get_functiondef(signature::regprocedure);
  anchor:='''rider_rating_reminder'',''driver_rating_reminder''';
  if strpos(definition,anchor)=0 then raise exception 'Expected native rating expiry missing'; end if;
  execute replace(definition,anchor,anchor||',''rider_rating_received'',''driver_rating_received'',''rider_rating_reviewed'',''driver_rating_reviewed''');
end; $$;

create function public.reputation_alert_current(notification_value uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.notification_outbox n
    join public.dispatch_bookings b on b.booking_id::text=n.payload->>'booking_id' and b.tenant_id=n.tenant_id
    join public.tenants t on t.tenant_id=b.tenant_id and t.status='active'
    join public.person_profiles p on p.person_id=n.person_id and p.status='active' and p.auth_user_id is not null
    where n.notification_id=notification_value
      and n.notification_type in ('rider_rating_received','driver_rating_received','rider_rating_reviewed','driver_rating_reviewed')
      and n.delivery_status not in ('canceled','cancelled')
      and n.available_at<=now() and now()<n.available_at+interval '24 hours'
      and b.status='completed' and b.completed_at<=now()
      and ((n.notification_type like 'rider_%' and n.driver_profile_id is null and n.rider_profile_id=b.rider_profile_id
        and exists(select 1 from public.rider_profiles r where r.rider_profile_id=b.rider_profile_id
          and r.tenant_id=b.tenant_id and r.person_id=p.person_id and r.status='active'))
        or (n.notification_type like 'driver_%' and n.rider_profile_id is null and n.driver_profile_id=b.current_driver_profile_id
        and exists(select 1 from public.driver_profiles d where d.driver_profile_id=b.current_driver_profile_id
          and d.tenant_id=b.tenant_id and d.person_id=p.person_id and d.status='active')))
      and (case when n.notification_type like '%_rating_received' then exists(
        select 1 from public.trip_ratings r where r.rating_id::text=n.payload->>'rating_id'
          and r.tenant_id=b.tenant_id and r.booking_id=b.booking_id and r.moderation_status='visible'
          and ((n.rider_profile_id is not null and r.reviewer_type='driver' and r.subject_rider_profile_id=n.rider_profile_id)
            or (n.driver_profile_id is not null and r.reviewer_type='rider' and r.subject_driver_profile_id=n.driver_profile_id))
          and (b.completed_at<=now()-interval '7 days' or exists(select 1 from public.trip_ratings own
            where own.tenant_id=b.tenant_id and own.booking_id=b.booking_id
              and own.reviewer_type=case when n.rider_profile_id is not null then 'rider' else 'driver' end)))
      else exists(select 1 from public.trip_rating_appeals a join public.trip_ratings r
          on r.rating_id=a.rating_id and r.tenant_id=a.tenant_id and r.booking_id=a.booking_id
        where a.rating_appeal_id::text=n.payload->>'appeal_id' and a.tenant_id=b.tenant_id and a.booking_id=b.booking_id
          and a.appellant_person_id=p.person_id and a.status in ('upheld','removed') and a.resolved_at<=now()
          and ((n.rider_profile_id is not null and a.appellant_type='rider' and r.subject_rider_profile_id=n.rider_profile_id)
            or (n.driver_profile_id is not null and a.appellant_type='driver' and r.subject_driver_profile_id=n.driver_profile_id))) end));
$$;
revoke all on function public.reputation_alert_current(uuid) from public,anon,authenticated;
grant execute on function public.reputation_alert_current(uuid) to service_role;

create function public.queue_rating_update(booking_value uuid,role_value text,kind_value text,
  source_value uuid,available_value timestamptz,person_value uuid default null) returns void
language plpgsql security definer set search_path=public as $$
declare b public.dispatch_bookings; recipient record; email_enabled boolean; type_value text; event_id uuid;
begin
  if role_value not in ('rider','driver') or kind_value not in ('received','reviewed') then return; end if;
  select * into b from public.dispatch_bookings where booking_id=booking_value;
  if b.status is distinct from 'completed' or b.completed_at is null or b.completed_at>now()
    or not exists(select 1 from public.tenants where tenant_id=b.tenant_id and status='active') then return; end if;
  select * into recipient from (
    select r.person_id,r.email,r.rider_profile_id,null::uuid as driver_profile_id from public.rider_profiles r
      where role_value='rider' and r.tenant_id=b.tenant_id and r.rider_profile_id=b.rider_profile_id and r.status='active'
    union all select d.person_id,d.email,null::uuid,d.driver_profile_id from public.driver_profiles d
      where role_value='driver' and d.tenant_id=b.tenant_id and d.driver_profile_id=b.current_driver_profile_id and d.status='active'
  ) profiles;
  if recipient.person_id is null or (person_value is not null and person_value<>recipient.person_id)
    or nullif(btrim(recipient.email),'') is null
    or not exists(select 1 from public.person_profiles where person_id=recipient.person_id and status='active' and auth_user_id is not null)
    then return; end if;
  type_value:=role_value||'_rating_'||kind_value;
  email_enabled:=public.notification_email_channel_enabled(b.tenant_id,recipient.rider_profile_id,recipient.driver_profile_id,type_value);
  if not email_enabled and not public.has_device_notification_channel(b.tenant_id,recipient.rider_profile_id,recipient.driver_profile_id)
    then return; end if;
  insert into public.notification_outbox(tenant_id,person_id,rider_profile_id,driver_profile_id,notification_type,
    recipient_email,payload,dedupe_key,email_delivery_enabled,available_at)
  values(b.tenant_id,recipient.person_id,recipient.rider_profile_id,recipient.driver_profile_id,type_value,recipient.email,
    jsonb_build_object('booking_id',b.booking_id,'tenant_slug',(select tenant_slug from public.tenant_configurations where tenant_id=b.tenant_id))
      || case kind_value when 'received' then jsonb_build_object('rating_id',source_value) else jsonb_build_object('appeal_id',source_value) end,
    'rating-update:'||kind_value||':'||source_value::text||':'||role_value,email_enabled,available_value)
  on conflict(dedupe_key) do update set available_at=least(notification_outbox.available_at,excluded.available_at)
    where notification_outbox.delivery_status in ('queued','failed')
  returning notification_id into event_id;
  -- Mutual submission can bring a previously seven-day-delayed native event forward.
  update public.native_push_attempts a set next_attempt_at=n.available_at,expires_at=n.available_at+interval '24 hours'
    from public.notification_outbox n where n.notification_id=event_id and a.notification_id=n.notification_id
      and a.status in ('pending','failed') and a.attempt_count=0;
end; $$;
revoke all on function public.queue_rating_update(uuid,text,text,uuid,timestamptz,uuid) from public,anon,authenticated;

create function public.queue_received_rating_updates() returns trigger
language plpgsql security definer set search_path=public as $$
declare b public.dispatch_bookings; r public.trip_ratings; role_value text; due timestamptz;
begin
  select * into b from public.dispatch_bookings where booking_id=new.booking_id and tenant_id=new.tenant_id for update;
  -- Public submission RPCs already serialize on this booking. No old-rating migration backfill.
  for r in select * from public.trip_ratings where booking_id=b.booking_id and tenant_id=b.tenant_id and moderation_status='visible'
  loop
    role_value:=case r.reviewer_type when 'rider' then 'driver' else 'rider' end;
    if (role_value='driver' and r.subject_driver_profile_id is distinct from b.current_driver_profile_id)
      or (role_value='rider' and r.subject_rider_profile_id is distinct from b.rider_profile_id) then continue; end if;
    due:=case when exists(select 1 from public.trip_ratings own where own.tenant_id=b.tenant_id
      and own.booking_id=b.booking_id and own.reviewer_type=role_value) then now()
      else greatest(now(),b.completed_at+interval '7 days') end;
    perform public.queue_rating_update(b.booking_id,role_value,'received',r.rating_id,due);
  end loop;
  return new;
end; $$;
revoke all on function public.queue_received_rating_updates() from public,anon,authenticated;
create trigger trip_rating_received_updates after insert on public.trip_ratings
  for each row execute function public.queue_received_rating_updates();

create function public.queue_rating_review_decision() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if old.status='submitted' and new.status in ('upheld','removed') and new.resolved_at is not null then
    perform public.queue_rating_update(new.booking_id,new.appellant_type,'reviewed',new.rating_appeal_id,now(),new.appellant_person_id);
  end if;
  return new;
end; $$;
revoke all on function public.queue_rating_review_decision() from public,anon,authenticated;
create trigger trip_rating_review_decision after update of status on public.trip_rating_appeals
  for each row execute function public.queue_rating_review_decision();

do $$ declare definition text; anchor text; expanded text;
begin
  definition:=pg_get_functiondef('public.claim_native_push_attempts(uuid,uuid,integer,text[])'::regprocedure);
  anchor:='      or (notification.notification_type=''driver_support_update''';
  if strpos(definition,anchor)=0 then raise exception 'Expected native recipient guard missing'; end if;
  definition:=replace(definition,anchor,'      or (notification.notification_type in (''rider_rating_received'',''driver_rating_received'',''rider_rating_reviewed'',''driver_rating_reviewed'') and not public.reputation_alert_current(notification.notification_id))'
    || E'\n' || anchor);
  anchor:='case when notification.notification_type in (''rider_rating_reminder'',''driver_rating_reminder'')';
  expanded:='case when notification.notification_type in (''rider_rating_reminder'',''driver_rating_reminder'',''rider_rating_received'',''driver_rating_received'',''rider_rating_reviewed'',''driver_rating_reviewed'')';
  if strpos(definition,anchor)=0 then raise exception 'Expected native exact-trip projection missing'; end if;
  execute replace(definition,anchor,expanded);
end; $$;
