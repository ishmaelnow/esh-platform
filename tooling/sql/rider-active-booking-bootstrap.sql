-- TEST ONLY minimal dependency schema for the embedded PostgreSQL smoke check.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'anon') $$;
create table public.person_profiles(person_id uuid primary key,auth_user_id uuid,status text default 'active');
create table public.rider_profiles(rider_profile_id uuid primary key,tenant_id uuid,person_id uuid references public.person_profiles,unique(tenant_id,rider_profile_id));
create table public.driver_profiles(tenant_id uuid,driver_profile_id uuid);
create table public.dispatch_bookings(booking_id uuid primary key default gen_random_uuid(),tenant_id uuid not null,
  rider_profile_id uuid,status text,created_at timestamptz default now(),dispatch_ready_at timestamptz,
  unique(tenant_id,booking_id),foreign key(tenant_id,rider_profile_id) references public.rider_profiles(tenant_id,rider_profile_id));
create function public.current_person_id() returns uuid language sql security definer as $$
  select person_id from public.person_profiles where auth_user_id=auth.uid() and status='active' $$;
create function public.can_manage_dispatch(t uuid) returns boolean language sql as $$ select false $$;
create function public.current_driver_profile_id() returns uuid language sql as $$ select null::uuid $$;
create function public.current_rider_profile_id(t uuid) returns uuid language sql security definer as $$
  select rider_profile_id from public.rider_profiles where tenant_id=t and person_id=public.current_person_id() $$;
grant usage on schema public,auth to anon,authenticated,service_role;
insert into public.person_profiles(person_id,auth_user_id) values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
insert into public.rider_profiles values
 ('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
-- Legacy duplicates must not be silently cancelled by the migration.
insert into public.dispatch_bookings(booking_id,tenant_id,rider_profile_id,status) values
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','requested'),
 ('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','accepted');
