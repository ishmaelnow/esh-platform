-- Disposable database only. Rollback fixture; no production messages or rides.
begin;
create function pg_temp.preorder_assert(label text,condition boolean) returns void language plpgsql as $$
begin if condition is not true then raise exception 'Preorder assertion failed: %',label; end if; end; $$;
create function pg_temp.preorder_booking(id_value uuid,offset_value interval) returns void language sql as $$
  insert into public.dispatch_bookings(booking_id,tenant_id,service_area_id,rider_profile_id,status,
    scheduled_pickup_at,dispatch_ready_at,price_quote_id,final_fare_minor,fare_currency_code,route_duration_seconds,pickup_address,destination_address)
  values(id_value,'10000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001','scheduled',now()+offset_value,now()+offset_value-interval '30 minutes',
    gen_random_uuid(),2500,'USD',1800,'Private pickup','Private destination');
$$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"session_id":"60000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select public.set_my_native_push('driver','70000000-0000-4000-8000-000000000002','ios',true,repeat('b',64),null,'20000000-0000-4000-8000-000000000002');
select public.set_my_driver_trip_email_preferences(false);
reset role;
insert into public.dispatch_bookings(booking_id,tenant_id,service_area_id,rider_profile_id,status,
  scheduled_pickup_at,dispatch_ready_at,price_quote_id,final_fare_minor,fare_currency_code,route_duration_seconds,pickup_address,destination_address)
values('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 '80000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','scheduled',
 now()+interval '2 days',now()+interval '2 days'-interval '30 minutes',gen_random_uuid(),2500,'USD',1800,'Private pickup','Private destination');
select pg_temp.preorder_assert('Preorder optional email mask preserves mobile-only consent',not email_delivery_enabled)
  from public.notification_outbox where notification_type='driver_preorder_available' and driver_profile_id='50000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.preorder_assert('New list excludes addresses',public.my_driver_preorders()->'new'->0->>'pickupAddress' is null);
select public.reserve_my_driver_preorder('90000000-0000-4000-8000-000000000001');
select public.reserve_my_driver_preorder('90000000-0000-4000-8000-000000000001');
select pg_temp.preorder_assert('Assigned list owns addresses',(public.my_driver_preorders()->'assigned'->0->>'pickupAddress')='Private pickup');
reset role;
set local role service_role;
select pg_temp.preorder_assert('Stale available alerts suppressed at native claim',not exists(
  select 1 from jsonb_array_elements(public.claim_native_push_attempts()) c where c->>'notificationType'='driver_preorder_available'));
reset role;
select pg_temp.preorder_assert('Reservation idempotent and does not make active trip',count(*)=1) from public.driver_preorder_reservations where status='reserved';
select pg_temp.preorder_assert('Booking stays scheduled',status='scheduled' and current_driver_profile_id is null) from public.dispatch_bookings;
select pg_temp.preorder_booking('90000000-0000-4000-8000-000000000002',interval '2 days 10 minutes');
set local role authenticated;
do $$ begin
  begin perform public.reserve_my_driver_preorder('90000000-0000-4000-8000-000000000002'); raise exception 'Overlap allowed' using errcode='XX000'; exception when raise_exception then null; end;
end; $$;
reset role;
update public.dispatch_bookings set status='cancelled' where booking_id='90000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
set local role authenticated;
do $$ begin
  begin perform public.reserve_my_driver_preorder('90000000-0000-4000-8000-000000000001'); raise exception 'Duplicate reservation allowed' using errcode='XX000'; exception when raise_exception then null; end;
  begin perform public.release_my_driver_preorder('90000000-0000-4000-8000-000000000001'); raise exception 'Foreign release allowed' using errcode='XX000'; exception when raise_exception then null; end;
  begin update public.driver_preorder_reservations set status='released'; raise exception 'Direct write allowed' using errcode='XX000'; exception when insufficient_privilege then null; end;
  begin perform public.admin_driver_preorders('10000000-0000-4000-8000-000000000001'); raise exception 'Driver admin read allowed' using errcode='XX000'; exception when raise_exception then null; end;
