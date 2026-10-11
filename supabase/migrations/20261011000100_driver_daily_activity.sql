-- Read-only aggregates; never expose coordinates or another Driver's audit history.
create index if not exists driver_availability_audit_daily_idx
  on public.tenant_audit_events(tenant_id,resource_id,occurred_at)
  where event_name='driver.availability_changed' and resource_type='driver_profile';

create function public.my_driver_daily_activity() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  driver_value uuid:=public.require_preorder_driver();
  tenant_value uuid; zone_value text; day_value date;
  start_value timestamptz; end_value timestamptz;
  trips_value integer; missing_value integer; meters_value bigint;
  seconds_value bigint; latest_status text; current_status text;
begin
  select d.tenant_id,coalesce(c.default_time_zone,'UTC') into tenant_value,zone_value
    from public.driver_profiles d left join public.tenant_configurations c on c.tenant_id=d.tenant_id
    where d.driver_profile_id=driver_value;
  day_value:=(now() at time zone zone_value)::date;
  start_value:=day_value::timestamp at time zone zone_value;
  end_value:=(day_value+1)::timestamp at time zone zone_value;
  select count(*),count(*) filter(where actual_route_distance_meters is null
      or route_metrics_source is distinct from 'driver_location_aggregate'),
    coalesce(sum(actual_route_distance_meters) filter(where route_metrics_source='driver_location_aggregate'),0)
    into trips_value,missing_value,meters_value
    from public.dispatch_bookings where tenant_id=tenant_value
      and current_driver_profile_id=driver_value and status='completed'
      and completed_at>=start_value and completed_at<end_value and completed_at<=now();

  -- Availability is a server setting, not proof of connectivity or historical eligibility.
  -- Keep the final event preceding midnight to carry an overnight interval forward.
  with events as (
    select occurred_at,created_at,audit_event_id,metadata->>'requested_status' as status
      from public.tenant_audit_events where tenant_id=tenant_value
      and resource_type='driver_profile' and resource_id=driver_value::text
      and event_name='driver.availability_changed' and occurred_at<=now()
      and metadata->>'requested_status' in ('online','offline')
  ), relevant as (
    (select * from events where occurred_at<start_value
      order by occurred_at desc,created_at desc,audit_event_id desc limit 1)
    union all select * from events where occurred_at>=start_value
  ), spans as (
    select *,lead(occurred_at,1,now()) over(order by occurred_at,created_at,audit_event_id) as ends_at
      from relevant
  ) select coalesce(sum(extract(epoch from greatest(interval '0',
      least(ends_at,end_value,now())-greatest(occurred_at,start_value)))) filter(where status='online'),0)::bigint
    into seconds_value from spans;
  select metadata->>'requested_status' into latest_status from public.tenant_audit_events
    where tenant_id=tenant_value and resource_type='driver_profile' and resource_id=driver_value::text
      and event_name='driver.availability_changed' and occurred_at<=now()
      and metadata->>'requested_status' in ('online','offline')
    order by occurred_at desc,created_at desc,audit_event_id desc limit 1;
  select requested_status into current_status from public.driver_availability
    where tenant_id=tenant_value and driver_profile_id=driver_value;
  -- Missing/inconsistent history must never appear as a fabricated zero.
  if latest_status is distinct from current_status then seconds_value:=null; end if;
  if latest_status is null and coalesce(current_status,'offline')='offline' then seconds_value:=0; end if;
  return jsonb_build_object('driverProfileId',driver_value,'timeZone',zone_value,'localDate',day_value,
    'startsAt',start_value,'endsAt',end_value,'asOf',now(),'completedTrips',trips_value,
    'distanceMeters',case when missing_value=0 then meters_value else null end,
    'missingDistanceTrips',missing_value,'onlineSeconds',seconds_value);
end; $$;
revoke all on function public.my_driver_daily_activity() from public,anon,authenticated;
grant execute on function public.my_driver_daily_activity() to authenticated;
