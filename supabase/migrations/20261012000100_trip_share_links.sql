-- Optional, revocable active-trip links. Raw bearer tokens never enter the database.
create table public.trip_share_links (
  booking_id uuid primary key,
  tenant_id uuid not null,
  rider_profile_id uuid not null,
  driver_profile_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  foreign key (tenant_id,booking_id) references public.dispatch_bookings(tenant_id,booking_id) on delete cascade,
  foreign key (tenant_id,rider_profile_id) references public.rider_profiles(tenant_id,rider_profile_id),
  foreign key (tenant_id,driver_profile_id) references public.driver_profiles(tenant_id,driver_profile_id)
);
alter table public.trip_share_links enable row level security;
revoke all on public.trip_share_links from public,anon,authenticated;
grant all on public.trip_share_links to service_role;

create function public.manage_my_trip_share(booking_value uuid, action_value text, hash_value text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.dispatch_bookings; expiry timestamptz; actor uuid:=public.current_person_id();
begin
  select * into b from public.dispatch_bookings where booking_id=booking_value for update;
  if auth.uid() is null or actor is null or b.rider_profile_id is null
    or b.rider_profile_id is distinct from public.current_rider_profile_id(b.tenant_id)
    or not exists(select 1 from public.tenants where tenant_id=b.tenant_id and status='active')
    then raise exception 'Trip sharing is unavailable'; end if;
  if action_value not in ('status','create','stop') or action_value is null then raise exception 'Choose a sharing action'; end if;
  if action_value='create' then
    if b.status not in ('accepted','arrived','in_progress') or b.current_driver_profile_id is null
      or hash_value is null or hash_value !~ '^[0-9a-f]{64}$'
      or not exists(select 1 from public.driver_profiles where tenant_id=b.tenant_id and driver_profile_id=b.current_driver_profile_id and status='active')
      then raise exception 'Trip sharing is unavailable'; end if;
    expiry:=now()+interval '4 hours';
    insert into public.trip_share_links values(b.booking_id,b.tenant_id,b.rider_profile_id,b.current_driver_profile_id,hash_value,expiry)
      on conflict(booking_id) do update set token_hash=excluded.token_hash,driver_profile_id=excluded.driver_profile_id,expires_at=excluded.expires_at;
  elsif action_value='stop' then
    delete from public.trip_share_links where booking_id=b.booking_id;
  end if;
  if action_value in ('create','stop') then
    insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,reason,correlation_id,resource_type,resource_id,metadata)
    values(b.tenant_id,'rider.trip_share_'||action_value,'person',actor,'{}','Rider changed optional trusted-contact sharing.',gen_random_uuid(),'booking',b.booking_id::text,'{}');
  end if;
  select expires_at into expiry from public.trip_share_links where booking_id=b.booking_id and expires_at>now()
    and driver_profile_id=b.current_driver_profile_id and b.status in ('accepted','arrived','in_progress');
  return jsonb_build_object('active',expiry is not null,'expiresAt',expiry);
end; $$;

-- Only the server can exchange a cryptographic bearer hash for this minimal projection.
create function public.read_shared_trip(hash_value text) returns jsonb
language sql stable security definer set search_path=public as $$
  select (select jsonb_build_object('status',b.status,'expiresAt',s.expires_at,'location',
    (select jsonb_build_object('latitude',l.latitude,'longitude',l.longitude,'recordedAt',l.recorded_at)
      from public.driver_locations l where l.tenant_id=b.tenant_id and l.driver_profile_id=b.current_driver_profile_id
      and l.sharing_enabled and l.latitude between -90 and 90 and l.longitude between -180 and 180
      and l.recorded_at between now()-interval '60 seconds' and now()+interval '30 seconds'))
    from public.trip_share_links s join public.dispatch_bookings b on b.booking_id=s.booking_id and b.tenant_id=s.tenant_id
    join public.tenants t on t.tenant_id=s.tenant_id and t.status='active'
    join public.rider_profiles r on r.rider_profile_id=s.rider_profile_id and r.tenant_id=s.tenant_id and r.status='active'
    join public.person_profiles rp on rp.person_id=r.person_id and rp.status='active' and rp.auth_user_id is not null
    join public.driver_profiles d on d.driver_profile_id=s.driver_profile_id and d.tenant_id=s.tenant_id and d.status='active'
    join public.person_profiles dp on dp.person_id=d.person_id and dp.status='active' and dp.auth_user_id is not null
    where s.token_hash=hash_value and s.expires_at>now() and b.rider_profile_id=s.rider_profile_id
      and b.current_driver_profile_id=s.driver_profile_id and b.status in ('accepted','arrived','in_progress'));
$$;

create function public.clear_trip_share_links() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status not in ('accepted','arrived','in_progress')
    or new.current_driver_profile_id is distinct from old.current_driver_profile_id
    or new.rider_profile_id is distinct from old.rider_profile_id then
    delete from public.trip_share_links where booking_id=new.booking_id;
  end if;
  return new;
end; $$;
create trigger clear_trip_share_links after update of status,current_driver_profile_id,rider_profile_id on public.dispatch_bookings
  for each row execute function public.clear_trip_share_links();
revoke all on function public.manage_my_trip_share(uuid,text,text),public.read_shared_trip(text),public.clear_trip_share_links() from public,anon,authenticated;
grant execute on function public.manage_my_trip_share(uuid,text,text) to authenticated;
grant execute on function public.read_shared_trip(text) to service_role;
