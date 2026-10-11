-- One non-urgent reminder for each participant in newly completed trips; no backfill.
do $$ declare definition text; begin
  select pg_get_constraintdef(oid) into definition from pg_constraint
    where conrelid='public.notification_outbox'::regclass and conname='notification_outbox_type_check';
  if definition is null then raise exception 'Notification type constraint is required'; end if;
  alter table public.notification_outbox drop constraint notification_outbox_type_check;
  execute 'alter table public.notification_outbox add constraint notification_outbox_type_check check (('
    || substring(definition from 7) || ') or notification_type in (''rider_rating_reminder'',''driver_rating_reminder''))';
end; $$;

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
    when driver_value is not null and type_value in ('dispatch_offer_created','driver_support_update','driver_rating_reminder') then
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

create function public.rating_alert_current(notification_value uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.notification_outbox n
    join public.dispatch_bookings b on b.booking_id::text=n.payload->>'booking_id' and b.tenant_id=n.tenant_id
    join public.tenants t on t.tenant_id=b.tenant_id and t.status='active'
    join public.person_profiles p on p.person_id=n.person_id and p.status='active' and p.auth_user_id is not null
    where n.notification_id=notification_value and n.notification_type in ('rider_rating_reminder','driver_rating_reminder')
      and n.delivery_status not in ('canceled','cancelled')
      and n.available_at<=now() and now()<n.available_at+interval '24 hours'
      and b.status='completed' and b.completed_at<=now() and b.completed_at>=now()-interval '30 days'
      and b.rider_profile_id is not null and b.current_driver_profile_id is not null
      and ((n.notification_type='rider_rating_reminder' and n.driver_profile_id is null and n.rider_profile_id=b.rider_profile_id
        and exists(select 1 from public.rider_profiles r where r.rider_profile_id=b.rider_profile_id
          and r.tenant_id=b.tenant_id and r.person_id=p.person_id and r.status='active'))
        or (n.notification_type='driver_rating_reminder' and n.rider_profile_id is null and n.driver_profile_id=b.current_driver_profile_id
        and exists(select 1 from public.driver_profiles d where d.driver_profile_id=b.current_driver_profile_id
          and d.tenant_id=b.tenant_id and d.person_id=p.person_id and d.status='active')))
      and not exists(select 1 from public.trip_ratings r where r.booking_id=b.booking_id
        and r.tenant_id=b.tenant_id and r.reviewer_type=case n.notification_type when 'rider_rating_reminder' then 'rider' else 'driver' end));
$$;
revoke all on function public.rating_alert_current(uuid) from public,anon,authenticated;
grant execute on function public.rating_alert_current(uuid) to service_role;

create function public.queue_trip_rating_reminders() returns trigger
language plpgsql security definer set search_path=public as $$
declare recipient record; email_enabled boolean; type_value text;
begin
  if new.status<>'completed' or old.status is not distinct from new.status or new.completed_at is null
    or new.rider_profile_id is null or new.current_driver_profile_id is null
    or new.completed_at<now()-interval '5 minutes' or new.completed_at>now()
    or not exists(select 1 from public.tenants where tenant_id=new.tenant_id and status='active') then return new; end if;
  for recipient in
    select 'rider' as product,r.person_id,r.email,r.rider_profile_id,null::uuid as driver_profile_id
      from public.rider_profiles r where r.rider_profile_id=new.rider_profile_id and r.tenant_id=new.tenant_id and r.status='active'
    union all
    select 'driver',d.person_id,d.email,null::uuid,d.driver_profile_id
      from public.driver_profiles d where d.driver_profile_id=new.current_driver_profile_id and d.tenant_id=new.tenant_id and d.status='active'
  loop
    if nullif(btrim(recipient.email),'') is null then continue; end if;
    if not exists(select 1 from public.person_profiles where person_id=recipient.person_id and status='active' and auth_user_id is not null)
      or exists(select 1 from public.trip_ratings where booking_id=new.booking_id and tenant_id=new.tenant_id and reviewer_type=recipient.product)
      then continue; end if;
    type_value:=recipient.product||'_rating_reminder';
    email_enabled:=public.notification_email_channel_enabled(new.tenant_id,recipient.rider_profile_id,recipient.driver_profile_id,type_value);
    if not email_enabled and not public.has_device_notification_channel(new.tenant_id,recipient.rider_profile_id,recipient.driver_profile_id)
      then continue; end if;
    insert into public.notification_outbox(tenant_id,person_id,rider_profile_id,driver_profile_id,notification_type,
      recipient_email,payload,dedupe_key,email_delivery_enabled,available_at)
    values(new.tenant_id,recipient.person_id,recipient.rider_profile_id,recipient.driver_profile_id,type_value,
      recipient.email,jsonb_build_object('booking_id',new.booking_id,'tenant_slug',
        (select tenant_slug from public.tenant_configurations where tenant_id=new.tenant_id)),
      'trip-rating:'||new.booking_id::text||':'||recipient.product,email_enabled,now()+interval '10 minutes')
    on conflict(dedupe_key) do nothing;
  end loop;
  return new;
