-- Disposable fixture only. No remote accounts, rides or notifications.
begin;
create function pg_temp.check_rider(label text,condition boolean) returns void language plpgsql as $$
begin if condition is not true then raise exception 'Assigned Rider rating assertion: %',label; end if; end; $$;
insert into tenants(tenant_id,status) values('10000000-0000-4000-8000-000000000001','active'),('10000000-0000-4000-8000-000000000002','active');
insert into auth.users(id) values('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002'),('20000000-0000-4000-8000-000000000003');
insert into person_profiles(person_id,auth_user_id,status) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','active'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','active'),
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','active');
insert into rider_profiles(rider_profile_id,tenant_id,person_id,status,display_name) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','active','TEST Rider'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','active','NEW Rider'),
 ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','active','OTHER Rider');
insert into driver_profiles(driver_profile_id,tenant_id,person_id,status,display_name) values
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','active','TEST Driver'),
 ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','active','OTHER Driver'),
 ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','active','OTHER tenant Driver');
insert into service_areas values('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','TEST area',null,'active'),
 ('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','OTHER area',null,'active');
insert into dispatch_bookings(booking_id,tenant_id,rider_profile_id,current_driver_profile_id,status,completed_at,service_area_id)
select ('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000001','completed',case when i=6 then now()-interval '1 day' else now()-interval '8 days' end,
 '80000000-0000-4000-8000-000000000001' from generate_series(1,6) i;
insert into dispatch_bookings(booking_id,tenant_id,rider_profile_id,current_driver_profile_id,status,service_area_id,customer_name) values
 ('90000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','accepted','80000000-0000-4000-8000-000000000001','TEST Rider'),
 ('90000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',null,'offered','80000000-0000-4000-8000-000000000001','TEST Rider');
insert into dispatch_offers(offer_id,tenant_id,driver_profile_id,status,expires_at,booking_id) values
 ('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','pending',now()+interval '1 minute','90000000-0000-4000-8000-000000000011');
insert into trip_ratings(tenant_id,booking_id,reviewer_type,reviewer_person_id,subject_rider_profile_id,overall_rating,criteria,comment)
select b.tenant_id,b.booking_id,'driver','30000000-0000-4000-8000-000000000002',b.rider_profile_id,
 case right(b.booking_id::text,1) when '1' then 5 when '2' then 4 when '3' then 3 when '4' then 5 else 1 end,
 '{"communication":5,"readiness":5,"respect":5}','PRIVATE history comment' from dispatch_bookings b where b.status='completed';
update trip_ratings set moderation_status='hidden',moderation_reason='TEST removed',moderated_by_person_id='30000000-0000-4000-8000-000000000003',moderated_at=now()
 where booking_id='90000000-0000-4000-8000-000000000005';
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.check_rider('four disclosed scores average 4.25',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010')='{"average":4.25,"count":4}'::jsonb);
set local role authenticated;
select set_config('test.dispatch',public.my_driver_dispatch()::text,true);
reset role;
select pg_temp.check_rider('actual dispatch projects summary',current_setting('test.dispatch')::jsonb->'trips'->0->'riderRatingSummary'='{"average":4.25,"count":4}'::jsonb);
select pg_temp.check_rider('offer does not expose rating',not (current_setting('test.dispatch')::jsonb->'offers'->0 ? 'riderRatingSummary'));
select pg_temp.check_rider('expiration call preserved',current_setting('test.expiration_tenant')='10000000-0000-4000-8000-000000000001');
select pg_temp.check_rider('only average and count',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010')-array['average','count']='{}'::jsonb);
insert into trip_ratings(tenant_id,booking_id,reviewer_type,reviewer_person_id,subject_driver_profile_id,overall_rating,criteria) values
 ('10000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000006','rider','30000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000001',5,'{"communication":5,"safety":5,"vehicle_cleanliness":5}');
select pg_temp.check_rider('mutual disclosure updates average',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010')='{"average":3.60,"count":5}'::jsonb);
update trip_ratings set moderation_status='hidden',moderation_reason='TEST removed',moderated_by_person_id='30000000-0000-4000-8000-000000000003',moderated_at=now()
 where booking_id='90000000-0000-4000-8000-000000000006' and reviewer_type='driver';
select pg_temp.check_rider('removal updates average',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010')='{"average":4.25,"count":4}'::jsonb);
update dispatch_bookings set current_driver_profile_id='50000000-0000-4000-8000-000000000002' where booking_id='90000000-0000-4000-8000-000000000010';
select pg_temp.check_rider('old Driver denied after reassignment',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010') is null);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select pg_temp.check_rider('new assigned Driver can read',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010') is not null);
update dispatch_bookings set rider_profile_id='40000000-0000-4000-8000-000000000002' where booking_id='90000000-0000-4000-8000-000000000010';
select pg_temp.check_rider('new Rider is confirmed unrated',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010')='{"average":null,"count":0}'::jsonb);
update dispatch_bookings set tenant_id='10000000-0000-4000-8000-000000000002',rider_profile_id='40000000-0000-4000-8000-000000000003',
 current_driver_profile_id='50000000-0000-4000-8000-000000000003',service_area_id='80000000-0000-4000-8000-000000000002'
 where booking_id='90000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
-- Minimal bootstrap's current Driver picks first profile; test tenant-specific identity explicitly.
create or replace function public.current_driver_profile_id() returns uuid language sql security definer as $$
 select driver_profile_id from driver_profiles where person_id=public.current_person_id() and tenant_id='10000000-0000-4000-8000-000000000002' $$;
select pg_temp.check_rider('same person profiles do not combine tenants',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010')='{"average":null,"count":0}'::jsonb);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select pg_temp.check_rider('Rider cannot read as Driver',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010') is null);
select set_config('request.jwt.claim.sub','',true);
select pg_temp.check_rider('anonymous denied',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010') is null);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
update person_profiles set status='inactive' where person_id='30000000-0000-4000-8000-000000000002';
select pg_temp.check_rider('inactive person denied',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010') is null);
update person_profiles set status='active';
update tenants set status='inactive' where tenant_id='10000000-0000-4000-8000-000000000002';
select pg_temp.check_rider('inactive tenant denied',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010') is null);
update tenants set status='active';
update driver_profiles set status='inactive' where driver_profile_id='50000000-0000-4000-8000-000000000003';
select pg_temp.check_rider('inactive Driver denied',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010') is null);
update driver_profiles set status='active';
update rider_profiles set status='inactive' where rider_profile_id='40000000-0000-4000-8000-000000000003';
select pg_temp.check_rider('inactive Rider unavailable',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010') is null);
update rider_profiles set status='active';
update dispatch_bookings set status='arrived' where booking_id='90000000-0000-4000-8000-000000000010';
select pg_temp.check_rider('arrived visible',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010') is not null);
update dispatch_bookings set status='in_progress' where booking_id='90000000-0000-4000-8000-000000000010';
select pg_temp.check_rider('in-progress visible',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010') is not null);
update dispatch_bookings set status='completed',completed_at=now() where booking_id='90000000-0000-4000-8000-000000000010';
select pg_temp.check_rider('completed unavailable',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010') is null);
update dispatch_bookings set status='cancelled' where booking_id='90000000-0000-4000-8000-000000000010';
select pg_temp.check_rider('cancelled unavailable',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010') is null);
update dispatch_bookings set status='offered' where booking_id='90000000-0000-4000-8000-000000000010';
select pg_temp.check_rider('offer not authorized',public.driver_assigned_rider_rating('90000000-0000-4000-8000-000000000010') is null);
select pg_temp.check_rider('client cannot call helper',not has_function_privilege('authenticated','public.driver_assigned_rider_rating(uuid)','execute'));
select pg_temp.check_rider('anon cannot call helper',not has_function_privilege('anon','public.driver_assigned_rider_rating(uuid)','execute'));
rollback;