end; $$;
select pg_temp.preorder_assert('Other Driver cannot read reservation row',not exists(select 1 from public.driver_preorder_reservations));
reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.set_my_driver_preorder_settings(true);
reset role;
select pg_temp.preorder_assert('Offline setting does not change availability',requested_status='online') from public.driver_availability where driver_profile_id='50000000-0000-4000-8000-000000000001';
-- Driver already working on another ride: reservation itself did not lock their status.
update public.dispatch_bookings set dispatch_ready_at=now()-interval '1 minute' where booking_id='90000000-0000-4000-8000-000000000001';
select public.activate_all_due_scheduled_bookings();
select pg_temp.preorder_assert('Priority offer preserves normal dispatch',status='offered' and current_driver_profile_id is null) from public.dispatch_bookings where booking_id='90000000-0000-4000-8000-000000000001';
select pg_temp.preorder_assert('Only reserved Driver gets priority',count(*)=1 and bool_and(driver_profile_id='50000000-0000-4000-8000-000000000001'::uuid)) from public.dispatch_offers;
select pg_temp.preorder_assert('Reservation consumed exactly once',status='dispatched') from public.driver_preorder_reservations;
select public.activate_all_due_scheduled_bookings();
select pg_temp.preorder_assert('Repeated activation creates no duplicate offer',count(*)=1) from public.dispatch_offers;
update public.dispatch_offers set status='declined',responded_at=now();
update public.dispatch_bookings set status='requested' where booking_id='90000000-0000-4000-8000-000000000001';
select pg_temp.preorder_assert('Declined priority moves to another eligible Driver',count(*)=1 and bool_and(driver_profile_id='50000000-0000-4000-8000-000000000002'::uuid)) from public.dispatch_offers where status='pending';
update public.dispatch_offers set status='cancelled',responded_at=now() where status='pending';
update public.dispatch_bookings set status='cancelled';
-- Offline reservation is allowed, but pickup dispatch must fall back to an online Driver.
update public.driver_availability set requested_status='offline' where driver_profile_id='50000000-0000-4000-8000-000000000001';
select pg_temp.preorder_booking('90000000-0000-4000-8000-000000000003',interval '3 days');
set local role authenticated;
select public.reserve_my_driver_preorder('90000000-0000-4000-8000-000000000003');
reset role;
update public.dispatch_bookings set dispatch_ready_at=now()-interval '1 minute' where booking_id='90000000-0000-4000-8000-000000000003';
select public.activate_all_due_scheduled_bookings();
select pg_temp.preorder_assert('Offline Driver reservation released',status='released') from public.driver_preorder_reservations where booking_id='90000000-0000-4000-8000-000000000003';
select pg_temp.preorder_assert('Offline priority falls back to online candidate',driver_profile_id='50000000-0000-4000-8000-000000000002'::uuid)
  from public.dispatch_offers where booking_id='90000000-0000-4000-8000-000000000003' and status='pending';
update public.dispatch_offers set status='cancelled',responded_at=now() where status='pending';
update public.dispatch_bookings set status='cancelled' where booking_id='90000000-0000-4000-8000-000000000003';
-- Release leaves the Rider booking intact; cancellation removes any remaining reservation.
select pg_temp.preorder_booking('90000000-0000-4000-8000-000000000004',interval '4 days');
set local role authenticated;
select public.reserve_my_driver_preorder('90000000-0000-4000-8000-000000000004');
select public.release_my_driver_preorder('90000000-0000-4000-8000-000000000004');
reset role;
select pg_temp.preorder_assert('Release preserves scheduled booking',status='scheduled') from public.dispatch_bookings where booking_id='90000000-0000-4000-8000-000000000004';
set local role authenticated;
select public.reserve_my_driver_preorder('90000000-0000-4000-8000-000000000004');
reset role;
update public.dispatch_bookings set status='cancelled' where booking_id='90000000-0000-4000-8000-000000000004';
select pg_temp.preorder_assert('Rider cancellation closes reservation',not exists(select 1 from public.driver_preorder_reservations where booking_id='90000000-0000-4000-8000-000000000004' and status='reserved'));
-- Existing person-wide Rider guard must postpone activation without consuming the reservation.
select pg_temp.preorder_booking('90000000-0000-4000-8000-000000000005',interval '5 days');
set local role authenticated;
select public.reserve_my_driver_preorder('90000000-0000-4000-8000-000000000005');
reset role;
update public.tenant_matching_settings set automatic_matching_enabled=false;
insert into public.dispatch_bookings(tenant_id,rider_profile_id,status) values
  ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','requested');
update public.dispatch_bookings set dispatch_ready_at=now()-interval '1 minute' where booking_id='90000000-0000-4000-8000-000000000005';
select public.activate_all_due_scheduled_bookings();
select pg_temp.preorder_assert('Active Rider guard keeps future booking scheduled',status='scheduled') from public.dispatch_bookings where booking_id='90000000-0000-4000-8000-000000000005';
select pg_temp.preorder_assert('Blocked activation preserves reservation',status='reserved') from public.driver_preorder_reservations where booking_id='90000000-0000-4000-8000-000000000005';
-- A different tenant cannot become visible or reservable through either list or mutation.
insert into public.tenants values('10000000-0000-4000-8000-000000000002','active',now());
insert into public.service_areas values('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Foreign area','active');
insert into public.dispatch_bookings(booking_id,tenant_id,service_area_id,status,scheduled_pickup_at,dispatch_ready_at,price_quote_id,final_fare_minor)
values('90000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000002',
  'scheduled',now()+interval '9 days',now()+interval '9 days'-interval '30 minutes',gen_random_uuid(),2500);
set local role authenticated;
do $$ begin
  begin perform public.reserve_my_driver_preorder('90000000-0000-4000-8000-000000000099'); raise exception 'Foreign tenant reservation allowed' using errcode='XX000'; exception when raise_exception then null; end;
end; $$;
select pg_temp.preorder_assert('Foreign tenant excluded from lists',not exists(select 1 from jsonb_array_elements(public.my_driver_preorders()->'new') b where b->>'bookingId'='90000000-0000-4000-8000-000000000099'));
reset role;
set local role anon;
do $$ begin
  begin perform public.my_driver_preorders(); raise exception 'Anonymous list allowed' using errcode='XX000'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
select pg_temp.preorder_assert('Reservation audited',exists(select 1 from public.tenant_audit_events where event_name='driver.preorder_reserved'));
rollback;
