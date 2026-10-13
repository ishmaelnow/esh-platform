-- Local fixture only. No production account, ride or notification mutation.
begin;
create function pg_temp.check_rating(label text,condition boolean) returns void language plpgsql as $$
begin if condition is not true then raise exception 'Assigned Driver rating assertion: %',label; end if; end; $$;
insert into tenants(tenant_id,status) values('10000000-0000-4000-8000-000000000001','active'),('10000000-0000-4000-8000-000000000002','active');
insert into tenant_configurations(tenant_id,tenant_slug,display_name) values
 ('10000000-0000-4000-8000-000000000001','rating-test','TEST company'),('10000000-0000-4000-8000-000000000002','other-test','OTHER company');
insert into tenant_capabilities values('10000000-0000-4000-8000-000000000001','driver.management',true),('10000000-0000-4000-8000-000000000002','driver.management',true);
insert into auth.users(id) values('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002'),('20000000-0000-4000-8000-000000000003');
insert into person_profiles(person_id,auth_user_id,status) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','active'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','active'),
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','active');
insert into rider_profiles(rider_profile_id,tenant_id,person_id,status,display_name) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','active','TEST Rider'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','active','OTHER Rider');
insert into driver_profiles(driver_profile_id,tenant_id,person_id,status,display_name,driver_number) values
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','active','TEST Driver','TEST-1'),
 ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','active','NEW Driver','TEST-2'),
 ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','active','OTHER Driver','OTHER-1');
insert into service_areas values('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','TEST area',null,'active'),
 ('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','OTHER area',null,'active');
