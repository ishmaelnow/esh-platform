-- Advance reservations are separate from active trips and ordinary timed offers.
create table public.driver_preorder_settings (
  driver_profile_id uuid primary key, tenant_id uuid not null,
  receive_while_offline boolean not null default false,
  updated_at timestamptz not null default now(),
  foreign key (tenant_id,driver_profile_id) references public.driver_profiles(tenant_id,driver_profile_id)
);
create table public.driver_preorder_reservations (
  reservation_id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  booking_id uuid not null, driver_profile_id uuid not null,
  status text not null default 'reserved' check(status in ('reserved','dispatched','released','cancelled')),
  window_start timestamptz not null, window_end timestamptz not null,
  reserved_at timestamptz not null default now(), ended_at timestamptz, reason text,
  check(window_end>window_start),
  check((status='reserved' and ended_at is null) or (status<>'reserved' and ended_at is not null)),
  foreign key (tenant_id,booking_id) references public.dispatch_bookings(tenant_id,booking_id),
  foreign key (tenant_id,driver_profile_id) references public.driver_profiles(tenant_id,driver_profile_id)
);
create unique index driver_preorder_one_reservation on public.driver_preorder_reservations(booking_id) where status='reserved';
create index driver_preorder_driver_windows on public.driver_preorder_reservations(driver_profile_id,window_start) where status='reserved';
alter table public.driver_preorder_settings enable row level security;
alter table public.driver_preorder_reservations enable row level security;
create policy driver_preorder_settings_self on public.driver_preorder_settings for select to authenticated
  using(driver_profile_id=public.current_driver_profile_id());
create policy driver_preorder_reservations_self on public.driver_preorder_reservations for select to authenticated
  using(driver_profile_id=public.current_driver_profile_id());
create policy driver_preorder_reservations_manager on public.driver_preorder_reservations for select to authenticated
  using(public.can_manage_dispatch(tenant_id));
revoke all on public.driver_preorder_settings,public.driver_preorder_reservations from public,anon,authenticated;
grant select on public.driver_preorder_settings,public.driver_preorder_reservations to authenticated;
grant all on public.driver_preorder_settings,public.driver_preorder_reservations to service_role;

create function public.preorder_driver_eligible(driver_value uuid,tenant_value uuid,area_value uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.driver_profiles d join public.tenants t on t.tenant_id=d.tenant_id
    join public.person_profiles p on p.person_id=d.person_id
    join public.driver_availability a on a.driver_profile_id=d.driver_profile_id and a.tenant_id=d.tenant_id
    join public.service_areas s on s.service_area_id=a.selected_service_area_id and s.tenant_id=d.tenant_id
    where d.driver_profile_id=driver_value and d.tenant_id=tenant_value and s.service_area_id=area_value
      and d.status='active' and p.status='active' and t.status='active' and s.status='active'
      and cardinality(public.driver_service_blockers(d.driver_profile_id))=0);
$$;
create function public.require_preorder_driver() returns uuid language plpgsql stable security definer set search_path=public as $$
declare driver_value uuid:=public.current_driver_profile_id();
begin
  if not exists(select 1 from public.driver_profiles d join public.tenants t on t.tenant_id=d.tenant_id
    join public.person_profiles p on p.person_id=d.person_id where d.driver_profile_id=driver_value
      and d.status='active' and p.status='active' and p.auth_user_id=auth.uid() and t.status='active')
    then raise exception 'Active Driver access is required'; end if;
  return driver_value;
end; $$;
create function public.preorder_audit(tenant_value uuid,driver_value uuid,resource_value uuid,event_value text,reason_value text)
returns void language sql security definer set search_path=public as $$
  insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,
    reason,correlation_id,resource_type,resource_id,metadata)
  values(tenant_value,event_value,case when auth.uid() is null then 'platform_system' else 'person' end,
    public.current_person_id(),'{}',reason_value,gen_random_uuid(),
    case when event_value='driver.preorder_settings_updated' then 'driver_profile' else 'dispatch_booking' end,resource_value::text,
    jsonb_strip_nulls(jsonb_build_object('driver_profile_id',driver_value,'receive_while_offline',
      case when event_value='driver.preorder_settings_updated' then (select receive_while_offline
        from public.driver_preorder_settings where driver_profile_id=driver_value) else null end)));
$$;

