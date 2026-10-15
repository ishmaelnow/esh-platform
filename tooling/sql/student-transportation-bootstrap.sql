-- TEST ONLY minimal dependencies for disposable embedded PostgreSQL. Not a production migration.
create role anon;
create role authenticated;
create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create table public.tenants (tenant_id uuid primary key);
create table public.product_workspace_catalog (
  workspace_key text primary key, display_name text, description text, sort_order integer
);
create table public.workspace_role_catalog (
  workspace_key text references public.product_workspace_catalog, role_key text,
  display_name text, description text, assignable boolean, primary key (workspace_key, role_key)
);
create table public.tenant_product_workspaces (
  tenant_id uuid references public.tenants, workspace_key text references public.product_workspace_catalog,
  status text, primary key (tenant_id, workspace_key)
);
create table public.tenant_product_entitlements (
  tenant_id uuid references public.tenants, workspace_key text references public.product_workspace_catalog,
  status text, primary key (tenant_id, workspace_key)
);
-- Deliberately permissive dependency stubs: launch gate must deny even when all prior gates pass.
create function public.has_active_product_entitlement(uuid, text) returns boolean language sql as $$ select true $$;
create function public.has_workspace_role(uuid, text, text[]) returns boolean language sql as $$ select true $$;
create function public.has_active_product_session(uuid, text) returns boolean language sql as $$ select true $$;
insert into public.tenants values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
insert into public.product_workspace_catalog values ('transportation', 'Transportation', 'Existing', 10), ('community', 'Community', 'Existing', 20);
insert into public.tenant_product_workspaces select tenant_id, 'transportation', 'enabled' from public.tenants;
insert into public.tenant_product_entitlements select tenant_id, 'transportation', 'granted' from public.tenants;
