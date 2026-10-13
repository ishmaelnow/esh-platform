-- Complete existing appeals without changing rating disclosure or submission windows.
create function public.require_rating_appeal_subject(role_value text, booking_value uuid, slug_value text default null)
returns uuid language plpgsql stable security definer set search_path=public as $$
declare b public.dispatch_bookings; actor uuid:=public.current_person_id();
begin
  select * into b from public.dispatch_bookings where booking_id=booking_value;
  if auth.uid() is null or actor is null or b.booking_id is null or b.status<>'completed'
    or not exists(select 1 from public.tenants where tenant_id=b.tenant_id and status='active') then raise exception 'Rating review unavailable'; end if;
  if role_value='rider' then
    if not exists(select 1 from public.rider_profiles r join public.tenant_configurations c on c.tenant_id=r.tenant_id
      where r.tenant_id=b.tenant_id and r.rider_profile_id=b.rider_profile_id and r.person_id=actor and r.status='active'
      and r.rider_profile_id=public.current_rider_profile_id(b.tenant_id) and c.tenant_slug=lower(btrim(slug_value))) then raise exception 'Rating review unavailable'; end if;
  elsif role_value='driver' then
    if not exists(select 1 from public.driver_profiles d where d.tenant_id=b.tenant_id and d.driver_profile_id=b.current_driver_profile_id
      and d.driver_profile_id=public.current_driver_profile_id() and d.person_id=actor and d.status='active') then raise exception 'Rating review unavailable'; end if;
  else raise exception 'Rating review unavailable'; end if;
  return actor;
end; $$;

create function public.submit_rating_appeal_owned(role_value text, booking_value uuid, reason_value text, tenant_slug text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare b public.dispatch_bookings; r public.trip_ratings; actor uuid; result uuid;
begin
  select * into b from public.dispatch_bookings where booking_id=booking_value for update;
  actor:=public.require_rating_appeal_subject(role_value,booking_value,tenant_slug);
  if reason_value is null or length(btrim(reason_value)) not between 10 and 1000 then raise exception 'Provide a review reason between 10 and 1000 characters'; end if;
  select * into r from public.trip_ratings where tenant_id=b.tenant_id and booking_id=b.booking_id
    and reviewer_type=case role_value when 'rider' then 'driver' else 'rider' end for update;
  if r.rating_id is null then raise exception 'A disclosed received rating is required'; end if;
  -- Recover a previous committed submission even after moderation hid the received rating.
  select rating_appeal_id into result from public.trip_rating_appeals where rating_id=r.rating_id and appellant_person_id=actor and appellant_type=role_value;
  if result is not null then return result; end if;
  if r.moderation_status<>'visible' or not (b.completed_at<=now()-interval '7 days'
    or exists(select 1 from public.trip_ratings own where own.tenant_id=b.tenant_id and own.booking_id=b.booking_id and own.reviewer_type=role_value))
    or (role_value='rider' and r.subject_rider_profile_id is distinct from b.rider_profile_id)
    or (role_value='driver' and r.subject_driver_profile_id is distinct from b.current_driver_profile_id)
    then raise exception 'A disclosed received rating is required'; end if;
  insert into public.trip_rating_appeals(tenant_id,rating_id,booking_id,appellant_person_id,appellant_type,reason)
    values(b.tenant_id,r.rating_id,b.booking_id,actor,role_value,btrim(reason_value)) returning rating_appeal_id into result;
  insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,reason,correlation_id,resource_type,resource_id,metadata)
    values(b.tenant_id,'reputation.rating_appealed','person',actor,'{}','Participant requested a disclosed rating review.',gen_random_uuid(),'trip_rating_appeal',result::text,jsonb_build_object('booking_id',b.booking_id));
  return result;
end; $$;
create or replace function public.submit_my_rider_rating_appeal(target_tenant_slug text,target_booking_id uuid,reason_value text)
returns uuid language sql security definer set search_path=public as $$ select public.submit_rating_appeal_owned('rider',target_booking_id,reason_value,target_tenant_slug); $$;
create or replace function public.submit_my_driver_rating_appeal(target_booking_id uuid,reason_value text)
returns uuid language sql security definer set search_path=public as $$ select public.submit_rating_appeal_owned('driver',target_booking_id,reason_value); $$;

create function public.my_rating_appeal_owned(role_value text,booking_value uuid,tenant_slug text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare actor uuid;
begin
  actor:=public.require_rating_appeal_subject(role_value,booking_value,tenant_slug);
  return (select jsonb_build_object('appealId',a.rating_appeal_id,'bookingId',a.booking_id,'status',a.status,'reason',a.reason,
    'resolutionNotes',a.resolution_notes,'submittedAt',a.submitted_at,'resolvedAt',a.resolved_at)
    from public.trip_rating_appeals a join public.dispatch_bookings b on b.booking_id=a.booking_id and b.tenant_id=a.tenant_id
    where a.booking_id=booking_value and a.appellant_person_id=actor and a.appellant_type=role_value);
end; $$;
-- Preserve existing list contracts, with active ownership and role filtering.
create or replace function public.my_rider_rating_appeals(target_tenant_slug text)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(public.my_rating_appeal_owned('rider',a.booking_id,target_tenant_slug) order by a.submitted_at desc),'[]'::jsonb)
 from public.trip_rating_appeals a join public.tenants t on t.tenant_id=a.tenant_id and t.status='active'
 join public.tenant_configurations c on c.tenant_id=t.tenant_id and c.tenant_slug=lower(btrim(target_tenant_slug))
 join public.rider_profiles r on r.tenant_id=a.tenant_id and r.rider_profile_id=public.current_rider_profile_id(a.tenant_id) and r.status='active'
 join public.dispatch_bookings b on b.tenant_id=a.tenant_id and b.booking_id=a.booking_id and b.rider_profile_id=r.rider_profile_id and b.status='completed'
 where a.appellant_person_id=public.current_person_id() and a.appellant_type='rider'; $$;
