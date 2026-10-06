-- TEST ONLY: minimal preexisting schema for embedded PostgreSQL migration regression.
-- Never run against Supabase or an existing database. Does not certify all legacy migrations.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key,aud text,role text,email text,email_confirmed_at timestamptz,created_at timestamptz,updated_at timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz,updated_at timestamptz,not_after timestamptz);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create table public.tenants(tenant_id uuid primary key,status text,activated_at timestamptz);
create table public.person_profiles(person_id uuid primary key,auth_user_id uuid references auth.users(id),status text,display_name text,primary_email text,normalized_email text,activated_at timestamptz);
create table public.tenant_configurations(tenant_id uuid primary key references public.tenants,tenant_slug text unique,legal_name text,display_name text,default_time_zone text,support_contact_email text);
create table public.tenant_memberships(membership_id uuid primary key,tenant_id uuid,person_id uuid,status text,activated_at timestamptz);
create table public.tenant_role_assignments(tenant_id uuid,membership_id uuid,role_key text,status text,assigned_at timestamptz);
create table public.rider_profiles(rider_profile_id uuid primary key,tenant_id uuid references public.tenants,person_id uuid references public.person_profiles,display_name text,email text,status text default 'active',unique(tenant_id,rider_profile_id));
create table public.driver_profiles(driver_profile_id uuid primary key,tenant_id uuid references public.tenants,person_id uuid references public.person_profiles,status text default 'active',unique(tenant_id,driver_profile_id));
create table public.dispatch_offers(offer_id uuid primary key,tenant_id uuid,driver_profile_id uuid,status text,expires_at timestamptz);
create table public.notification_outbox(notification_id uuid primary key default gen_random_uuid(),tenant_id uuid references public.tenants,person_id uuid,
  rider_profile_id uuid,driver_profile_id uuid,notification_type text,recipient_email text,payload jsonb,delivery_status text default 'queued',
  available_at timestamptz default now(),dedupe_key text unique,unique(tenant_id,notification_id));
create table public.tenant_audit_events(tenant_id uuid,event_name text,actor_type text,actor_person_id uuid,actor_platform_roles text[],reason text,correlation_id uuid,resource_type text,resource_id text,metadata jsonb);
create function public.current_person_id() returns uuid language sql security definer as $$ select person_id from public.person_profiles where auth_user_id=auth.uid() and status='active' $$;
create function public.current_rider_profile_id(t uuid) returns uuid language sql security definer as $$
  select rider_profile_id from public.rider_profiles where tenant_id=t and person_id=public.current_person_id() and status='active' $$;
create function public.current_driver_profile_id() returns uuid language sql security definer as $$
  select driver_profile_id from public.driver_profiles where person_id=public.current_person_id() $$;
grant usage on schema public,auth to anon,authenticated,service_role;
