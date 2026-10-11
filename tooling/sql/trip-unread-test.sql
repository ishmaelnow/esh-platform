-- Local fixture only; never run against production.
begin;
create function pg_temp.check_unread(label text,condition boolean) returns void language plpgsql as $$
begin if condition is not true then raise exception 'Unread assertion failed: %',label; end if; end; $$;
create function pg_temp.deny_unread(statement text) returns void language plpgsql as $$
begin begin execute statement; exception when others then return; end; raise exception 'Expected denial: %',statement; end; $$;
insert into public.person_profiles(person_id,auth_user_id,status) values
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','active');
insert into public.dispatch_bookings(booking_id,tenant_id,rider_profile_id,current_driver_profile_id,status) values
 ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','accepted'),
 ('90000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','completed');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.send_my_trip_message('90000000-0000-4000-8000-000000000001','rider','PRIVATE TEST message',gen_random_uuid());
select pg_temp.check_unread('own sent messages not unread',public.my_trip_attention('rider')='[]');
select public.create_my_trip_support('90000000-0000-4000-8000-000000000002','trip_issue','PRIVATE TEST Rider report',gen_random_uuid());
reset role;
select set_config('test.message',(select message_id::text from public.trip_messages limit 1),true);
select set_config('test.rider_case',(select case_id::text from public.trip_support_cases limit 1),true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.check_unread('incoming despite email and push off',public.my_trip_attention('driver')->0->>'count'='1');
select pg_temp.check_unread('wrong tenant excluded',public.my_trip_attention('driver','10000000-0000-4000-8000-000000000002')='[]');
select pg_temp.deny_unread($q$select * from public.trip_attention_reads$q$);
select public.mark_my_trip_messages_read('90000000-0000-4000-8000-000000000001','driver',array[current_setting('test.message')::uuid]);
select public.mark_my_trip_messages_read('90000000-0000-4000-8000-000000000001','driver',array[current_setting('test.message')::uuid]);
select pg_temp.check_unread('duplicate acknowledgement safe',public.my_trip_attention('driver')='[]');
select pg_temp.deny_unread($q$select public.mark_my_trip_messages_read('90000000-0000-4000-8000-000000000001','rider',array[current_setting('test.message')::uuid])$q$);
select public.create_my_driver_trip_support('90000000-0000-4000-8000-000000000002','lost_item','PRIVATE TEST Driver report',gen_random_uuid());
reset role;
select set_config('test.driver_case',(select case_id::text from public.driver_trip_support_cases limit 1),true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select public.review_trip_support(current_setting('test.rider_case')::uuid,'in_review','PRIVATE TEST reply',1);
select public.review_driver_trip_support(current_setting('test.driver_case')::uuid,'in_review','PRIVATE TEST reply',1);
reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.check_unread('Rider only own report',jsonb_array_length(public.my_trip_attention('rider'))=1
 and public.my_trip_attention('rider')->0->>'itemId'=current_setting('test.rider_case'));
select pg_temp.deny_unread($q$select public.mark_my_trip_support_read('90000000-0000-4000-8000-000000000002','rider',current_setting('test.driver_case')::uuid,2)$q$);
select pg_temp.deny_unread($q$select public.mark_my_trip_support_read('90000000-0000-4000-8000-000000000002','rider',current_setting('test.rider_case')::uuid,99)$q$);
select public.mark_my_trip_support_read('90000000-0000-4000-8000-000000000002','rider',current_setting('test.rider_case')::uuid,2);
select pg_temp.check_unread('Rider clear own only',public.my_trip_attention('rider')='[]');
reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.check_unread('Driver reply remains unread',jsonb_array_length(public.my_trip_attention('driver'))=1);
reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select public.review_driver_trip_support(current_setting('test.driver_case')::uuid,'resolved','PRIVATE newer reply',2);
reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.mark_my_trip_support_read('90000000-0000-4000-8000-000000000002','driver',current_setting('test.driver_case')::uuid,2);
select pg_temp.check_unread('concurrent newer reply stays unread',jsonb_array_length(public.my_trip_attention('driver'))=1);
select public.mark_my_trip_support_read('90000000-0000-4000-8000-000000000002','driver',current_setting('test.driver_case')::uuid,3);
select public.mark_my_trip_support_read('90000000-0000-4000-8000-000000000002','driver',current_setting('test.driver_case')::uuid,2);
select pg_temp.check_unread('older mark cannot regress',public.my_trip_attention('driver')='[]');
reset role;
update public.dispatch_bookings set current_driver_profile_id='50000000-0000-4000-8000-000000000002'
 where booking_id='90000000-0000-4000-8000-000000000001';
select pg_temp.check_unread('message markers purged on reassignment',not exists(select 1 from public.trip_attention_reads where kind='messages'));
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select pg_temp.check_unread('other Driver no reports or old messages',public.my_trip_attention('driver')='[]');
select pg_temp.deny_unread($q$select public.mark_my_trip_support_read('90000000-0000-4000-8000-000000000002','driver',current_setting('test.driver_case')::uuid,3)$q$);
reset role;
update public.person_profiles set status='inactive' where person_id='30000000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.deny_unread($q$select public.my_trip_attention('driver')$q$);
reset role;
set local role anon;
select pg_temp.deny_unread($q$select public.my_trip_attention('rider')$q$);
reset role;
select pg_temp.check_unread('no bodies in audit',not exists(select 1 from public.tenant_audit_events where metadata::text like '%PRIVATE%' or reason like '%PRIVATE%'));
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select pg_temp.check_unread('counts have no private text',public.my_trip_attention('rider')::text not like '%PRIVATE%');
rollback;
