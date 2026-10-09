-- Disposable database only. No notifications leave the test database.
begin;
create function pg_temp.channel_assert(label text,condition boolean) returns void language plpgsql as $$
begin if condition is not true then raise exception 'Channel assertion failed: %',label; end if; end; $$;
select pg_temp.channel_assert('Legacy opt-out preserved',not trip_email_enabled and not payment_email_enabled and not trip_updates_enabled)
  from public.rider_notification_preferences;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"session_id":"60000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select public.set_my_native_push('rider','70000000-0000-4000-8000-000000000001','ios',true,repeat('a',64),'channel-test','20000000-0000-4000-8000-000000000001');
select pg_temp.channel_assert('Getter reports EMAIL off with mobile on',
  (public.my_rider_notification_preferences('channel-test')->>'tripUpdatesEnabled')::boolean=false);
select public.set_my_rider_notification_preferences('channel-test',false);
reset role;
select pg_temp.channel_assert('Event enabled, email remains off',trip_updates_enabled and not trip_email_enabled)
  from public.rider_notification_preferences;
insert into public.notification_outbox(tenant_id,rider_profile_id,notification_type,recipient_email,payload,dedupe_key)
  values('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','rider_driver_arrived','channel-test@example.invalid','{}','channel-arrived');
select pg_temp.channel_assert('Mobile-only event queued once, email masked',count(*)=1 and bool_and(not email_delivery_enabled))
  from public.notification_outbox where dedupe_key='channel-arrived';
select pg_temp.channel_assert('One native attempt',count(*)=1) from public.native_push_attempts;
set local role authenticated;
select public.set_my_rider_notification_preferences('channel-test',true);
select public.set_my_rider_notification_preferences('channel-test',false);
reset role;
select pg_temp.channel_assert('No native cancellation on email disable',delivery_status='queued' and not email_delivery_enabled)
  from public.notification_outbox where dedupe_key='channel-arrived';
update public.notification_outbox set delivery_status='email_disabled' where dedupe_key='channel-arrived';
set local role service_role;
select pg_temp.channel_assert('Native claims despite skipped email',jsonb_array_length(public.claim_native_push_attempts())=1);
reset role;
set local role authenticated;
select public.set_my_native_push('rider','70000000-0000-4000-8000-000000000001','ios',false,null,'channel-test','20000000-0000-4000-8000-000000000001');
reset role;
select pg_temp.channel_assert('Neither channel means event gate off',not trip_updates_enabled) from public.rider_notification_preferences;
insert into public.push_subscriptions(tenant_id,rider_profile_id,status) values('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','active');
select pg_temp.channel_assert('Web consent independently enables events',trip_updates_enabled and not trip_email_enabled) from public.rider_notification_preferences;
update public.push_subscriptions set status='disabled';
select pg_temp.channel_assert('Web disable closes event gate',not trip_updates_enabled) from public.rider_notification_preferences;
set local role authenticated;
do $$ begin
  begin perform public.my_rider_notification_preferences('foreign-tenant'); raise exception 'Unauthorized provider allowed' using errcode='XX000';
    exception when raise_exception then null; end;
  begin update public.rider_notification_preferences set trip_email_enabled=true; raise exception 'Direct write allowed' using errcode='XX000';
    exception when insufficient_privilege then null; end;
  begin perform public.notification_email_channel_enabled(gen_random_uuid(),null,null,'rider_driver_arrived'); raise exception 'Private helper exposed' using errcode='XX000';
    exception when insufficient_privilege then null; end;
end; $$;
reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"session_id":"60000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select public.set_my_native_push('driver','70000000-0000-4000-8000-000000000002','ios',true,repeat('b',64),null,'20000000-0000-4000-8000-000000000002');
select public.set_my_driver_trip_email_preferences(false);
select public.set_my_driver_earnings_notification_preferences(false);
select public.set_my_driver_notification_preferences(false);
select pg_temp.channel_assert('Driver trip email confirmed off',not public.my_driver_trip_email_preferences());
select pg_temp.channel_assert('Driver earnings getter remains EMAIL off',
  (public.my_driver_earnings_notification_preferences()->>'earningsUpdatesEnabled')::boolean=false);
reset role;
select pg_temp.channel_assert('Driver mobile survives all email opt-outs',earnings_updates_enabled and expiration_reminders_enabled
  and not trip_email_enabled and not earnings_email_enabled and not expiration_email_enabled) from public.driver_notification_preferences;
insert into public.notification_outbox(tenant_id,driver_profile_id,notification_type,recipient_email,payload,dedupe_key)
  values('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','driver_earnings_recorded','channel-test@example.invalid','{}','channel-earnings');
select pg_temp.channel_assert('Driver email masked',not email_delivery_enabled) from public.notification_outbox where dedupe_key='channel-earnings';
select pg_temp.channel_assert('Preference change audited',exists(select 1 from public.tenant_audit_events where event_name='driver.trip_email_preferences_updated'));
-- Actual booking producer must respect mobile-only eligibility, not only masking.
insert into public.push_subscriptions(tenant_id,rider_profile_id,status)
  values('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','active');
insert into public.dispatch_bookings(tenant_id,rider_profile_id,status)
  values('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','requested');
update public.dispatch_bookings set status='accepted';
update public.dispatch_bookings set status='accepted';
select pg_temp.channel_assert('Actual producer emits each mobile-only event once',count(*)=2 and bool_and(not email_delivery_enabled))
  from public.notification_outbox where notification_type in ('rider_booking_created','rider_driver_accepted');
rollback;