create or replace function public.my_driver_rating_appeals()
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(public.my_rating_appeal_owned('driver',a.booking_id) order by a.submitted_at desc),'[]'::jsonb)
 from public.trip_rating_appeals a join public.tenants t on t.tenant_id=a.tenant_id and t.status='active'
 join public.driver_profiles d on d.tenant_id=a.tenant_id and d.driver_profile_id=public.current_driver_profile_id() and d.status='active'
 join public.dispatch_bookings b on b.tenant_id=a.tenant_id and b.booking_id=a.booking_id and b.current_driver_profile_id=d.driver_profile_id and b.status='completed'
 where a.appellant_person_id=public.current_person_id() and a.appellant_type='driver'; $$;

create function public.admin_rating_appeals(tenant_value uuid,status_value text default 'submitted',offset_value integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare total bigint; rows jsonb;
begin
 if auth.uid() is null or public.current_person_id() is null or not coalesce(public.can_manage_dispatch(tenant_value),false)
   or not exists(select 1 from public.tenants where tenant_id=tenant_value and status='active') then raise exception 'Rating review access required'; end if;
 if status_value is null or status_value not in ('all','submitted','upheld','removed') or offset_value is null or offset_value<0 then raise exception 'Invalid review filter'; end if;
 select count(*) into total from public.trip_rating_appeals where tenant_id=tenant_value and (status_value='all' or status=status_value);
 select coalesce(jsonb_agg(jsonb_build_object('appealId',a.rating_appeal_id,'bookingId',a.booking_id,'status',a.status,'reason',a.reason,
  'resolutionNotes',a.resolution_notes,'submittedAt',a.submitted_at,'resolvedAt',a.resolved_at,'appellantType',a.appellant_type,
  'overall',r.overall_rating,'comment',r.comment) order by a.submitted_at,a.rating_appeal_id),'[]'::jsonb) into rows
 from (select * from public.trip_rating_appeals where tenant_id=tenant_value and (status_value='all' or status=status_value)
   order by submitted_at,rating_appeal_id limit 50 offset offset_value) a
 join public.trip_ratings r on r.rating_id=a.rating_id and r.tenant_id=a.tenant_id;
 return jsonb_build_object('total',total,'appeals',rows);
end; $$;
create or replace function public.resolve_trip_rating_appeal(target_appeal_id uuid,resolution_value text,resolution_notes_value text)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.trip_rating_appeals; actor uuid:=public.current_person_id();
begin
 select * into a from public.trip_rating_appeals where rating_appeal_id=target_appeal_id for update;
 if auth.uid() is null or actor is null or a.rating_appeal_id is null or not coalesce(public.can_manage_dispatch(a.tenant_id),false)
   or not exists(select 1 from public.tenants where tenant_id=a.tenant_id and status='active') then raise exception 'Rating review access required'; end if;
 if resolution_value is null or resolution_value not in ('upheld','removed') or resolution_notes_value is null or length(btrim(resolution_notes_value)) not between 5 and 1000 then raise exception 'Choose a decision and provide an explanation'; end if;
 if a.status<>'submitted' then
   if a.status=resolution_value and a.resolution_notes=btrim(resolution_notes_value) then return true; end if;
   raise exception 'This review was already resolved. Refresh to see the decision';
 end if;
 update public.trip_rating_appeals set status=resolution_value,resolution_notes=btrim(resolution_notes_value),resolved_by_person_id=actor,resolved_at=now() where rating_appeal_id=a.rating_appeal_id;
 if resolution_value='removed' then update public.trip_ratings set moderation_status='hidden',moderation_reason='Removed after rating review',moderated_by_person_id=actor,moderated_at=now() where tenant_id=a.tenant_id and rating_id=a.rating_id; end if;
 insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,reason,correlation_id,resource_type,resource_id,metadata)
 values(a.tenant_id,'reputation.rating_appeal_resolved','person',actor,'{}','Operator resolved a rating review.',gen_random_uuid(),'trip_rating_appeal',a.rating_appeal_id::text,jsonb_build_object('resolution',resolution_value));
 return true;
end; $$;
revoke all on function public.require_rating_appeal_subject(text,uuid,text),public.submit_rating_appeal_owned(text,uuid,text,text),public.my_rating_appeal_owned(text,uuid,text),public.admin_rating_appeals(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.submit_my_rider_rating_appeal(text,uuid,text),public.submit_my_driver_rating_appeal(uuid,text),public.my_rider_rating_appeals(text),public.my_driver_rating_appeals(),public.resolve_trip_rating_appeal(uuid,text,text) from public,anon,authenticated;
grant execute on function public.my_rating_appeal_owned(text,uuid,text),public.admin_rating_appeals(uuid,text,integer),public.submit_my_rider_rating_appeal(text,uuid,text),public.submit_my_driver_rating_appeal(uuid,text),public.my_rider_rating_appeals(text),public.my_driver_rating_appeals(),public.resolve_trip_rating_appeal(uuid,text,text) to authenticated;
