-- TEST ONLY. Extend the disposable Student foundation fixture with identity dependencies.
alter table public.tenants add column status text not null default 'active';
create schema auth;
create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create table public.person_profiles (person_id uuid primary key, auth_user_id uuid references auth.users, normalized_email text unique, status text);
create table public.tenant_memberships (tenant_id uuid references public.tenants,person_id uuid references public.person_profiles,status text,expires_at timestamptz);
create table public.platform_role_assignments (person_id uuid references public.person_profiles,role_key text,status text,expires_at timestamptz);
create table public.tenant_configurations (tenant_id uuid primary key references public.tenants, display_name text);
create table public.tenant_audit_events (
  tenant_id uuid references public.tenants,event_name text,actor_type text,actor_person_id uuid,
  actor_platform_roles text[],reason text,correlation_id uuid,resource_type text,resource_id text,metadata jsonb
);
insert into auth.users select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,now() from generate_series(11,14) n;
insert into person_profiles select id,id,'student-test-'||right(id::text,2)||'@example.invalid','active' from auth.users;
insert into tenant_memberships select '00000000-0000-0000-0000-000000000001',id,'active',null from auth.users;
insert into platform_role_assignments values ('00000000-0000-0000-0000-000000000013','platform_admin','active',null);
insert into tenant_configurations select tenant_id, 'TEST enrollment organization' from tenants;
