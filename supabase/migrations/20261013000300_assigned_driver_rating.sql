-- An active assigned Rider sees only the Driver's tenant-scoped disclosed aggregate.
-- No general Driver lookup, raw-rating grant, historical booking exposure or matching change.
create function public.rider_assigned_driver_rating(booking_value uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('average',summary.average,'count',summary.count)
  from public.dispatch_bookings current_booking
  join public.tenants t on t.tenant_id=current_booking.tenant_id and t.status='active'
  join public.rider_profiles viewer on viewer.tenant_id=t.tenant_id
    and viewer.rider_profile_id=current_booking.rider_profile_id and viewer.status='active'
  join public.person_profiles person on person.person_id=viewer.person_id
    and person.status='active' and person.auth_user_id=auth.uid()
  join public.driver_profiles driver on driver.tenant_id=t.tenant_id
    and driver.driver_profile_id=current_booking.current_driver_profile_id and driver.status='active'
  cross join lateral (
    select round(avg(r.overall_rating)::numeric,2) as average,count(*) as count
    from public.trip_ratings r
    join public.dispatch_bookings history on history.tenant_id=r.tenant_id and history.booking_id=r.booking_id
    where r.tenant_id=t.tenant_id and r.subject_driver_profile_id=driver.driver_profile_id
      and r.reviewer_type='rider' and r.moderation_status='visible'
      and history.status='completed' and history.completed_at<=now()
      and history.current_driver_profile_id=driver.driver_profile_id
      and (history.completed_at<=now()-interval '7 days' or exists(select 1 from public.trip_ratings reciprocal
        where reciprocal.tenant_id=r.tenant_id and reciprocal.booking_id=r.booking_id and reciprocal.reviewer_type='driver'))
  ) summary
  where current_booking.booking_id=booking_value and current_booking.status in ('accepted','arrived','in_progress')
    and auth.uid() is not null and viewer.person_id=public.current_person_id()
    and viewer.rider_profile_id=public.current_rider_profile_id(t.tenant_id);
$$;
revoke all on function public.rider_assigned_driver_rating(uuid) from public,anon,authenticated;

-- Preserve the current portal implementation and add the summary to its existing Driver object.
-- The response snapshot keeps the assignment and aggregate together; the helper is not client callable.
do $$ declare definition text; anchor text;
begin
  definition:=pg_get_functiondef('public.my_rider_portal(text)'::regprocedure);
  anchor:='''driverNumber'', driver.driver_number';
  if strpos(definition,anchor)=0 then raise exception 'Expected Rider portal assignment projection missing'; end if;
  if strpos(definition,'''ratingSummary''')>0 then raise exception 'Rider rating projection already exists'; end if;
  execute replace(definition,anchor,anchor||',''ratingSummary'', case when booking.status in (''accepted'',''arrived'',''in_progress'')'
    || ' then public.rider_assigned_driver_rating(booking.booking_id) else null end');
end; $$;
