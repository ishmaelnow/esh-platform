-- Disposable fixture only, never run on a remote/existing database.
begin;
create function pg_temp.check_message(label text,condition boolean) returns void language plpgsql as $$
begin if condition is not true then raise exception 'Message assertion failed: %',label; end if; end; $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"session_id":"60000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select public.set_my_native_push('driver','70000000-0000-4000-8000-000000000002','ios',true,repeat('b',64),null,'20000000-0000-4000-8000-000000000002');
reset role;
insert into public.dispatch_bookings(booking_id,tenant_id,rider_profile_id,current_driver_profile_id,status)
 values('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','accepted');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.send_my_trip_message('90000000-0000-4000-8000-000000000001','rider','I am outside','a0000000-0000-4000-8000-000000000001');
select public.send_my_trip_message('90000000-0000-4000-8000-000000000001','rider','I am outside','a0000000-0000-4000-8000-000000000001');
select pg_temp.check_message('idempotent',jsonb_array_length(public.my_trip_messages('90000000-0000-4000-8000-000000000001','rider'))=1);
do $$ begin
  begin perform public.send_my_trip_message('90000000-0000-4000-8000-000000000001','rider',repeat('x',1001),gen_random_uuid());
    raise exception 'Expected length denial'; exception when others then if sqlerrm='Expected length denial' then raise; end if; end;
  begin perform public.send_my_trip_message('90000000-0000-4000-8000-000000000001','rider','   ',gen_random_uuid());
    raise exception 'Expected empty denial'; exception when others then if sqlerrm='Expected empty denial' then raise; end if; end;
  for i in 1..4 loop perform public.send_my_trip_message('90000000-0000-4000-8000-000000000001','rider','Rate test '||i,gen_random_uuid()); end loop;
  begin perform public.send_my_trip_message('90000000-0000-4000-8000-000000000001','rider','Too fast',gen_random_uuid());
    raise exception 'Expected rate denial'; exception when others then if sqlerrm='Expected rate denial' then raise; end if; end;
end; $$;
do $$ begin
  begin perform public.my_trip_messages('90000000-0000-4000-8000-000000000001','driver'); raise exception 'Expected role denial';
  exception when others then if sqlerrm='Expected role denial' then raise; end if; end;
  begin perform 1 from public.trip_messages; raise exception 'Expected direct read denial';
  exception when insufficient_privilege then null; end;
  begin perform public.send_my_trip_message('90000000-0000-4000-8000-000000000001','rider','changed','a0000000-0000-4000-8000-000000000001');
    raise exception 'Expected changed retry denial'; exception when others then if sqlerrm='Expected changed retry denial' then raise; end if; end;
end; $$;
reset role;
select pg_temp.check_message('native queue independent of email',exists(select 1 from public.native_push_attempts a
  join public.notification_outbox n using(notification_id) where n.notification_type='driver_trip_message' and not n.email_delivery_enabled));
select pg_temp.check_message('notification private',not email_delivery_enabled and not payload::text like '%outside%')
  from public.notification_outbox where notification_type='driver_trip_message';
select pg_temp.check_message('audit body absent',not metadata::text like '%outside%') from public.tenant_audit_events where event_name='trip.message_sent';
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.check_message('assigned Driver reads',exists(select 1 from jsonb_array_elements(public.my_trip_messages('90000000-0000-4000-8000-000000000001','driver')) m where m->>'body'='I am outside'));
select public.send_my_trip_message('90000000-0000-4000-8000-000000000001','driver','At the entrance','a0000000-0000-4000-8000-000000000002');
reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
set local role authenticated;
do $$ begin
  begin perform public.my_trip_messages('90000000-0000-4000-8000-000000000001','driver'); raise exception 'Expected other Driver denial';
  exception when others then if sqlerrm='Expected other Driver denial' then raise; end if; end;
end; $$;
reset role;
update public.dispatch_bookings set current_driver_profile_id='50000000-0000-4000-8000-000000000002' where booking_id='90000000-0000-4000-8000-000000000001';
select pg_temp.check_message('reassignment clears content',not exists(select 1 from public.trip_messages));
select pg_temp.check_message('reassignment cancels alerts',not exists(select 1 from public.notification_outbox where notification_type in ('driver_trip_message','rider_trip_message') and delivery_status<>'canceled'));
select pg_temp.check_message('closed native attempts cannot be claimed',public.claim_native_push_attempts(null,null,50,array['ios'])='[]');
set local role authenticated;
select pg_temp.check_message('new Driver has empty thread',public.my_trip_messages('90000000-0000-4000-8000-000000000001','driver')='[]');
select public.send_my_trip_message('90000000-0000-4000-8000-000000000001','driver','New assignment','a0000000-0000-4000-8000-000000000003');
reset role;
update public.dispatch_bookings set status='completed' where booking_id='90000000-0000-4000-8000-000000000001';
select pg_temp.check_message('completion deletes messages',not exists(select 1 from public.trip_messages));
set local role authenticated;
do $$ begin
  begin perform public.send_my_trip_message('90000000-0000-4000-8000-000000000001','driver','Late','a0000000-0000-4000-8000-000000000004'); raise exception 'Expected closed trip denial';
  exception when others then if sqlerrm='Expected closed trip denial' then raise; end if; end;
end; $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.my_trip_messages('90000000-0000-4000-8000-000000000001','rider'); raise exception 'Expected anonymous denial';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
insert into public.tenants(tenant_id,status) values('10000000-0000-4000-8000-000000000002','active');
insert into public.rider_profiles(rider_profile_id,tenant_id,person_id,email) values
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000004','other@example.invalid');
insert into public.driver_profiles(driver_profile_id,tenant_id,person_id,email) values
 ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000004','other-driver@example.invalid');
insert into public.dispatch_bookings(booking_id,tenant_id,rider_profile_id,current_driver_profile_id,status)
 values('90000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
 '40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000003','accepted');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
  begin perform public.my_trip_messages('90000000-0000-4000-8000-000000000002','rider'); raise exception 'Expected other tenant/Rider denial';
  exception when others then if sqlerrm='Expected other tenant/Rider denial' then raise; end if; end;
  begin insert into public.trip_messages(tenant_id,booking_id,rider_profile_id,driver_profile_id,sender_role,request_id,body)
    values('10000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','rider',gen_random_uuid(),'forged');
    raise exception 'Expected direct insert denial'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
