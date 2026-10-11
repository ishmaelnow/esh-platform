-- TEST ONLY: run through the disposable minimal-schema runner.
begin;
do $$ begin
  begin perform public.my_driver_daily_activity(); raise exception 'anonymous access succeeded';
    exception when others then if sqlerrm='anonymous access succeeded' then raise; end if; end;
  if has_function_privilege('anon','public.my_driver_daily_activity()','execute') then raise exception 'anon grant'; end if;
end; $$;
insert into driver_profiles values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
insert into tenant_configurations select tenant_id,'America/Chicago' from driver_profiles;
insert into driver_availability select driver_profile_id,tenant_id,'offline' from driver_profiles;
select set_config('test.driver','10000000-0000-4000-8000-000000000001',true);
do $$
declare result jsonb; starts timestamptz; tenant uuid:='20000000-0000-4000-8000-000000000001';
  driver uuid:='10000000-0000-4000-8000-000000000001';
begin
  result:=public.my_driver_daily_activity(); starts:=(result->>'startsAt')::timestamptz;
  if (result->>'distanceMeters')::integer<>0 or (result->>'onlineSeconds')::integer<>0 then raise exception 'empty day'; end if;
  insert into tenant_audit_events(tenant_id,resource_id,resource_type,event_name,occurred_at,metadata) values
    (tenant,driver::text,'driver_profile','driver.availability_changed',starts-interval '2 hours','{"requested_status":"online"}'),
    (tenant,driver::text,'driver_profile','driver.availability_changed',starts,'{"requested_status":"offline"}');
  result:=public.my_driver_daily_activity();
  if (result->>'onlineSeconds')::integer<>0 then raise exception 'midnight clipping'; end if;
  delete from tenant_audit_events where metadata->>'requested_status'='offline';
  update driver_availability set requested_status='online' where driver_profile_id=driver;
  result:=public.my_driver_daily_activity();
  if abs((result->>'onlineSeconds')::bigint-extract(epoch from now()-starts))>1 then raise exception 'overnight interval'; end if;
  insert into tenant_audit_events(tenant_id,resource_id,resource_type,event_name,occurred_at,metadata) values
    (tenant,driver::text,'driver_profile','driver.availability_changed',starts+(now()-starts)/4,'{"requested_status":"offline"}'),
    (tenant,driver::text,'driver_profile','driver.availability_changed',starts+(now()-starts)/2,'{"requested_status":"online"}');
  result:=public.my_driver_daily_activity();
  if abs((result->>'onlineSeconds')::bigint-extract(epoch from (now()-starts)*0.75))>1 then raise exception 'multiple intervals'; end if;
  update driver_availability set requested_status='offline' where driver_profile_id=driver;
  if public.my_driver_daily_activity()->>'onlineSeconds' is not null then raise exception 'inconsistent history'; end if;
  insert into dispatch_bookings values(gen_random_uuid(),tenant,driver,'completed',now(),1500,'driver_location_aggregate');
  insert into dispatch_bookings values(gen_random_uuid(),'20000000-0000-4000-8000-000000000002',driver,'completed',now(),999999,'driver_location_aggregate');
  insert into dispatch_bookings values(gen_random_uuid(),tenant,driver,'cancelled',now(),999999,'driver_location_aggregate');
  insert into dispatch_bookings values(gen_random_uuid(),tenant,driver,'completed',starts-interval '1 second',999999,'driver_location_aggregate');
  result:=public.my_driver_daily_activity();
  if (result->>'completedTrips')::integer<>1 or (result->>'distanceMeters')::integer<>1500 then raise exception 'distance isolation'; end if;
  insert into dispatch_bookings values(gen_random_uuid(),tenant,driver,'completed',now(),null,null);
  result:=public.my_driver_daily_activity();
  if result->>'distanceMeters' is not null or (result->>'missingDistanceTrips')::integer<>1 then raise exception 'missing distance'; end if;
  if extract(epoch from ('2026-11-02'::timestamp at time zone 'America/Chicago')-('2026-11-01'::timestamp at time zone 'America/Chicago'))<>90000 then raise exception 'DST fall'; end if;
  if extract(epoch from ('2026-03-09'::timestamp at time zone 'America/Chicago')-('2026-03-08'::timestamp at time zone 'America/Chicago'))<>82800 then raise exception 'DST spring'; end if;
end; $$;
select set_config('test.driver','10000000-0000-4000-8000-000000000002',true);
do $$ begin if (public.my_driver_daily_activity()->>'completedTrips')::integer<>0 then raise exception 'cross driver leak'; end if; end; $$;
rollback;
