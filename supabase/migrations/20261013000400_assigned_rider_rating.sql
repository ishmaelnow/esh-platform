-- Only the current assigned Driver can see a Rider's tenant-scoped disclosed aggregate.
create function public.driver_assigned_rider_rating(booking_value uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('average',summary.average,'count',summary.count)
  from public.dispatch_bookings current_booking
  join public.tenants t on t.tenant_id=current_booking.tenant_id and t.status='active'
  join public.driver_profiles viewer on viewer.tenant_id=t.tenant_id
    and viewer.driver_profile_id=current_booking.current_driver_profile_id and viewer.status='active'
  join public.person_profiles person on person.person_id=viewer.person_id
    and person.status='active' and person.auth_user_id=auth.uid()
  join public.rider_profiles rider on rider.tenant_id=t.tenant_id
    and rider.rider_profile_id=current_booking.rider_profile_id and rider.status='active'
  cross join lateral (
    select round(avg(r.overall_rating)::numeric,2) as average,count(*) as count
    from public.trip_ratings r
    join public.dispatch_bookings history on history.tenant_id=r.tenant_id and history.booking_id=r.booking_id
    join public.driver_profiles historical_driver on historical_driver.tenant_id=r.tenant_id
      and historical_driver.driver_profile_id=history.current_driver_profile_id
      and historical_driver.person_id=r.reviewer_person_id
    where r.tenant_id=t.tenant_id and r.subject_rider_profile_id=rider.rider_profile_id
      and r.reviewer_type='driver' and r.moderation_status='visible'
      and history.status='completed' and history.completed_at<=now()
      and history.rider_profile_id=rider.rider_profile_id
      and (history.completed_at<=now()-interval '7 days' or exists(select 1 from public.trip_ratings reciprocal
        where reciprocal.tenant_id=r.tenant_id and reciprocal.booking_id=r.booking_id and reciprocal.reviewer_type='rider'))
  ) summary
  where current_booking.booking_id=booking_value and current_booking.status in ('accepted','arrived','in_progress')
    and auth.uid() is not null and viewer.person_id=public.current_person_id()
    and viewer.driver_profile_id=public.current_driver_profile_id();
$$;
revoke all on function public.driver_assigned_rider_rating(uuid) from public,anon,authenticated;

-- Extend only the existing active trips projection, never the offer projection.
do $$ declare definition text; anchor text;
begin
  definition:=pg_get_functiondef('public.my_driver_dispatch()'::regprocedure);
  anchor:='''bookingId'', booking.booking_id, ''customerName'', booking.customer_name,';
  if strpos(definition,anchor)=0 then raise exception 'Expected Driver active trip projection missing'; end if;
  if strpos(definition,'''riderRatingSummary''')>0 then raise exception 'Driver Rider-rating projection already exists'; end if;
  execute replace(definition,anchor,anchor||E'\n      ''riderRatingSummary'', public.driver_assigned_rider_rating(booking.booking_id),');
end; $$;
