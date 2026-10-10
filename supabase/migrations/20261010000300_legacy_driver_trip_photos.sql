-- Historical Driver evidence paths need not start with tenant_id. Ownership comes from
-- the tenant-scoped, assigned Driver's latest personal_photo record, never a client path.
create or replace function public.my_trip_participant_photo(booking_value uuid,role_value text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare b public.dispatch_bookings; e public.driver_evidence; r public.rider_profiles;
  actor uuid; result jsonb := null;
begin
  perform 1 from public.dispatch_bookings where booking_id=booking_value for share;
  actor := public.require_trip_message_access(booking_value,role_value);
  select * into b from public.dispatch_bookings where booking_id=booking_value;
  if role_value='rider' then
    select * into e from public.driver_evidence
      where tenant_id=b.tenant_id and driver_profile_id=b.current_driver_profile_id
        and evidence_type='personal_photo'
      order by submitted_at desc,created_at desc,evidence_id desc limit 1;
    if e.review_status='approved' and e.mime_type in ('image/jpeg','image/png')
      and (e.expires_on is null or e.expires_on>=current_date)
      and e.storage_bucket='driver-application-files'
      and length(btrim(e.storage_path))>0 then
      result := jsonb_build_object('bucket',e.storage_bucket,'path',e.storage_path);
    end if;
  else
    select * into r from public.rider_profiles
      where tenant_id=b.tenant_id and rider_profile_id=b.rider_profile_id;
    if r.photo_storage_bucket='rider-profile-photos' and r.photo_mime_type in ('image/jpeg','image/png')
      and r.photo_storage_path like b.tenant_id::text||'/'||r.rider_profile_id::text||'/%' then
      result := jsonb_build_object('bucket',r.photo_storage_bucket,'path',r.photo_storage_path);
    end if;
  end if;
  if result is not null then
    insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,
      reason,correlation_id,resource_type,resource_id,metadata)
    values(b.tenant_id,'trip.participant_photo_accessed','person',actor,'{}','Active trip participant requested a profile photo.',
      gen_random_uuid(),'dispatch_booking',b.booking_id::text,jsonb_build_object('viewer_role',role_value));
  end if;
  return jsonb_build_object('photo',result,'assignment',b.current_driver_profile_id,'rider',b.rider_profile_id,'tenant',b.tenant_id);
end; $$;
revoke all on function public.my_trip_participant_photo(uuid,text) from public,anon;
grant execute on function public.my_trip_participant_photo(uuid,text) to authenticated;
