begin;
create function pg_temp.check_photo(label text,condition boolean) returns void language plpgsql as $$
begin if condition is not true then raise exception 'Photo assertion failed: %',label; end if; end; $$;
create function pg_temp.denied_photo(role_value text) returns void language plpgsql as $$
begin
  begin perform public.my_trip_participant_photo('90000000-0000-4000-8000-000000000001',role_value);
    raise exception 'Expected denial';
  exception when others then if sqlerrm='Expected denial' then raise; end if; end;
end; $$;
insert into public.dispatch_bookings(booking_id,tenant_id,rider_profile_id,current_driver_profile_id,status)
 values('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','accepted');
insert into public.driver_evidence(tenant_id,driver_profile_id,evidence_type,storage_bucket,storage_path,mime_type,review_status)
 values('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','personal_photo',
 'driver-application-files','10000000-0000-4000-8000-000000000001/user/profile.jpg','image/jpeg','approved');
update public.rider_profiles set photo_storage_bucket='rider-profile-photos', photo_mime_type='image/png',
 photo_storage_path=tenant_id::text||'/'||rider_profile_id::text||'/profile.png';
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.check_photo('Rider sees profile only',public.my_trip_participant_photo('90000000-0000-4000-8000-000000000001','rider')->'photo'->>'path' like '%/profile.jpg');
select pg_temp.denied_photo('driver');
reset role;
insert into public.driver_evidence(tenant_id,driver_profile_id,evidence_type,storage_bucket,storage_path,mime_type,review_status,submitted_at)
 values('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','driver_id_photo',
 'driver-application-files','10000000-0000-4000-8000-000000000001/user/identity.jpg','image/jpeg','approved',now()+interval '1 second');
set local role authenticated;
select pg_temp.check_photo('ID never selected',public.my_trip_participant_photo('90000000-0000-4000-8000-000000000001','rider')->'photo'->>'path' like '%/profile.jpg');
reset role;
do $$ declare status_value text; begin
  foreach status_value in array array['pending','rejected'] loop
    update public.driver_evidence set review_status=status_value where evidence_type='personal_photo';
    perform pg_temp.check_photo('unapproved hidden',public.my_trip_participant_photo('90000000-0000-4000-8000-000000000001','rider')->'photo'='null');
  end loop;
end; $$;
update public.driver_evidence set review_status='approved',mime_type='application/pdf' where evidence_type='personal_photo';
select pg_temp.check_photo('PDF hidden',public.my_trip_participant_photo('90000000-0000-4000-8000-000000000001','rider')->'photo'='null');
update public.driver_evidence set mime_type='image/jpeg',expires_on=current_date-1 where evidence_type='personal_photo';
select pg_temp.check_photo('expired hidden',public.my_trip_participant_photo('90000000-0000-4000-8000-000000000001','rider')->'photo'='null');
update public.driver_evidence set expires_on=null where evidence_type='personal_photo';
insert into public.driver_evidence(tenant_id,driver_profile_id,evidence_type,storage_bucket,storage_path,mime_type,review_status,submitted_at)
 values('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','personal_photo',
 'driver-application-files','10000000-0000-4000-8000-000000000001/user/replacement.jpg','image/jpeg','rejected',now()+interval '2 seconds');
select pg_temp.check_photo('latest rejected never resurrects old approved',public.my_trip_participant_photo('90000000-0000-4000-8000-000000000001','rider')->'photo'='null');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.check_photo('Driver sees Rider',public.my_trip_participant_photo('90000000-0000-4000-8000-000000000001','driver')->'photo'->>'bucket'='rider-profile-photos');
select pg_temp.denied_photo('rider');
reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select pg_temp.denied_photo('driver');
reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
do $$ declare status_value text; begin
  foreach status_value in array array['requested','scheduled','cancelled','completed'] loop
    update public.dispatch_bookings set status=status_value where booking_id='90000000-0000-4000-8000-000000000001';
    perform pg_temp.denied_photo('driver');
  end loop;
  foreach status_value in array array['accepted','arrived','in_progress'] loop
    update public.dispatch_bookings set status=status_value where booking_id='90000000-0000-4000-8000-000000000001';
    perform pg_temp.check_photo('active stage',public.my_trip_participant_photo('90000000-0000-4000-8000-000000000001','driver')->'photo' is not null);
  end loop;
end; $$;
update public.dispatch_bookings set current_driver_profile_id='50000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.denied_photo('driver');
reset role;
update public.dispatch_bookings set current_driver_profile_id='50000000-0000-4000-8000-000000000001';
update public.tenants set status='suspended';
set local role authenticated;
select pg_temp.denied_photo('driver');
reset role;
update public.tenants set status='active';
set local role anon;
select pg_temp.denied_photo('driver');
reset role;
select pg_temp.check_photo('audit excludes paths',not metadata::text like '%profile%') from public.tenant_audit_events where event_name='trip.participant_photo_accessed';
rollback;
