-- Generic support alerts; descriptions and responses never enter the outbox.
do $$ declare definition text; begin
  select pg_get_constraintdef(oid) into definition from pg_constraint
    where conrelid='public.notification_outbox'::regclass and conname='notification_outbox_type_check';
  if definition is null then raise exception 'Notification type constraint is required'; end if;
  alter table public.notification_outbox drop constraint notification_outbox_type_check;
  execute 'alter table public.notification_outbox add constraint notification_outbox_type_check check (('
    || substring(definition from 7) || ') or notification_type = ''rider_support_update'')';
end; $$;

create function public.support_alert_current(notification_value uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.notification_outbox n
    join public.trip_support_cases c on c.case_id::text=n.payload->>'case_id'
      and c.booking_id::text=n.payload->>'booking_id' and c.tenant_id=n.tenant_id and c.rider_profile_id=n.rider_profile_id
    join public.dispatch_bookings b on b.booking_id=c.booking_id and b.tenant_id=c.tenant_id
      and b.rider_profile_id=c.rider_profile_id and b.status in ('completed','cancelled')
    join public.rider_profiles r on r.rider_profile_id=c.rider_profile_id and r.tenant_id=c.tenant_id
      and r.status='active' and r.person_id=n.person_id
    join public.person_profiles p on p.person_id=r.person_id and p.status='active' and p.auth_user_id is not null
    join public.tenants t on t.tenant_id=c.tenant_id and t.status='active'
    where n.notification_id=notification_value and n.notification_type='rider_support_update'
      and n.delivery_status not in ('canceled','cancelled'));
$$;
revoke all on function public.support_alert_current(uuid) from public,anon,authenticated;
grant execute on function public.support_alert_current(uuid) to service_role;

create function public.queue_trip_support_update() returns trigger
language plpgsql security definer set search_path=public as $$
declare c public.trip_support_cases; r public.rider_profiles; email_enabled boolean;
begin
  select * into c from public.trip_support_cases where case_id=new.case_id;
  select * into r from public.rider_profiles where rider_profile_id=c.rider_profile_id
    and tenant_id=c.tenant_id and status='active';
  if r.rider_profile_id is null or not exists(select 1 from public.person_profiles
    where person_id=r.person_id and status='active' and auth_user_id is not null)
    or not exists(select 1 from public.tenants where tenant_id=c.tenant_id and status='active') then return new; end if;
  email_enabled:=public.notification_email_channel_enabled(c.tenant_id,r.rider_profile_id,null,'rider_support_update');
  if not email_enabled and not public.has_device_notification_channel(c.tenant_id,r.rider_profile_id,null) then return new; end if;
  insert into public.notification_outbox(tenant_id,person_id,rider_profile_id,notification_type,
    recipient_email,payload,dedupe_key,email_delivery_enabled)
  values(c.tenant_id,r.person_id,r.rider_profile_id,'rider_support_update',r.email,
    jsonb_build_object('booking_id',c.booking_id,'case_id',c.case_id,'tenant_slug',
      (select tenant_slug from public.tenant_configurations where tenant_id=c.tenant_id)),
    'trip-support:'||c.case_id::text||':'||new.version::text,email_enabled)
  on conflict (dedupe_key) do nothing;
  return new;
end; $$;
revoke all on function public.queue_trip_support_update() from public,anon,authenticated;
create trigger trip_support_update_notification after insert on public.trip_support_updates
  for each row execute function public.queue_trip_support_update();

-- Retain all current preorder, session, expiry and bounded-retry checks.
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
      'expiresAt',attempt.expires_at) || case when notification.notification_type='rider_support_update'
        then jsonb_build_object('bookingId',notification.payload->>'booking_id','caseId',notification.payload->>'case_id') else '{}'::jsonb end);
  end loop;
  return result;
end; $$;


