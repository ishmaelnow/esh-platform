-- Optional, assignment-bound foreground Rider location; no movement history.
create table public.rider_pickup_locations (
  booking_id uuid primary key,
  tenant_id uuid not null,
  driver_profile_id uuid not null references public.driver_profiles(driver_profile_id),
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  recorded_at timestamptz,
  consented_at timestamptz not null default now(),
  foreign key (tenant_id,booking_id) references public.dispatch_bookings(tenant_id,booking_id) on delete cascade,
  check (num_nonnulls(latitude,longitude,accuracy_meters,recorded_at) in (0,4)),
  check ((latitude is null and longitude is null and accuracy_meters is null and recorded_at is null)
    or (latitude between -90 and 90 and longitude between -180 and 180
      and accuracy_meters between 0 and 10000 and recorded_at is not null))
);
alter table public.rider_pickup_locations enable row level security;
revoke all on public.rider_pickup_locations from public,anon,authenticated;
grant all on public.rider_pickup_locations to service_role;

create function public.my_rider_pickup_sharing(target_booking_id uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare trip public.dispatch_bookings;
begin
  select * into trip from public.dispatch_bookings where booking_id=target_booking_id;
  if auth.uid() is null or trip.rider_profile_id is distinct from public.current_rider_profile_id(trip.tenant_id)
    or trip.rider_profile_id is null then raise exception 'Your trip is unavailable'; end if;
  return trip.status in ('accepted','arrived') and exists(select 1 from public.rider_pickup_locations
    where booking_id=trip.booking_id and driver_profile_id=trip.current_driver_profile_id);
end; $$;

create function public.set_my_rider_pickup_sharing(target_booking_id uuid, enabled_value boolean)
returns boolean language plpgsql security definer set search_path=public as $$
declare trip public.dispatch_bookings; changed boolean := false;
begin
  select * into trip from public.dispatch_bookings where booking_id=target_booking_id for update;
  if auth.uid() is null or trip.rider_profile_id is null
    or trip.rider_profile_id is distinct from public.current_rider_profile_id(trip.tenant_id) then
    raise exception 'Your trip is unavailable'; end if;
  if enabled_value is null then raise exception 'Choose a sharing preference'; end if;
  if enabled_value then
    if trip.status not in ('accepted','arrived') or trip.current_driver_profile_id is null
      or not exists(select 1 from public.driver_profiles where driver_profile_id=trip.current_driver_profile_id and tenant_id=trip.tenant_id) then
      raise exception 'Location sharing is available only with your assigned Driver before pickup'; end if;
    insert into public.rider_pickup_locations(booking_id,tenant_id,driver_profile_id)
      values(trip.booking_id,trip.tenant_id,trip.current_driver_profile_id) on conflict do nothing;
    changed := found;
  else
    delete from public.rider_pickup_locations where booking_id=trip.booking_id;
    changed := found;
  end if;
  if changed then
    insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,
      reason,correlation_id,resource_type,resource_id,metadata)
    values(trip.tenant_id,case when enabled_value then 'rider.pickup_sharing_enabled' else 'rider.pickup_sharing_disabled' end,
      'person',public.current_person_id(),'{}','Rider changed optional pickup sharing.',gen_random_uuid(),
      'booking',trip.booking_id::text,jsonb_build_object('enabled',enabled_value));
  end if;
  return public.my_rider_pickup_sharing(target_booking_id);
end; $$;

create function public.update_my_rider_pickup_location(target_booking_id uuid, latitude_value double precision,
  longitude_value double precision, accuracy_meters_value double precision, recorded_at_value timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare trip public.dispatch_bookings;
begin
  select * into trip from public.dispatch_bookings where booking_id=target_booking_id for update;
  if auth.uid() is null or trip.rider_profile_id is null
    or trip.rider_profile_id is distinct from public.current_rider_profile_id(trip.tenant_id)
    or trip.status not in ('accepted','arrived') then raise exception 'Your pickup sharing is unavailable'; end if;
  if latitude_value is null or longitude_value is null or accuracy_meters_value is null or recorded_at_value is null
    or not (latitude_value between -90 and 90 and longitude_value between -180 and 180
      and accuracy_meters_value between 0 and 10000)
    or recorded_at_value < now()-interval '2 minutes' or recorded_at_value > now()+interval '30 seconds' then
    raise exception 'A valid recent device location is required'; end if;
  update public.rider_pickup_locations set latitude=latitude_value,longitude=longitude_value,
    accuracy_meters=accuracy_meters_value,recorded_at=recorded_at_value
    where booking_id=trip.booking_id and driver_profile_id=trip.current_driver_profile_id;
  if not found then raise exception 'Enable pickup sharing with your assigned Driver first'; end if;
end; $$;

create function public.my_driver_rider_pickup_location(target_booking_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select (select jsonb_build_object('latitude',l.latitude,'longitude',l.longitude,
    'accuracyMeters',l.accuracy_meters,'recordedAt',l.recorded_at)
    from public.rider_pickup_locations l join public.dispatch_bookings b on b.booking_id=l.booking_id
    join public.driver_profiles d on d.driver_profile_id=b.current_driver_profile_id and d.tenant_id=b.tenant_id
    where b.booking_id=target_booking_id and b.status in ('accepted','arrived')
      and b.current_driver_profile_id=public.current_driver_profile_id()
      and l.driver_profile_id=b.current_driver_profile_id and l.tenant_id=b.tenant_id
      and l.latitude is not null and l.recorded_at >= now()-interval '60 seconds');
$$;

create function public.clear_rider_pickup_sharing()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status not in ('accepted','arrived') or new.current_driver_profile_id is distinct from old.current_driver_profile_id
    or new.rider_profile_id is distinct from old.rider_profile_id or new.tenant_id is distinct from old.tenant_id then
    delete from public.rider_pickup_locations where booking_id=new.booking_id;
    if found then
      insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,
        reason,correlation_id,resource_type,resource_id,metadata)
      values(old.tenant_id,'rider.pickup_sharing_stopped','platform_system',null,'{}',
        'Pickup sharing stopped on trip or assignment change.',gen_random_uuid(),'booking',old.booking_id::text,
        jsonb_build_object('status',new.status));
    end if;
  end if;
  return new;
end; $$;
create trigger clear_rider_pickup_sharing after update of status,current_driver_profile_id,rider_profile_id,tenant_id
  on public.dispatch_bookings for each row execute function public.clear_rider_pickup_sharing();

revoke all on function public.my_rider_pickup_sharing(uuid) from public,anon,authenticated;
revoke all on function public.set_my_rider_pickup_sharing(uuid,boolean) from public,anon,authenticated;
revoke all on function public.update_my_rider_pickup_location(uuid,double precision,double precision,double precision,timestamptz) from public,anon,authenticated;
revoke all on function public.my_driver_rider_pickup_location(uuid) from public,anon,authenticated;
revoke all on function public.clear_rider_pickup_sharing() from public,anon,authenticated;
grant execute on function public.my_rider_pickup_sharing(uuid) to authenticated;
grant execute on function public.set_my_rider_pickup_sharing(uuid,boolean) to authenticated;
grant execute on function public.update_my_rider_pickup_location(uuid,double precision,double precision,double precision,timestamptz) to authenticated;
grant execute on function public.my_driver_rider_pickup_location(uuid) to authenticated;
