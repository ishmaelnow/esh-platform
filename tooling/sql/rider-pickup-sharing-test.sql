begin;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare booking uuid := '50000000-0000-4000-8000-000000000001';
begin
  if public.my_rider_pickup_sharing(booking) then raise exception 'Default sharing was enabled'; end if;
  begin
    perform public.update_my_rider_pickup_location(booking,32.78,-96.8,10,now());
    raise exception 'Location published without consent';
  exception when raise_exception then if sqlerrm='Location published without consent' then raise; end if; end;
  if not public.set_my_rider_pickup_sharing(booking,true) then raise exception 'Consent failed'; end if;
  perform public.update_my_rider_pickup_location(booking,32.78,-96.8,10,now());
  begin perform public.update_my_rider_pickup_location(booking,100,-96.8,10,now());
    raise exception 'Invalid coordinates accepted';
  exception when raise_exception then if sqlerrm='Invalid coordinates accepted' then raise; end if; end;
  begin perform public.update_my_rider_pickup_location(booking,32.78,-96.8,10,now()-interval '3 minutes');
    raise exception 'Old timestamp accepted';
  exception when raise_exception then if sqlerrm='Old timestamp accepted' then raise; end if; end;
  begin perform 1 from public.rider_pickup_locations; raise exception 'Raw coordinate table exposed';
  exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
do $$ begin
  if (public.my_driver_rider_pickup_location('50000000-0000-4000-8000-000000000001')->>'latitude') is distinct from '32.78' then
    raise exception 'Assigned driver cannot see location'; end if;
end; $$;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
do $$ begin
  if public.my_driver_rider_pickup_location('50000000-0000-4000-8000-000000000001') is not null then
    raise exception 'Other driver exposed location'; end if;
end; $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);
do $$ begin
  if public.my_driver_rider_pickup_location('50000000-0000-4000-8000-000000000001') is not null then
    raise exception 'Other tenant driver exposed location'; end if;
end; $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
do $$ begin
  begin perform public.set_my_rider_pickup_sharing('50000000-0000-4000-8000-000000000001',false);
    raise exception 'Other rider modified consent';
  exception when raise_exception then if sqlerrm='Other rider modified consent' then raise; end if; end;
end; $$;
reset role;
update public.rider_pickup_locations set recorded_at=now()-interval '61 seconds';
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
do $$ begin if public.my_driver_rider_pickup_location('50000000-0000-4000-8000-000000000001') is not null then
  raise exception 'Stale snapshot exposed'; end if; end; $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select public.set_my_rider_pickup_sharing('50000000-0000-4000-8000-000000000001',false);
do $$ begin if exists(select 1 from public.rider_pickup_locations) then raise exception 'Stop retained coordinates'; end if; end; $$;
select public.set_my_rider_pickup_sharing('50000000-0000-4000-8000-000000000001',true);
select public.update_my_rider_pickup_location('50000000-0000-4000-8000-000000000001',32.78,-96.8,10,now());
update public.dispatch_bookings set current_driver_profile_id='60000000-0000-4000-8000-000000000002'
where booking_id='50000000-0000-4000-8000-000000000001';
do $$ begin if exists(select 1 from public.rider_pickup_locations) then raise exception 'Consent survived reassignment'; end if; end; $$;
select public.set_my_rider_pickup_sharing('50000000-0000-4000-8000-000000000001',true);
update public.dispatch_bookings set status='in_progress' where booking_id='50000000-0000-4000-8000-000000000001';
do $$ begin if exists(select 1 from public.rider_pickup_locations) then raise exception 'Consent survived trip start'; end if;
  if not exists(select 1 from public.tenant_audit_events where event_name='rider.pickup_sharing_stopped') then
    raise exception 'Automatic stop not audited'; end if;
end; $$;
set local role anon;
do $$ begin
  begin perform public.my_driver_rider_pickup_location('50000000-0000-4000-8000-000000000001');
    raise exception 'Anonymous location RPC allowed'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
