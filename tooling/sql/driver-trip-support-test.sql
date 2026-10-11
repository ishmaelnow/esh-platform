-- Disposable local test only. No remote data or external delivery.
begin;
create function pg_temp.check_driver_support(label text,condition boolean) returns void language plpgsql as $$
begin if condition is not true then raise exception 'Driver support assertion failed: %',label; end if; end; $$;
create function pg_temp.driver_support_denied(statement text) returns void language plpgsql as $$
begin begin execute statement; exception when others then return; end; raise exception 'Expected denial: %',statement; end; $$;
insert into public.person_profiles(person_id,auth_user_id,status) values
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','active');
insert into public.dispatch_bookings(booking_id,tenant_id,rider_profile_id,current_driver_profile_id,status) values
 ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','completed'),
 ('90000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','cancelled'),
 ('90000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','accepted');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"session_id":"60000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select pg_temp.check_driver_support('only owned finished history',jsonb_array_length(public.my_driver_support_trips())=1);
select public.set_my_driver_trip_email_preferences(false);
select public.create_my_driver_trip_support('90000000-0000-4000-8000-000000000001','trip_issue','PRIVATE TEST Driver issue', 'a0000000-0000-4000-8000-000000000001');
select public.create_my_driver_trip_support('90000000-0000-4000-8000-000000000001','trip_issue','PRIVATE TEST Driver issue', 'a0000000-0000-4000-8000-000000000001');
select pg_temp.check_driver_support('same request only once',jsonb_array_length(public.my_driver_trip_support('90000000-0000-4000-8000-000000000001'))=1);
select pg_temp.driver_support_denied($q$select public.create_my_driver_trip_support('90000000-0000-4000-8000-000000000001','trip_issue','PRIVATE changed body','a0000000-0000-4000-8000-000000000001')$q$);
select pg_temp.driver_support_denied($q$select public.create_my_driver_trip_support('90000000-0000-4000-8000-000000000001','lost_item','short',gen_random_uuid())$q$);
select pg_temp.driver_support_denied($q$select public.my_driver_trip_support('90000000-0000-4000-8000-000000000002')$q$);
select pg_temp.driver_support_denied($q$select public.my_driver_trip_support('90000000-0000-4000-8000-000000000003')$q$);
select pg_temp.driver_support_denied($q$select * from public.driver_trip_support_cases$q$);
select pg_temp.driver_support_denied($q$select * from public.driver_trip_support_updates$q$);
reset role;
select set_config('test.driver_case',(select case_id::text from public.driver_trip_support_cases limit 1),true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.check_driver_support('admin queue',(public.admin_driver_trip_support('10000000-0000-4000-8000-000000000001')->>'total')::int=1);
select pg_temp.driver_support_denied($q$select public.admin_driver_trip_support('10000000-0000-4000-8000-000000000002')$q$);
select public.review_driver_trip_support(current_setting('test.driver_case')::uuid,'in_review','PRIVATE Admin reply',1);
reset role;
select pg_temp.check_driver_support('all channels off means no alert',(select count(*)=0 from public.notification_outbox));
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.set_my_native_push('driver','70000000-0000-4000-8000-000000000002','ios',true,repeat('b',64),null,'20000000-0000-4000-8000-000000000002');
reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select public.review_driver_trip_support(current_setting('test.driver_case')::uuid,'resolved','PRIVATE resolved',2);
select public.review_driver_trip_support(current_setting('test.driver_case')::uuid,'resolved','PRIVATE resolved',2);
select pg_temp.driver_support_denied($q$select public.review_driver_trip_support(current_setting('test.driver_case')::uuid,'open','Conflicting stale review',2)$q$);
reset role;
select pg_temp.check_driver_support('one device-only event',(select count(*)=1 and bool_and(not email_delivery_enabled) from public.notification_outbox));
select pg_temp.check_driver_support('payload generic',(select not payload::text like '%PRIVATE%' and rider_profile_id is null and driver_profile_id='50000000-0000-4000-8000-000000000001' from public.notification_outbox limit 1));
select pg_temp.check_driver_support('current access',public.driver_support_alert_current((select notification_id from public.notification_outbox limit 1)));
update public.notification_outbox set delivery_status='email_disabled';
set local role service_role;
select set_config('test.driver_claim',public.claim_native_push_attempts()::text,true);
reset role;
select pg_temp.check_driver_support('native Driver exact report route',jsonb_array_length(current_setting('test.driver_claim')::jsonb)=1
 and current_setting('test.driver_claim')::jsonb->0->>'product'='driver'
 and current_setting('test.driver_claim')::jsonb->0->>'caseId'=current_setting('test.driver_case'));
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.driver_support_denied($q$select public.my_driver_trip_support('90000000-0000-4000-8000-000000000001')$q$);
select pg_temp.check_driver_support('Rider sees no Driver case',public.my_trip_support('90000000-0000-4000-8000-000000000001')='[]');
reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select pg_temp.driver_support_denied($q$select public.my_driver_trip_support('90000000-0000-4000-8000-000000000001')$q$);
select public.create_my_driver_trip_support('90000000-0000-4000-8000-000000000002','lost_item','TEST item in cancelled trip',gen_random_uuid());
reset role;
update public.native_push_attempts set status='failed',next_attempt_at=now();
update public.driver_profiles set status='suspended' where driver_profile_id='50000000-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.check_driver_support('revoked Driver loses pending delivery',public.claim_native_push_attempts()='[]');
reset role;
select pg_temp.check_driver_support('audit omits body',not exists(select 1 from public.tenant_audit_events where metadata::text like '%PRIVATE%' or reason like '%PRIVATE%'));
update public.driver_profiles set status='active' where driver_profile_id='50000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.set_my_driver_trip_email_preferences(true);
reset role;
update public.native_push_registrations set status='disabled';
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select public.review_driver_trip_support(current_setting('test.driver_case')::uuid,'in_review','PRIVATE email-only reply',3);
reset role;
select pg_temp.check_driver_support('email-only update eligible',(select count(*)=1 from public.notification_outbox where email_delivery_enabled));
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.set_my_driver_trip_email_preferences(false);
select public.set_my_driver_trip_email_preferences(true);
reset role;
select pg_temp.check_driver_support('opt-out masks queued Driver support without reenable',(select count(*)=0 from public.notification_outbox where email_delivery_enabled));
select pg_temp.check_driver_support('eligibility service only',not has_function_privilege('authenticated','public.driver_support_alert_current(uuid)','execute'));
set local role anon;
select pg_temp.driver_support_denied($q$select public.my_driver_trip_support('90000000-0000-4000-8000-000000000001')$q$);
reset role;
rollback;