end; $$;
revoke all on function public.queue_trip_rating_reminders() from public,anon,authenticated;
create trigger dispatch_booking_rating_reminders after update of status on public.dispatch_bookings
  for each row execute function public.queue_trip_rating_reminders();

create function public.cancel_submitted_rating_reminder() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update public.notification_outbox set delivery_status='canceled'
    where tenant_id=new.tenant_id and dedupe_key='trip-rating:'||new.booking_id::text||':'||new.reviewer_type
      and delivery_status in ('queued','failed','sending','email_disabled');
  update public.native_push_attempts a set status='expired',claim_id=null,failure_code='rating_submitted'
    from public.notification_outbox n where n.notification_id=a.notification_id and n.tenant_id=new.tenant_id
      and n.dedupe_key='trip-rating:'||new.booking_id::text||':'||new.reviewer_type
      and a.status in ('pending','failed','sending');
  return new;
end; $$;
revoke all on function public.cancel_submitted_rating_reminder() from public,anon,authenticated;
create trigger trip_rating_cancel_reminder after insert on public.trip_ratings
  for each row execute function public.cancel_submitted_rating_reminder();

create or replace function public.queue_native_push_attempts() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.rider_profile_id is null and new.driver_profile_id is null then return new; end if;
  insert into public.native_push_attempts(tenant_id,notification_id,registration_id,expires_at,next_attempt_at)
  select new.tenant_id,new.notification_id,r.registration_id,
    case when new.notification_type='dispatch_offer_created' then coalesce(
      (select o.expires_at from public.dispatch_offers o where o.offer_id::text=new.payload->>'offer_id'
        and o.tenant_id=new.tenant_id and o.driver_profile_id=new.driver_profile_id),now())
      when new.notification_type in ('rider_rating_reminder','driver_rating_reminder') then new.available_at+interval '24 hours'
      else greatest(now(),new.available_at)+interval '15 minutes' end,
    greatest(now(),new.available_at)
  from public.native_push_registrations r where r.tenant_id=new.tenant_id and r.status='active'
    and ((r.product='rider' and r.rider_profile_id=new.rider_profile_id)
      or (r.product='driver' and new.rider_profile_id is null and r.driver_profile_id=new.driver_profile_id))
  on conflict do nothing;
  return new;
end; $$;

-- Preserve session, ownership, preorder, support, expiry and retry checks.
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
      or (notification.notification_type in ('rider_rating_reminder','driver_rating_reminder') and not public.rating_alert_current(notification.notification_id))
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
        then jsonb_build_object('bookingId',notification.payload->>'booking_id','caseId',notification.payload->>'case_id') else '{}'::jsonb end || case when notification.notification_type in ('rider_rating_reminder','driver_rating_reminder')
        then jsonb_build_object('bookingId',notification.payload->>'booking_id') else '{}'::jsonb end);
  end loop;
  return result;
end; $$;

