-- Disposable fixture only; no external deliveries.
begin;
create function pg_temp.check_support(label text,condition boolean) returns void language plpgsql as $$
begin if condition is not true then raise exception 'Support alert assertion failed: %',label; end if; end; $$;
insert into public.person_profiles(person_id,auth_user_id,status) values
  ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','active');
insert into public.dispatch_bookings(booking_id,tenant_id,rider_profile_id,status) values
  ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','completed');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"session_id":"60000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select public.create_my_trip_support('90000000-0000-4000-8000-000000000001','lost_item','TEST PRIVATE report description',gen_random_uuid());
reset role;
select set_config('test.case',(select case_id::text from public.trip_support_cases limit 1),true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select public.review_trip_support(current_setting('test.case')::uuid,'in_review','PRIVATE response with both channels off',1);
reset role;
select pg_temp.check_support('no event when all channels disabled',(select count(*)=0 from public.notification_outbox));
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.set_my_native_push('rider','70000000-0000-4000-8000-000000000001','ios',true,repeat('a',64),'channel-test','20000000-0000-4000-8000-000000000001');
reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select public.review_trip_support(current_setting('test.case')::uuid,'resolved','PRIVATE resolved response',2);
select public.review_trip_support(current_setting('test.case')::uuid,'resolved','PRIVATE resolved response',2);
reset role;
select pg_temp.check_support('idempotent review queues once',(select count(*)=1 from public.notification_outbox));
select pg_temp.check_support('email disabled, device eligible',(select not email_delivery_enabled from public.notification_outbox limit 1));
select pg_temp.check_support('payload has routing only',(select payload ? 'case_id' and payload ? 'booking_id' and not payload::text like '%PRIVATE%' from public.notification_outbox limit 1));
select pg_temp.check_support('eligible owned report',public.support_alert_current((select notification_id from public.notification_outbox limit 1)));
update public.notification_outbox set delivery_status='email_disabled';
set local role service_role;
select set_config('test.claim',public.claim_native_push_attempts()::text,true);
reset role;
select pg_temp.check_support('native independent of email with exact routing',jsonb_array_length(current_setting('test.claim')::jsonb)=1
  and current_setting('test.claim')::jsonb->0->>'caseId'=current_setting('test.case')
  and current_setting('test.claim')::jsonb->0->>'bookingId'='90000000-0000-4000-8000-000000000001');
-- Return the attempt to retryable state, then revoke recipient eligibility.
update public.native_push_attempts set status='failed',next_attempt_at=now();
update public.person_profiles set status='suspended' where person_id='30000000-0000-4000-8000-000000000001';
select pg_temp.check_support('inactive person loses eligibility',not public.support_alert_current((select notification_id from public.notification_outbox limit 1)));
set local role service_role;
select pg_temp.check_support('stale native not sent',public.claim_native_push_attempts()='[]');
reset role;
select pg_temp.check_support('attempt expires',(select status='expired' from public.native_push_attempts limit 1));
update public.person_profiles set status='active' where person_id='30000000-0000-4000-8000-000000000001';
update public.rider_notification_preferences set trip_email_enabled=true;
update public.native_push_registrations set status='disabled';
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select public.review_trip_support(current_setting('test.case')::uuid,'in_review','PRIVATE reopened response',3);
reset role;
select pg_temp.check_support('email-only update eligible',(select count(*)=1 from public.notification_outbox where email_delivery_enabled));
select pg_temp.check_support('no new native attempt when disabled',(select count(*)=1 from public.native_push_attempts));
select pg_temp.check_support('recipient cannot be swapped',not exists(select 1 from public.notification_outbox where rider_profile_id<>'40000000-0000-4000-8000-000000000001' or tenant_id<>'10000000-0000-4000-8000-000000000001'));
select pg_temp.check_support('eligibility RPC not client executable',not has_function_privilege('authenticated','public.support_alert_current(uuid)','execute') and not has_function_privilege('anon','public.support_alert_current(uuid)','execute'));
rollback;