insert into dispatch_bookings(booking_id,tenant_id,rider_profile_id,current_driver_profile_id,status,completed_at,service_area_id)
select ('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000001','completed',case when i=6 then now()-interval '1 day' else now()-interval '8 days' end,
 '80000000-0000-4000-8000-000000000001' from generate_series(1,6) i;
insert into dispatch_bookings(booking_id,tenant_id,rider_profile_id,current_driver_profile_id,status,service_area_id) values
 ('90000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','accepted','80000000-0000-4000-8000-000000000001');
insert into trip_ratings(tenant_id,booking_id,reviewer_type,reviewer_person_id,subject_driver_profile_id,overall_rating,criteria,comment)
select b.tenant_id,b.booking_id,'rider','30000000-0000-4000-8000-000000000001',b.current_driver_profile_id,
 case right(b.booking_id::text,1) when '1' then 5 when '2' then 4 when '3' then 3 when '4' then 5 else 1 end,
 '{"communication":5,"safety":5,"vehicle_cleanliness":5}','PRIVATE comment' from dispatch_bookings b where b.status='completed';
update trip_ratings set moderation_status='hidden',moderation_reason='TEST removed',moderated_by_person_id='30000000-0000-4000-8000-000000000003',moderated_at=now()
 where booking_id='90000000-0000-4000-8000-000000000005';
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select pg_temp.check_rating('four disclosed scores average 4.25',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010')='{"average":4.25,"count":4}'::jsonb);
set local role authenticated;
select set_config('test.portal',public.my_rider_portal('rating-test')::text,true);
reset role;
select pg_temp.check_rating('actual portal assigned summary',exists(select 1 from jsonb_array_elements(current_setting('test.portal')::jsonb->'bookings') b
 where b->>'bookingId'='90000000-0000-4000-8000-000000000010' and b->'driver'->'ratingSummary'='{"average":4.25,"count":4}'::jsonb));
select pg_temp.check_rating('no historical summary',not exists(select 1 from jsonb_array_elements(current_setting('test.portal')::jsonb->'bookings') b
 where b->>'status'='completed' and b->'driver'->'ratingSummary'<>'null'::jsonb));
select pg_temp.check_rating('no raw data in summary',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010')-array['average','count']='{}'::jsonb);
insert into trip_ratings(tenant_id,booking_id,reviewer_type,reviewer_person_id,subject_rider_profile_id,overall_rating,criteria) values
 ('10000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000006','driver','30000000-0000-4000-8000-000000000002',
 '40000000-0000-4000-8000-000000000001',5,'{"communication":5,"readiness":5,"respect":5}');
select pg_temp.check_rating('mutual disclosure updates aggregate',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010')='{"average":3.60,"count":5}'::jsonb);
update trip_ratings set moderation_status='hidden',moderation_reason='TEST removed',moderated_by_person_id='30000000-0000-4000-8000-000000000003',moderated_at=now()
 where booking_id='90000000-0000-4000-8000-000000000006' and reviewer_type='rider';
select pg_temp.check_rating('removal updates aggregate',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010')='{"average":4.25,"count":4}'::jsonb);
update dispatch_bookings set current_driver_profile_id='50000000-0000-4000-8000-000000000002' where booking_id='90000000-0000-4000-8000-000000000010';
select pg_temp.check_rating('reassignment shows confirmed unrated driver',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010')='{"average":null,"count":0}'::jsonb);
-- Reusing a person across tenants does not combine distinct Driver profiles or ratings.
update dispatch_bookings set tenant_id='10000000-0000-4000-8000-000000000002',rider_profile_id='40000000-0000-4000-8000-000000000002',
 current_driver_profile_id='50000000-0000-4000-8000-000000000003',service_area_id='80000000-0000-4000-8000-000000000002'
 where booking_id='90000000-0000-4000-8000-000000000010';
select pg_temp.check_rating('other tenant aggregate isolated',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010')='{"average":null,"count":0}'::jsonb);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.check_rating('driver cannot view as Rider',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010') is null);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select pg_temp.check_rating('foreign person denied',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010') is null);
select set_config('request.jwt.claim.sub','',true);
select pg_temp.check_rating('anonymous denied',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010') is null);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
update person_profiles set status='inactive' where person_id='30000000-0000-4000-8000-000000000001';
select pg_temp.check_rating('inactive person denied',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010') is null);
update person_profiles set status='active';
update tenants set status='inactive' where tenant_id='10000000-0000-4000-8000-000000000002';
select pg_temp.check_rating('inactive tenant denied',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010') is null);
update tenants set status='active';
update rider_profiles set status='inactive' where rider_profile_id='40000000-0000-4000-8000-000000000002';
select pg_temp.check_rating('inactive Rider denied',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010') is null);
update rider_profiles set status='active';
update driver_profiles set status='inactive' where driver_profile_id='50000000-0000-4000-8000-000000000003';
select pg_temp.check_rating('inactive assigned Driver unavailable',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010') is null);
update driver_profiles set status='active';
update dispatch_bookings set status='arrived' where booking_id='90000000-0000-4000-8000-000000000010';
select pg_temp.check_rating('arrived visible',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010') is not null);
update dispatch_bookings set status='in_progress' where booking_id='90000000-0000-4000-8000-000000000010';
select pg_temp.check_rating('in-progress visible',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010') is not null);
update dispatch_bookings set status='completed',completed_at=now() where booking_id='90000000-0000-4000-8000-000000000010';
select pg_temp.check_rating('completed unavailable',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010') is null);
update dispatch_bookings set status='cancelled' where booking_id='90000000-0000-4000-8000-000000000010';
select pg_temp.check_rating('cancelled unavailable',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010') is null);
update dispatch_bookings set status='offered' where booking_id='90000000-0000-4000-8000-000000000010';
select pg_temp.check_rating('offer does not expose candidate',public.rider_assigned_driver_rating('90000000-0000-4000-8000-000000000010') is null);
select pg_temp.check_rating('private helper cannot be called by app',not has_function_privilege('authenticated','public.rider_assigned_driver_rating(uuid)','execute'));
select pg_temp.check_rating('private helper cannot be called anonymously',not has_function_privilege('anon','public.rider_assigned_driver_rating(uuid)','execute'));
rollback;
