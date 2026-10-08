-- Run only in the isolated bootstrap database; never against production.
begin;
do $$
declare person_value uuid := '10000000-0000-4000-8000-000000000001';
  tenant_value uuid := '40000000-0000-4000-8000-000000000001';
  rider_value uuid := '30000000-0000-4000-8000-000000000001';
  fresh uuid; first_future uuid; second_future uuid; other_future uuid; result integer;
begin
  if (select count(*) from public.dispatch_bookings where status in ('requested','accepted'))<>2 then
    raise exception 'Legacy rides were modified'; end if;
  if (select count(*) from public.rider_active_booking_slots)<>1 then raise exception 'Invalid backfill'; end if;
  perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
  if not public.my_rider_has_active_booking() then raise exception 'Own pending ride not found'; end if;
  perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
  if public.my_rider_has_active_booking() then raise exception 'Other account ride leaked'; end if;
  begin
    insert into public.dispatch_bookings(tenant_id,rider_profile_id,status) values(tenant_value,rider_value,'requested');
    raise exception 'Another active booking was accepted';
  exception when sqlstate 'P5501' then null; end;
  update public.dispatch_bookings set status='in_progress' where booking_id='50000000-0000-4000-8000-000000000001';
  update public.dispatch_bookings set status='completed' where booking_id='50000000-0000-4000-8000-000000000001';
  if not exists(select 1 from public.rider_active_booking_slots where person_id=person_value
    and booking_id='50000000-0000-4000-8000-000000000002') then raise exception 'Legacy slot lost'; end if;
  update public.dispatch_bookings set status='cancelled' where booking_id='50000000-0000-4000-8000-000000000002';
  insert into public.dispatch_bookings(tenant_id,rider_profile_id,status)
    values(tenant_value,rider_value,'requested') returning booking_id into fresh;
  begin
    insert into public.dispatch_bookings(tenant_id,rider_profile_id,status)
      values('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','offered');
    raise exception 'Second-provider booking accepted';
  exception when sqlstate 'P5501' then null; end;
  insert into public.dispatch_bookings(tenant_id,rider_profile_id,status,dispatch_ready_at)
    values(tenant_value,rider_value,'scheduled',now()-interval '2 minutes') returning booking_id into first_future;
  insert into public.dispatch_bookings(tenant_id,rider_profile_id,status,dispatch_ready_at)
    values(tenant_value,rider_value,'scheduled',now()-interval '1 minute') returning booking_id into second_future;
  insert into public.dispatch_bookings(tenant_id,rider_profile_id,status,dispatch_ready_at)
    values(tenant_value,'30000000-0000-4000-8000-000000000003','scheduled',now()) returning booking_id into other_future;
  result := public.activate_all_due_scheduled_bookings();
  if result<>1 or (select status from public.dispatch_bookings where booking_id=other_future)<>'requested' then
    raise exception 'Blocked Rider stalled other scheduled trips'; end if;
  if (select status from public.dispatch_bookings where booking_id=first_future)<>'scheduled' then raise exception 'Busy reservation activated'; end if;
  update public.dispatch_bookings set status='cancelled' where booking_id=fresh;
  result := public.activate_all_due_scheduled_bookings();
  if result<>1 or (select status from public.dispatch_bookings where booking_id=first_future)<>'requested'
    or (select status from public.dispatch_bookings where booking_id=second_future)<>'scheduled' then
    raise exception 'Due activation violated one-ride limit'; end if;
  begin
    update public.dispatch_bookings set rider_profile_id='30000000-0000-4000-8000-000000000003' where booking_id=first_future;
    raise exception 'Active identity reassignment accepted';
  exception when sqlstate 'P5501' then null; end;
  update public.dispatch_bookings set status='completed' where booking_id=first_future;
  if public.activate_all_due_scheduled_bookings()<>1 then raise exception 'Next reservation failed to activate'; end if;
end; $$;
set local role authenticated;
do $$ begin
  begin perform 1 from public.rider_active_booking_slots; raise exception 'Private slot exposed';
  exception when insufficient_privilege then null; end;
  begin perform public.activate_unblocked_rider_bookings_internal(null); raise exception 'Private scheduler exposed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.activate_due_scheduled_bookings(null);
    raise exception 'Null tenant bypassed scheduling authorization';
  exception when raise_exception then
    if sqlerrm <> 'dispatch access is required' then raise; end if;
  end;
end; $$;
reset role;
rollback;