create function public.my_driver_preorders() returns jsonb language plpgsql security definer set search_path=public as $$
declare driver_value uuid:=public.require_preorder_driver(); tenant_value uuid; result jsonb;
begin
  select tenant_id into tenant_value from public.driver_profiles where driver_profile_id=driver_value;
  perform public.activate_due_scheduled_bookings(tenant_value);
  with assigned as (
    select b.*,r.reservation_id from public.driver_preorder_reservations r
    join public.dispatch_bookings b on b.booking_id=r.booking_id and b.tenant_id=r.tenant_id
    where r.driver_profile_id=driver_value and r.tenant_id=tenant_value and r.status='reserved' and b.status='scheduled'
  ), available as (
    select b.* from public.dispatch_bookings b
    where b.tenant_id=tenant_value and b.status='scheduled' and b.dispatch_ready_at>now()
      and b.price_quote_id is not null and b.final_fare_minor is not null
      and public.preorder_driver_eligible(driver_value,b.tenant_id,b.service_area_id)
      and not exists(select 1 from public.driver_preorder_reservations r where r.booking_id=b.booking_id and r.status='reserved')
      and not exists(select 1 from public.driver_preorder_reservations r where r.driver_profile_id=driver_value and r.status='reserved'
        and tstzrange(r.window_start,r.window_end,'[)') && tstzrange(b.dispatch_ready_at,
          b.scheduled_pickup_at+make_interval(secs=>coalesce(b.route_duration_seconds,3600))+interval '15 minutes','[)'))
  ) select jsonb_build_object(
    'receiveWhileOffline',coalesce((select receive_while_offline from public.driver_preorder_settings where driver_profile_id=driver_value),false),
    'timeZone',(select default_time_zone from public.tenant_configurations where tenant_id=tenant_value),
    'assignedCount',(select count(*) from assigned),'newCount',(select count(*) from available),
    'assigned',coalesce((select jsonb_agg(jsonb_build_object('bookingId',b.booking_id,'reservationId',b.reservation_id,
      'scheduledPickupAt',b.scheduled_pickup_at,'dispatchReadyAt',b.dispatch_ready_at,'pickupAddress',b.pickup_address,
      'destinationAddress',b.destination_address,'serviceAreaName',s.name,'fareAmountMinor',b.final_fare_minor,
      'fareCurrencyCode',b.fare_currency_code) order by b.scheduled_pickup_at)
      from (select * from assigned order by scheduled_pickup_at limit 100) b join public.service_areas s on s.service_area_id=b.service_area_id),'[]'::jsonb),
    'new',coalesce((select jsonb_agg(jsonb_build_object('bookingId',b.booking_id,'scheduledPickupAt',b.scheduled_pickup_at,
      'dispatchReadyAt',b.dispatch_ready_at,'serviceAreaName',s.name,'fareAmountMinor',b.final_fare_minor,
      'fareCurrencyCode',b.fare_currency_code) order by b.scheduled_pickup_at)
      from (select * from available order by scheduled_pickup_at limit 100) b join public.service_areas s on s.service_area_id=b.service_area_id),'[]'::jsonb)
  ) into result;
  return result;
end; $$;
create function public.set_my_driver_preorder_settings(enabled_value boolean) returns boolean
language plpgsql security definer set search_path=public as $$
declare driver_value uuid:=public.require_preorder_driver(); tenant_value uuid;
begin
  if enabled_value is null then raise exception 'Choose an offline alert preference'; end if;
  select tenant_id into tenant_value from public.driver_profiles where driver_profile_id=driver_value;
  insert into public.driver_preorder_settings(driver_profile_id,tenant_id,receive_while_offline)
    values(driver_value,tenant_value,enabled_value) on conflict(driver_profile_id) do update
    set receive_while_offline=excluded.receive_while_offline,updated_at=now();
  perform public.preorder_audit(tenant_value,driver_value,driver_value,'driver.preorder_settings_updated','Driver updated offline preorder alerts.');
  return enabled_value;
