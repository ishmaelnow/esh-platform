begin;
create function pg_temp.check_review(label text,condition boolean) returns void language plpgsql as $$ begin if condition is not true then raise exception 'Appeal assertion: %',label; end if; end; $$;
insert into tenants values('10000000-0000-4000-8000-000000000001','active',now()),('10000000-0000-4000-8000-000000000002','active',now());
insert into tenant_configurations(tenant_id,tenant_slug) values('10000000-0000-4000-8000-000000000001','test'),('10000000-0000-4000-8000-000000000002','other');
insert into auth.users(id) values('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002'),('20000000-0000-4000-8000-000000000003');
insert into person_profiles(person_id,auth_user_id,status) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','active'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','active'),
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','active');
insert into rider_profiles(rider_profile_id,tenant_id,person_id,display_name) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Test Rider'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','Other Rider');
insert into driver_profiles(driver_profile_id,tenant_id,person_id,display_name) values('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','Test Driver');
insert into dispatch_bookings values
 ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','completed',now()-interval '1 day','Test pickup','Test destination'),
 ('90000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','completed',now()-interval '8 days','Test pickup','Test destination');
insert into trip_ratings(tenant_id,booking_id,reviewer_type,reviewer_person_id,subject_rider_profile_id,overall_rating,criteria)
 values('10000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','driver','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001',1,'{"communication":1,"readiness":1,"respect":1}');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
do $$ begin
 begin perform submit_my_rider_rating_appeal('test','90000000-0000-4000-8000-000000000001','Test reason before disclosure'); raise exception 'Disclosure bypass';
 exception when others then if sqlerrm='Disclosure bypass' then raise; end if; end;
end $$;
insert into trip_ratings(tenant_id,booking_id,reviewer_type,reviewer_person_id,subject_driver_profile_id,overall_rating,criteria)
 select '10000000-0000-4000-8000-000000000001',booking_id,'rider','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',2,'{"safety":2,"communication":2,"vehicle_cleanliness":2}'::jsonb from dispatch_bookings;
set local role authenticated;
select set_config('test.rider_review',submit_my_rider_rating_appeal('test','90000000-0000-4000-8000-000000000001','TEST please review this rating')::text,true);
select pg_temp.check_review('retry same ID',submit_my_rider_rating_appeal('test','90000000-0000-4000-8000-000000000001','TEST retry changed reason')::text=current_setting('test.rider_review'));
select pg_temp.check_review('own list',jsonb_array_length(my_rider_rating_appeals('test'))=1);
select pg_temp.check_review('wrong tenant',jsonb_array_length(my_rider_rating_appeals('other'))=0);
select pg_temp.check_review('wrong role',jsonb_array_length(my_driver_rating_appeals())=0);
select pg_temp.check_review('raw table hidden',(select count(*)=0 from trip_rating_appeals));
reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select set_config('test.driver_review',submit_my_driver_rating_appeal('90000000-0000-4000-8000-000000000002','TEST driver requests a review')::text,true);
select pg_temp.check_review('Driver own role',jsonb_array_length(my_driver_rating_appeals())=1);
select pg_temp.check_review('Driver cannot read Rider role',jsonb_array_length(my_rider_rating_appeals('test'))=0);
reset role;
do $$ begin
 begin perform submit_my_rider_rating_appeal('test','90000000-0000-4000-8000-000000000001','TEST another Rider tries'); raise exception 'Ownership bypass';
 exception when others then if sqlerrm='Ownership bypass' then raise; end if; end;
 begin perform admin_rating_appeals('10000000-0000-4000-8000-000000000001'); raise exception 'Admin bypass';
 exception when others then if sqlerrm='Admin bypass' then raise; end if; end;
end $$;
update driver_profiles set status='suspended';
select pg_temp.check_review('inactive Driver excluded',jsonb_array_length(my_driver_rating_appeals())=0);
update driver_profiles set status='active';
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.check_review('Admin count',(admin_rating_appeals('10000000-0000-4000-8000-000000000001')->>'total')::integer=2);
select pg_temp.check_review('Admin offset',jsonb_array_length(admin_rating_appeals('10000000-0000-4000-8000-000000000001','all',1)->'appeals')=1);
select resolve_trip_rating_appeal(current_setting('test.rider_review')::uuid,'removed','TEST rating removed after review');
select resolve_trip_rating_appeal(current_setting('test.rider_review')::uuid,'removed','TEST rating removed after review');
select resolve_trip_rating_appeal(current_setting('test.driver_review')::uuid,'upheld','TEST rating kept after review');
reset role;
select pg_temp.check_review('single submission audit',(select count(*)=2 from tenant_audit_events where event_name='reputation.rating_appealed'));
select pg_temp.check_review('single decision audit',(select count(*)=2 from tenant_audit_events where event_name='reputation.rating_appeal_resolved'));
select pg_temp.check_review('removed rating hidden',(select moderation_status='hidden' from trip_ratings where reviewer_type='driver'));
do $$ begin
 begin perform resolve_trip_rating_appeal(current_setting('test.rider_review')::uuid,'upheld','TEST conflicting decision'); raise exception 'Decision overwritten';
 exception when others then if sqlerrm='Decision overwritten' then raise; end if; end;
 begin perform admin_rating_appeals('10000000-0000-4000-8000-000000000002'); raise exception 'Tenant bypass';
 exception when others then if sqlerrm='Tenant bypass' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select pg_temp.check_review('decision readable after hidden rating',my_rider_rating_appeals('test')->0->>'status'='removed');
select pg_temp.check_review('received rating hidden',my_rider_reputation('test')->0->'receivedRating'='null'::jsonb);
update tenants set status='inactive';
select pg_temp.check_review('inactive tenant excluded',jsonb_array_length(my_rider_rating_appeals('test'))=0);
select pg_temp.check_review('anonymous denied',not has_function_privilege('anon','my_rating_appeal_owned(text,uuid,text)','execute'));
select pg_temp.check_review('internal submit denied',not has_function_privilege('authenticated','submit_rating_appeal_owned(text,uuid,text,text)','execute'));
rollback;
