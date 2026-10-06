-- Optional private Home/Work shortcuts. Booking remains server-authoritative.
create table public.rider_saved_places (
  tenant_id uuid not null,
  rider_profile_id uuid not null,
  place_key text not null check (place_key in ('home', 'work')),
  address_label text not null check (length(btrim(address_label)) between 1 and 500),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, rider_profile_id, place_key),
  foreign key (tenant_id, rider_profile_id) references public.rider_profiles(tenant_id, rider_profile_id)
    on delete cascade
);
alter table public.rider_saved_places enable row level security;
create policy rider_saved_places_self_select on public.rider_saved_places for select to authenticated
  using (rider_profile_id = public.current_rider_profile_id(tenant_id));
revoke all on public.rider_saved_places from public, anon, authenticated;
grant select on public.rider_saved_places to authenticated;
grant all on public.rider_saved_places to service_role;
-- No browser table INSERT/UPDATE/DELETE, manager read policy or new Driver access.

create function public.rider_saved_place_owner(target_tenant_slug text)
returns public.rider_profiles language plpgsql security definer set search_path = public as $$
declare rider public.rider_profiles;
begin
  if auth.uid() is null or not exists (
    select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null
  ) then raise exception 'verified email authentication is required'; end if;
  select profile.* into rider from public.rider_profiles profile
    join public.tenants tenant using (tenant_id)
    join public.tenant_configurations config using (tenant_id)
    join public.tenant_capabilities capability using (tenant_id)
    where config.tenant_slug=lower(btrim(target_tenant_slug)) and tenant.status='active'
      and capability.capability_key='driver.management' and capability.enabled
      and profile.rider_profile_id=public.current_rider_profile_id(profile.tenant_id);
  if rider.rider_profile_id is null then raise exception 'active rider profile is required'; end if;
  return rider;
end; $$;
revoke all on function public.rider_saved_place_owner(text) from public, anon, authenticated;

create function public.my_rider_saved_places(target_tenant_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rider public.rider_profiles;
begin
  rider := public.rider_saved_place_owner(target_tenant_slug);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'key', place_key, 'label', address_label, 'latitude', latitude, 'longitude', longitude)
    order by place_key) from public.rider_saved_places
    where tenant_id=rider.tenant_id and rider_profile_id=rider.rider_profile_id), '[]'::jsonb);
end; $$;
revoke all on function public.my_rider_saved_places(text) from public, anon, authenticated;
grant execute on function public.my_rider_saved_places(text) to authenticated;

create function public.save_my_rider_place(target_tenant_slug text, expected_rider_profile_id uuid, place_key_value text,
  address_label_value text, latitude_value double precision, longitude_value double precision)
returns void language plpgsql security definer set search_path = public as $$
declare rider public.rider_profiles;
begin
  rider := public.rider_saved_place_owner(target_tenant_slug);
  if expected_rider_profile_id is distinct from rider.rider_profile_id then
    raise exception 'rider account changed; refresh before saving';
  end if;
  if place_key_value is null or place_key_value not in ('home','work')
    or nullif(btrim(address_label_value),'') is null or length(btrim(address_label_value))>500
    or latitude_value is null or longitude_value is null
    or not (latitude_value between -90 and 90 and longitude_value between -180 and 180) then
    raise exception 'a valid Home or Work address and coordinates are required';
  end if;
  insert into public.rider_saved_places(tenant_id,rider_profile_id,place_key,address_label,latitude,longitude)
    values(rider.tenant_id,rider.rider_profile_id,place_key_value,btrim(address_label_value),latitude_value,longitude_value)
    on conflict (tenant_id,rider_profile_id,place_key) do update set address_label=excluded.address_label,
      latitude=excluded.latitude,longitude=excluded.longitude,updated_at=now();
  insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,
    actor_platform_roles,reason,correlation_id,resource_type,resource_id,metadata)
    values(rider.tenant_id,'rider.saved_place_updated','person',rider.person_id,'{}',
      'Rider saved an optional destination shortcut.',gen_random_uuid(),'rider_profile',
      rider.rider_profile_id::text,jsonb_build_object('place_key',place_key_value));
end; $$;
revoke all on function public.save_my_rider_place(text,uuid,text,text,double precision,double precision)
  from public, anon, authenticated;
grant execute on function public.save_my_rider_place(text,uuid,text,text,double precision,double precision) to authenticated;

create function public.remove_my_rider_place(target_tenant_slug text, expected_rider_profile_id uuid, place_key_value text)
returns void language plpgsql security definer set search_path = public as $$
declare rider public.rider_profiles;
begin
  rider := public.rider_saved_place_owner(target_tenant_slug);
  if expected_rider_profile_id is distinct from rider.rider_profile_id then
    raise exception 'rider account changed; refresh before removing';
  end if;
  if place_key_value is null or place_key_value not in ('home','work') then raise exception 'invalid place'; end if;
  delete from public.rider_saved_places where tenant_id=rider.tenant_id
    and rider_profile_id=rider.rider_profile_id and place_key=place_key_value;
  if found then
    insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,
      actor_platform_roles,reason,correlation_id,resource_type,resource_id,metadata)
      values(rider.tenant_id,'rider.saved_place_removed','person',rider.person_id,'{}',
        'Rider removed an optional destination shortcut.',gen_random_uuid(),'rider_profile',
        rider.rider_profile_id::text,jsonb_build_object('place_key',place_key_value));
  end if;
end; $$;
revoke all on function public.remove_my_rider_place(text,uuid,text) from public, anon, authenticated;
grant execute on function public.remove_my_rider_place(text,uuid,text) to authenticated;
