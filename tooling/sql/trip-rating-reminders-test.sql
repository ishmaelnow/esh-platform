-- Disposable fixture; no messages leave this database.
begin;
create function pg_temp.check_rating(label text,condition boolean) returns void language plpgsql as $$
begin if condition is not true then raise exception 'Rating reminder assertion: %',label; end if; end; $$;
update public.driver_profiles set email='driver-test@example.invalid';
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"session_id":"60000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select public.set_my_native_push('rider',gen_random_uuid(),'ios',true,repeat('a',64),'channel-test','20000000-0000-4000-8000-000000000001');
reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"session_id":"60000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select public.set_my_native_push('driver',gen_random_uuid(),'android',true,repeat('b',64),null,'20000000-0000-4000-8000-000000000002');
reset role;
insert into public.dispatch_bookings(booking_id,tenant_id,rider_profile_id,current_driver_profile_id,status,completed_at) values
 ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','in_progress',null),
 ('90000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','completed',now()-interval '1 day');
select pg_temp.check_rating('no backfill',(select count(*)=0 from notification_outbox where notification_type like '%rating_reminder'));
update dispatch_bookings set status='completed',completed_at=now() where booking_id='90000000-0000-4000-8000-000000000001';
select pg_temp.check_rating('one per participant',(select count(*)=2 from notification_outbox where notification_type like '%rating_reminder'));
select pg_temp.check_rating('email off does not block device',(select not email_delivery_enabled from notification_outbox where notification_type='rider_rating_reminder'));
select pg_temp.check_rating('native delayed',jsonb_array_length(public.claim_native_push_attempts())=0);
select pg_temp.check_rating('generic payload',(select bool_and(payload-ARRAY['booking_id','tenant_slug']='{}'::jsonb) from notification_outbox where notification_type like '%rating_reminder'));
select pg_temp.check_rating('not before due',(select bool_and(not rating_alert_current(notification_id)) from notification_outbox where notification_type like '%rating_reminder'));
update dispatch_bookings set status='completed' where booking_id='90000000-0000-4000-8000-000000000001';
select pg_temp.check_rating('replay deduped',(select count(*)=2 from notification_outbox where notification_type like '%rating_reminder'));
update notification_outbox set available_at=now()-interval '1 minute' where notification_type like '%rating_reminder';
update native_push_attempts set next_attempt_at=now()-interval '1 minute';
select pg_temp.check_rating('due eligible',(select bool_and(rating_alert_current(notification_id)) from notification_outbox where notification_type like '%rating_reminder'));
update notification_outbox set person_id='30000000-0000-4000-8000-000000000001' where notification_type='driver_rating_reminder';
select pg_temp.check_rating('recipient mismatch denied',(select not rating_alert_current(notification_id) from notification_outbox where notification_type='driver_rating_reminder'));
update notification_outbox set person_id='30000000-0000-4000-8000-000000000002' where notification_type='driver_rating_reminder';
update tenants set status='inactive';
select pg_temp.check_rating('inactive tenant denied',(select bool_and(not rating_alert_current(notification_id)) from notification_outbox where notification_type like '%rating_reminder'));
update tenants set status='active';
select set_config('test.rating_claims',public.claim_native_push_attempts()::text,true);
select pg_temp.check_rating('both native claims',jsonb_array_length(current_setting('test.rating_claims')::jsonb)=2);
select pg_temp.check_rating('exact native target',current_setting('test.rating_claims')::jsonb->0->>'bookingId'='90000000-0000-4000-8000-000000000001');
insert into trip_ratings values('10000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','rider');
select pg_temp.check_rating('own submitted canceled',(select delivery_status='canceled' and not rating_alert_current(notification_id) from notification_outbox where notification_type='rider_rating_reminder'));
select pg_temp.check_rating('other party unaffected',(select rating_alert_current(notification_id) from notification_outbox where notification_type='driver_rating_reminder'));
update notification_outbox set available_at=now()-interval '25 hours' where notification_type='driver_rating_reminder';
select pg_temp.check_rating('expired suppressed',(select not rating_alert_current(notification_id) from notification_outbox where notification_type='driver_rating_reminder'));
update native_push_attempts set claimed_at=now()-interval '3 minutes';
select pg_temp.check_rating('expired native not claimed',jsonb_array_length(public.claim_native_push_attempts())=0);
update native_push_registrations set status='disabled';
update driver_notification_preferences set trip_email_enabled=false;
insert into dispatch_bookings(booking_id,tenant_id,rider_profile_id,current_driver_profile_id,status) values
 ('90000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','in_progress');
update dispatch_bookings set status='completed',completed_at=now() where booking_id='90000000-0000-4000-8000-000000000003';
select pg_temp.check_rating('all channels off queues nothing',(select count(*)=2 from notification_outbox where notification_type like '%rating_reminder'));
select pg_temp.check_rating('anonymous denied',not has_function_privilege('anon','public.rating_alert_current(uuid)','execute'));
select pg_temp.check_rating('app cannot queue',not has_function_privilege('authenticated','public.queue_trip_rating_reminders()','execute'));
rollback;