end; $$;
create function public.reserve_my_driver_preorder(booking_value uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare driver_value uuid:=public.require_preorder_driver(); b public.dispatch_bookings; r public.driver_preorder_reservations;
  end_value timestamptz; new_id uuid;
begin
  select * into b from public.dispatch_bookings where booking_id=booking_value for update;
  -- Serialize reservations for this Driver across different bookings, then check ranges.
  perform 1 from public.driver_profiles where driver_profile_id=driver_value for update;
  if b.booking_id is null or b.status<>'scheduled' or b.dispatch_ready_at<=now()
    or b.price_quote_id is null or b.final_fare_minor is null
    or not public.preorder_driver_eligible(driver_value,b.tenant_id,b.service_area_id)
    then raise exception 'This preorder is no longer available to you'; end if;
  select * into r from public.driver_preorder_reservations where booking_id=booking_value and status='reserved';
  if r.driver_profile_id=driver_value then return r.reservation_id; end if;
  if r.reservation_id is not null then raise exception 'Another Driver reserved this preorder'; end if;
  end_value:=b.scheduled_pickup_at+make_interval(secs=>coalesce(b.route_duration_seconds,3600))+interval '15 minutes';
  if exists(select 1 from public.driver_preorder_reservations where driver_profile_id=driver_value and status='reserved'
    and tstzrange(window_start,window_end,'[)') && tstzrange(b.dispatch_ready_at,end_value,'[)'))
    then raise exception 'This preorder overlaps one of your reserved trips'; end if;
  insert into public.driver_preorder_reservations(tenant_id,booking_id,driver_profile_id,window_start,window_end)
    values(b.tenant_id,booking_value,driver_value,b.dispatch_ready_at,end_value) returning reservation_id into new_id;
  perform public.preorder_audit(b.tenant_id,driver_value,booking_value,'driver.preorder_reserved','Driver reserved a future trip.');
  return new_id;
end; $$;
create function public.release_my_driver_preorder(booking_value uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare driver_value uuid:=public.require_preorder_driver(); b public.dispatch_bookings;
begin
  select * into b from public.dispatch_bookings where booking_id=booking_value for update;
  if not exists(select 1 from public.driver_preorder_reservations where booking_id=booking_value and driver_profile_id=driver_value and status='reserved')
    then raise exception 'Your reserved preorder is unavailable'; end if;
  if b.status<>'scheduled' then raise exception 'Dispatch has started. Use the current offer controls'; end if;
  update public.driver_preorder_reservations set status='released',ended_at=now(),reason='Released by Driver.'
    where booking_id=booking_value and driver_profile_id=driver_value and status='reserved';
  perform public.preorder_audit(b.tenant_id,driver_value,booking_value,'driver.preorder_released','Driver released a future reservation.');
  return true;
end; $$;

-- Alphabetically before existing automatic matching. Normal dispatch sees the pending priority offer.
create function public.dispatch_reserved_preorder() returns trigger
language plpgsql security definer set search_path=public as $$
declare r public.driver_preorder_reservations; vehicle_value uuid; seconds_value integer;
begin
  if old.status='scheduled' and new.status='requested' then
    select * into r from public.driver_preorder_reservations where booking_id=new.booking_id and status='reserved' for update;
    if r.reservation_id is null then return new; end if;
    perform 1 from public.driver_profiles where driver_profile_id=r.driver_profile_id for update;
    perform 1 from public.driver_availability where driver_profile_id=r.driver_profile_id for update;
    if public.preorder_driver_eligible(r.driver_profile_id,new.tenant_id,new.service_area_id)
      and exists(select 1 from public.driver_availability where driver_profile_id=r.driver_profile_id and requested_status='online')
      and not exists(select 1 from public.dispatch_bookings where current_driver_profile_id=r.driver_profile_id and status in ('accepted','arrived','in_progress'))
      and not exists(select 1 from public.dispatch_offers where driver_profile_id=r.driver_profile_id and status='pending' and expires_at>now()) then
      select vehicle_id into vehicle_value from public.driver_vehicle_assignments where tenant_id=new.tenant_id
        and driver_profile_id=r.driver_profile_id and ended_at is null limit 1;
    end if;
    if vehicle_value is not null then
      select offer_duration_seconds into seconds_value from public.tenant_matching_settings where tenant_id=new.tenant_id;
      update public.driver_preorder_reservations set status='dispatched',ended_at=now(),reason='Priority timed offer created.' where reservation_id=r.reservation_id;
      insert into public.dispatch_offers(tenant_id,booking_id,driver_profile_id,vehicle_id,offered_by_person_id,offer_source,expires_at)
        values(new.tenant_id,new.booking_id,r.driver_profile_id,vehicle_value,null,'automatic',now()+make_interval(secs=>coalesce(seconds_value,90)));
      update public.dispatch_bookings set status='offered' where booking_id=new.booking_id;
      perform public.preorder_audit(new.tenant_id,r.driver_profile_id,new.booking_id,'driver.preorder_dispatched','Reserved Driver received a normal timed offer.');
    else
      update public.driver_preorder_reservations set status='released',ended_at=now(),reason='Unavailable or ineligible at dispatch time.' where reservation_id=r.reservation_id;
      perform public.preorder_audit(new.tenant_id,r.driver_profile_id,new.booking_id,'driver.preorder_fallback','Reserved Driver unavailable; normal dispatch continues.');
    end if;
  elsif new.status<>'scheduled' then
    for r in select * from public.driver_preorder_reservations where booking_id=new.booking_id and status='reserved' for update loop
      update public.driver_preorder_reservations set status='cancelled',ended_at=now(),reason='Booking left the scheduled state.' where reservation_id=r.reservation_id;
      perform public.preorder_audit(new.tenant_id,r.driver_profile_id,new.booking_id,'driver.preorder_cancelled','Future reservation ended with its booking.');
    end loop;
  end if;
  return new;
end; $$;
create trigger dispatch_bookings_00_preorder after update of status on public.dispatch_bookings
  for each row when (old.status is distinct from new.status) execute function public.dispatch_reserved_preorder();

alter table public.notification_outbox drop constraint notification_outbox_type_check;
alter table public.notification_outbox add constraint notification_outbox_type_check check(notification_type in (
  'driver_account_ready','driver_evidence_approved','driver_evidence_rejected',
  'driver_evidence_expiring_30d','driver_evidence_expiring_7d','driver_evidence_expired','driver_activated',
  'vehicle_evidence_approved','vehicle_evidence_rejected','vehicle_evidence_expiring_30d',
  'vehicle_evidence_expiring_7d','vehicle_evidence_expired','dispatch_offer_created',
  'rider_booking_created','rider_dispatch_searching','rider_driver_accepted','rider_driver_arrived',
  'rider_trip_started','rider_trip_completed','rider_booking_cancelled','rider_booking_scheduled',
  'rider_scheduled_reminder','rider_scheduled_dispatch_started','rider_payment_succeeded','rider_refund_succeeded',
  'rider_recurring_autopay_succeeded','rider_recurring_autopay_failed','driver_earnings_recorded',
  'driver_transfer_succeeded','driver_bank_payout_created','driver_bank_payout_paid','driver_bank_payout_failed',
  'community_membership_approved','driver_preorder_available','driver_preorder_update'));

create function public.preorder_alert_current(notification_value uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.notification_outbox n where n.notification_id=notification_value
    and (n.notification_type<>'driver_preorder_available' or exists(
      select 1 from public.dispatch_bookings b join public.driver_availability a on a.driver_profile_id=n.driver_profile_id
      left join public.driver_preorder_settings s on s.driver_profile_id=n.driver_profile_id
      where b.booking_id::text=n.payload->>'booking_id' and b.tenant_id=n.tenant_id and b.status='scheduled'
        and b.dispatch_ready_at>now() and public.preorder_driver_eligible(n.driver_profile_id,b.tenant_id,b.service_area_id)
        and (a.requested_status='online' or coalesce(s.receive_while_offline,false))
        and not exists(select 1 from public.driver_preorder_reservations r where r.booking_id=b.booking_id and r.status='reserved')
        and not exists(select 1 from public.driver_preorder_reservations r where r.driver_profile_id=n.driver_profile_id and r.status='reserved'
          and tstzrange(r.window_start,r.window_end,'[)') && tstzrange(b.dispatch_ready_at,
            b.scheduled_pickup_at+make_interval(secs=>coalesce(b.route_duration_seconds,3600))+interval '15 minutes','[)')))));
$$;
create function public.mask_preorder_email() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.notification_type in ('driver_preorder_available','driver_preorder_update') then
    new.email_delivery_enabled:=new.email_delivery_enabled and coalesce((select trip_email_enabled
      from public.driver_notification_preferences where driver_profile_id=new.driver_profile_id and tenant_id=new.tenant_id),true);
  end if;
  return new;
end; $$;
create trigger notification_preorder_email before insert or update on public.notification_outbox
  for each row execute function public.mask_preorder_email();

create function public.queue_preorder_availability(booking_value uuid,exclude_driver uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare b public.dispatch_bookings; generation_value text;
begin
  select * into b from public.dispatch_bookings where booking_id=booking_value;
  if b.status<>'scheduled' or b.dispatch_ready_at<=now() or b.price_quote_id is null or b.final_fare_minor is null
    or exists(select 1 from public.driver_preorder_reservations where booking_id=booking_value and status='reserved') then return; end if;
  select coalesce(max(reserved_at)::text,'initial') into generation_value from public.driver_preorder_reservations where booking_id=booking_value;
  insert into public.notification_outbox(tenant_id,driver_profile_id,person_id,notification_type,recipient_email,payload,dedupe_key)
  select b.tenant_id,d.driver_profile_id,d.person_id,'driver_preorder_available',d.email,
    jsonb_build_object('booking_id',b.booking_id,'scheduled_pickup_at',b.scheduled_pickup_at),
    'preorder:'||b.booking_id::text||':'||generation_value||':'||d.driver_profile_id::text
  from public.driver_profiles d join public.driver_availability a on a.driver_profile_id=d.driver_profile_id
  left join public.driver_preorder_settings s on s.driver_profile_id=d.driver_profile_id
  left join public.driver_notification_preferences p on p.driver_profile_id=d.driver_profile_id
  where d.tenant_id=b.tenant_id and d.email is not null and d.driver_profile_id is distinct from exclude_driver
    and public.preorder_driver_eligible(d.driver_profile_id,b.tenant_id,b.service_area_id)
    and (a.requested_status='online' or coalesce(s.receive_while_offline,false))
    and not exists(select 1 from public.driver_preorder_reservations r where r.driver_profile_id=d.driver_profile_id and r.status='reserved'
      and tstzrange(r.window_start,r.window_end,'[)') && tstzrange(b.dispatch_ready_at,
        b.scheduled_pickup_at+make_interval(secs=>coalesce(b.route_duration_seconds,3600))+interval '15 minutes','[)'))
    and (coalesce(p.trip_email_enabled,true) or public.has_device_notification_channel(b.tenant_id,null,d.driver_profile_id))
  on conflict(dedupe_key) do nothing;
end; $$;
create function public.preorder_booking_notifications() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='scheduled' then perform public.queue_preorder_availability(new.booking_id); end if;
  return new;
end; $$;
create trigger dispatch_bookings_preorder_available after insert or update of price_quote_id on public.dispatch_bookings
  for each row execute function public.preorder_booking_notifications();
create function public.preorder_reservation_notifications() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.notification_outbox(tenant_id,driver_profile_id,person_id,notification_type,recipient_email,payload,dedupe_key)
    select new.tenant_id,d.driver_profile_id,d.person_id,'driver_preorder_update',d.email,
      jsonb_build_object('booking_id',new.booking_id,'reservation_status',new.status),
      'preorder_reservation:'||new.reservation_id::text||':'||new.status
    from public.driver_profiles d where d.driver_profile_id=new.driver_profile_id and d.email is not null
      and (coalesce((select trip_email_enabled from public.driver_notification_preferences where driver_profile_id=d.driver_profile_id),true)
        or public.has_device_notification_channel(new.tenant_id,null,d.driver_profile_id)) on conflict(dedupe_key) do nothing;
  if new.status='released' then perform public.queue_preorder_availability(new.booking_id,new.driver_profile_id); end if;
  return new;
end; $$;
create trigger preorder_reservation_notifications after insert or update of status on public.driver_preorder_reservations
  for each row execute function public.preorder_reservation_notifications();

create function public.admin_driver_preorders(tenant_value uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.can_manage_dispatch(tenant_value) then raise exception 'Dispatch management permission is required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('bookingId',r.booking_id,'driverName',d.display_name,
    'status',r.status,'reason',r.reason,'reservedAt',r.reserved_at) order by r.reserved_at desc)
    from (select * from public.driver_preorder_reservations where tenant_id=tenant_value order by reserved_at desc limit 100) r
    join public.driver_profiles d on d.driver_profile_id=r.driver_profile_id),'[]'::jsonb);
end; $$;

revoke all on function public.preorder_driver_eligible(uuid,uuid,uuid),public.require_preorder_driver(),
  public.preorder_audit(uuid,uuid,uuid,text,text),public.my_driver_preorders(),public.set_my_driver_preorder_settings(boolean),
  public.reserve_my_driver_preorder(uuid),public.release_my_driver_preorder(uuid),public.dispatch_reserved_preorder(),
  public.preorder_alert_current(uuid),public.mask_preorder_email(),public.queue_preorder_availability(uuid,uuid),
  public.preorder_booking_notifications(),public.preorder_reservation_notifications(),public.admin_driver_preorders(uuid)
  from public,anon,authenticated;
grant execute on function public.my_driver_preorders(),public.set_my_driver_preorder_settings(boolean),
  public.reserve_my_driver_preorder(uuid),public.release_my_driver_preorder(uuid),public.admin_driver_preorders(uuid) to authenticated;
grant execute on function public.preorder_alert_current(uuid) to service_role;

-- Preserve existing bounded native claims; suppress unavailable preorder alerts at claim time.
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
      'expiresAt',attempt.expires_at));
  end loop;
  return result;
end; $$;
