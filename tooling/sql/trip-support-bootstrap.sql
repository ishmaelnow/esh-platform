-- Disposable test database ONLY. Minimal legacy dependencies, not full-chain certification.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to anon,authenticated,service_role;
create table public.tenants(tenant_id uuid primary key,status text);
create table public.person_profiles(person_id uuid primary key,auth_user_id uuid,status text);
create table public.rider_profiles(rider_profile_id uuid primary key,tenant_id uuid,person_id uuid,status text,display_name text,unique(tenant_id,rider_profile_id));
create table public.dispatch_bookings(booking_id uuid primary key,tenant_id uuid,rider_profile_id uuid,status text,pickup_address text,destination_address text,unique(tenant_id,booking_id));
create table public.tenant_audit_events(tenant_id uuid,event_name text,actor_type text,actor_person_id uuid,actor_platform_roles text[],reason text,correlation_id uuid,resource_type text,resource_id text,metadata jsonb);
create function public.current_person_id() returns uuid language sql security definer as $$
  select person_id from public.person_profiles where auth_user_id=auth.uid() and status='active' $$;
create function public.current_rider_profile_id(t uuid) returns uuid language sql security definer as $$
  select rider_profile_id from public.rider_profiles where tenant_id=t and person_id=public.current_person_id() and status='active' $$;
-- Stand-in for the existing owner/admin + active-tenant/capability contract.
create function public.can_manage_dispatch(t uuid) returns boolean language sql security definer as $$
  select auth.uid()='20000000-0000-4000-8000-000000000003'::uuid and public.current_person_id() is not null
    and t='10000000-0000-4000-8000-000000000001'::uuid
    and exists(select 1 from public.tenants where tenant_id=t and status='active') $$;
insert into public.tenants values('10000000-0000-4000-8000-000000000001','active'),('10000000-0000-4000-8000-000000000002','active');
insert into public.person_profiles select ('30000000-0000-4000-8000-00000000000'||i)::uuid,
  ('20000000-0000-4000-8000-00000000000'||i)::uuid,'active' from generate_series(1,5) i;
insert into public.rider_profiles values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','active','Test Rider'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','active','Other Rider'),
 ('40000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000005','active','Same tenant other Rider');
insert into public.dispatch_bookings values
 ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','completed','Test pickup','Test destination'),
 ('90000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','cancelled','Other pickup','Other destination'),
 ('90000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','in_progress','Active pickup','Active destination');
