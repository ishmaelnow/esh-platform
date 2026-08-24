-- Platform-owned product entitlements are separate from tenant-controlled workspace activation.
-- Existing enabled products are grandfathered; no Community entitlement is created from a
-- disabled Community workspace.

create table public.tenant_product_entitlements (
  tenant_id uuid not null references public.tenants (tenant_id) on delete cascade,
  workspace_key text not null references public.product_workspace_catalog (workspace_key) on delete restrict,
  status text not null,
  grant_source text not null default 'platform_admin',
  granted_at timestamptz not null default now(),
  granted_by_person_id uuid references public.person_profiles (person_id) on delete set null,
  status_changed_at timestamptz not null default now(),
  status_changed_by_person_id uuid references public.person_profiles (person_id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, workspace_key),
  constraint tenant_product_entitlements_status_check check (
    status in ('granted', 'suspended', 'revoked')
  ),
  constraint tenant_product_entitlements_source_check check (
    grant_source in ('platform_admin', 'migration', 'system')
  ),
  constraint tenant_product_entitlements_reason_check check (length(btrim(reason)) > 0)
);

create index tenant_product_entitlements_status_idx
  on public.tenant_product_entitlements (workspace_key, status, tenant_id);

create trigger tenant_product_entitlements_set_updated_at
  before update on public.tenant_product_entitlements
  for each row execute function public.set_updated_at();

create or replace function public.protect_tenant_product_entitlement_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tenant_id <> old.tenant_id or new.workspace_key <> old.workspace_key then
    raise exception 'Product entitlement identity is immutable';
  end if;
  return new;
end;
$$;

create trigger tenant_product_entitlements_protect_identity
  before update on public.tenant_product_entitlements
  for each row execute function public.protect_tenant_product_entitlement_identity();

-- Backward-compatible bridge: only products that were already enabled receive an entitlement.
insert into public.tenant_product_entitlements (
  tenant_id, workspace_key, status, grant_source, reason
)
select workspace.tenant_id, workspace.workspace_key, 'granted', 'migration',
  'Preserved an enabled product during platform entitlement separation.'
from public.tenant_product_workspaces workspace
where workspace.status = 'enabled'
on conflict (tenant_id, workspace_key) do nothing;

insert into public.tenant_audit_events (
  tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
  correlation_id, resource_type, resource_id, metadata
)
select entitlement.tenant_id, 'product_entitlement.grandfathered', 'platform_system', null, '{}',
  entitlement.reason, gen_random_uuid(), 'tenant_product_entitlement', entitlement.workspace_key,
  jsonb_build_object(
    'workspace_key', entitlement.workspace_key,
    'status', entitlement.status,
    'grant_source', entitlement.grant_source
  )
from public.tenant_product_entitlements entitlement
where entitlement.grant_source = 'migration';

create or replace function public.has_active_product_entitlement(
  target_tenant_id uuid,
  target_workspace_key text
)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.tenant_product_entitlements entitlement
    join public.tenants tenant on tenant.tenant_id = entitlement.tenant_id
    where entitlement.tenant_id = target_tenant_id
      and entitlement.workspace_key = target_workspace_key
      and entitlement.status = 'granted'
      and tenant.status in ('provisioning', 'active')
  );
$$;

create or replace function public.set_tenant_product_entitlement(
  target_tenant_id uuid,
  target_workspace_key text,
  target_status text,
  reason_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  actor_roles text[];
  prior_status text;
begin
  if not public.is_platform_data_admin() then
    raise exception 'Platform Owner or Platform Administrator access is required';
  end if;
  if actor_id is null then raise exception 'An authenticated platform actor is required'; end if;
  if target_status not in ('granted', 'suspended', 'revoked') then
    raise exception 'Invalid product entitlement status';
  end if;
  if nullif(btrim(reason_value), '') is null then
    raise exception 'Product entitlement reason is required';
  end if;
  if not exists (
    select 1 from public.tenants
    where tenant_id = target_tenant_id and status not in ('closed', 'deleted')
  ) then raise exception 'An open tenant is required'; end if;
  if not exists (
    select 1 from public.product_workspace_catalog where workspace_key = target_workspace_key
  ) then raise exception 'Unknown product'; end if;

  select status into prior_status
  from public.tenant_product_entitlements
  where tenant_id = target_tenant_id and workspace_key = target_workspace_key
  for update;

  if prior_status is null and target_status <> 'granted' then
    raise exception 'Grant the product before changing its entitlement status';
  end if;

  select coalesce(array_agg(role.role_key order by role.role_key), '{}') into actor_roles
  from public.platform_role_assignments role
  where role.person_id = actor_id
    and role.status = 'active'
    and role.role_key in ('platform_owner', 'platform_admin')
    and (role.expires_at is null or role.expires_at > now());

  insert into public.tenant_product_entitlements (
    tenant_id, workspace_key, status, grant_source, granted_at, granted_by_person_id,
    status_changed_at, status_changed_by_person_id, reason
  ) values (
    target_tenant_id, target_workspace_key, target_status, 'platform_admin', now(), actor_id,
    now(), actor_id, btrim(reason_value)
  )
  on conflict (tenant_id, workspace_key) do update set
    status = excluded.status,
    granted_at = case
      when excluded.status = 'granted' and tenant_product_entitlements.status <> 'granted'
        then now()
      else tenant_product_entitlements.granted_at
    end,
    granted_by_person_id = case
      when excluded.status = 'granted' and tenant_product_entitlements.status <> 'granted'
        then actor_id
      else tenant_product_entitlements.granted_by_person_id
    end,
    status_changed_at = now(),
    status_changed_by_person_id = actor_id,
    reason = btrim(reason_value);

  if target_workspace_key = 'community' then
    update public.tenant_capabilities set
      enabled = target_status = 'granted',
      enabled_at = case when target_status = 'granted' then now() else enabled_at end,
      disabled_at = case when target_status = 'granted' then null else now() end,
      updated_by_person_id = actor_id
    where tenant_id = target_tenant_id
      and capability_key in (
        'app.community', 'community.content', 'community.groups', 'community.services',
        'community.moderation', 'community.broadcasts'
      );
  end if;

  if target_status <> 'granted' then
    update public.tenant_product_workspaces set
      status = case when target_status = 'suspended' then 'suspended' else 'disabled' end,
      disabled_at = now(),
      updated_by_person_id = actor_id
    where tenant_id = target_tenant_id and workspace_key = target_workspace_key;

    update public.product_operational_sessions set
      status = 'ended', ended_at = now(),
      end_reason = 'Product entitlement ' || target_status || ' by Platform Administration.'
    where tenant_id = target_tenant_id
      and workspace_key = target_workspace_key
      and status = 'active';
  end if;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    target_tenant_id, 'product_entitlement.status_changed', 'person', actor_id, actor_roles,
    btrim(reason_value), gen_random_uuid(), 'tenant_product_entitlement', target_workspace_key,
    jsonb_build_object(
      'workspace_key', target_workspace_key,
      'previous_status', prior_status,
      'status', target_status,
      'community_capability_bundle_managed', target_workspace_key = 'community'
    )
  );
  return true;
end;
$$;

create or replace function public.has_active_workspace_enrollment(
  target_tenant_id uuid,
  target_workspace_key text
)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_active_product_entitlement(target_tenant_id, target_workspace_key)
    and public.has_active_tenant_membership(target_tenant_id)
    and exists (
      select 1
      from public.tenant_product_workspaces workspace
      join public.tenant_workspace_enrollments enrollment
        on enrollment.tenant_id = workspace.tenant_id
       and enrollment.workspace_key = workspace.workspace_key
      join public.tenant_memberships membership
        on membership.tenant_id = enrollment.tenant_id
       and membership.membership_id = enrollment.membership_id
      where workspace.tenant_id = target_tenant_id
        and workspace.workspace_key = target_workspace_key
        and workspace.status = 'enabled'
        and enrollment.status = 'active'
        and (enrollment.expires_at is null or enrollment.expires_at > now())
        and membership.person_id = public.current_person_id()
        and membership.status = 'active'
        and (membership.expires_at is null or membership.expires_at > now())
    );
$$;

create or replace function public.set_tenant_workspace_status(
  target_tenant_id uuid,
  target_workspace_key text,
  target_status text,
  reason_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id();
begin
  if not public.can_manage_workspace_access(target_tenant_id) then
    raise exception 'Tenant Owner or Platform Administration access is required';
  end if;
  if target_status not in ('disabled', 'enabled', 'suspended') then
    raise exception 'Invalid workspace status';
  end if;
  if nullif(btrim(reason_value), '') is null then
    raise exception 'Workspace status reason is required';
  end if;
  if target_status = 'enabled'
    and not public.has_active_product_entitlement(target_tenant_id, target_workspace_key)
  then raise exception 'Platform product entitlement is required before tenant activation'; end if;
  if target_workspace_key = 'community' and target_status = 'enabled'
    and not public.tenant_capability_enabled(target_tenant_id, 'app.community')
  then raise exception 'Enable the Community capability before enabling its workspace'; end if;

  update public.tenant_product_workspaces set
    status = target_status,
    enabled_at = case when target_status = 'enabled' then now() else enabled_at end,
    disabled_at = case when target_status = 'enabled' then null else now() end,
    updated_by_person_id = actor_id
  where tenant_id = target_tenant_id and workspace_key = target_workspace_key;
  if not found then raise exception 'Tenant workspace does not exist'; end if;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    target_tenant_id, 'workspace.status_changed', 'person', actor_id, '{}', btrim(reason_value),
    gen_random_uuid(), 'tenant_product_workspace', target_workspace_key,
    jsonb_build_object('workspace_key', target_workspace_key, 'status', target_status)
  );
  return true;
end;
$$;

create or replace function public.my_workspace_access()
returns table (
  tenant_id uuid,
  membership_id uuid,
  workspace_key text,
  workspace_name text,
  role_keys text[]
) language sql stable security definer set search_path = public as $$
  select enrollment.tenant_id, enrollment.membership_id, enrollment.workspace_key,
    catalog.display_name, array_agg(role.role_key order by role.role_key)
  from public.tenant_workspace_enrollments enrollment
  join public.tenant_memberships membership
    on membership.membership_id = enrollment.membership_id
   and membership.tenant_id = enrollment.tenant_id
  join public.tenant_product_workspaces tenant_workspace
    on tenant_workspace.tenant_id = enrollment.tenant_id
   and tenant_workspace.workspace_key = enrollment.workspace_key
  join public.tenant_product_entitlements entitlement
    on entitlement.tenant_id = enrollment.tenant_id
   and entitlement.workspace_key = enrollment.workspace_key
  join public.product_workspace_catalog catalog
    on catalog.workspace_key = enrollment.workspace_key
  join public.tenant_workspace_role_assignments role
    on role.enrollment_id = enrollment.enrollment_id
   and role.status = 'active'
   and (role.expires_at is null or role.expires_at > now())
  where membership.person_id = public.current_person_id()
    and membership.status = 'active'
    and (membership.expires_at is null or membership.expires_at > now())
    and enrollment.status = 'active'
    and (enrollment.expires_at is null or enrollment.expires_at > now())
    and tenant_workspace.status = 'enabled'
    and entitlement.status = 'granted'
  group by enrollment.tenant_id, enrollment.membership_id, enrollment.workspace_key,
    catalog.display_name, catalog.sort_order
  order by catalog.sort_order;
$$;

create or replace function public.workspace_admin_snapshot(target_tenant_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when not public.can_manage_workspace_access(target_tenant_id) then
      jsonb_build_object(
        'can_manage', false,
        'workspaces', coalesce((
          select jsonb_agg(jsonb_build_object(
            'workspace_key', access.workspace_key,
            'display_name', access.workspace_name,
            'status', 'enabled',
            'entitlement_status', 'granted',
            'roles', to_jsonb(access.role_keys)
          ) order by access.workspace_key)
          from public.my_workspace_access() access
          where access.tenant_id = target_tenant_id
        ), '[]'::jsonb),
        'memberships', '[]'::jsonb,
        'enrollments', '[]'::jsonb
      )
    else jsonb_build_object(
      'can_manage', true,
      'workspaces', coalesce((
        select jsonb_agg(jsonb_build_object(
          'workspace_key', workspace.workspace_key,
          'display_name', catalog.display_name,
          'description', catalog.description,
          'status', workspace.status,
          'entitlement_status', entitlement.status,
          'roles', coalesce((
            select jsonb_agg(role.role_key order by role.role_key)
            from public.tenant_workspace_enrollments enrollment
            join public.tenant_memberships membership
              on membership.membership_id = enrollment.membership_id
             and membership.tenant_id = enrollment.tenant_id
            join public.tenant_workspace_role_assignments role
              on role.enrollment_id = enrollment.enrollment_id
             and role.status = 'active'
             and (role.expires_at is null or role.expires_at > now())
            where enrollment.tenant_id = workspace.tenant_id
              and enrollment.workspace_key = workspace.workspace_key
              and enrollment.status = 'active'
              and membership.person_id = public.current_person_id()
          ), '[]'::jsonb)
        ) order by catalog.sort_order)
        from public.tenant_product_entitlements entitlement
        join public.tenant_product_workspaces workspace
          on workspace.tenant_id = entitlement.tenant_id
         and workspace.workspace_key = entitlement.workspace_key
        join public.product_workspace_catalog catalog
          on catalog.workspace_key = workspace.workspace_key
        where entitlement.tenant_id = target_tenant_id
          and entitlement.status in ('granted', 'suspended')
      ), '[]'::jsonb),
      'memberships', coalesce((
        select jsonb_agg(jsonb_build_object(
          'membership_id', membership.membership_id,
          'person_id', membership.person_id,
          'display_name', coalesce(profile.display_name, profile.normalized_email),
          'email', profile.normalized_email
        ) order by coalesce(profile.display_name, profile.normalized_email))
        from public.tenant_memberships membership
        join public.person_profiles profile on profile.person_id = membership.person_id
        where membership.tenant_id = target_tenant_id
          and membership.status = 'active'
          and (membership.expires_at is null or membership.expires_at > now())
      ), '[]'::jsonb),
      'enrollments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'enrollment_id', enrollment.enrollment_id,
          'membership_id', enrollment.membership_id,
          'workspace_key', enrollment.workspace_key,
          'status', enrollment.status,
          'display_name', coalesce(profile.display_name, profile.normalized_email),
          'email', profile.normalized_email,
          'roles', coalesce((
            select jsonb_agg(role.role_key order by role.role_key)
            from public.tenant_workspace_role_assignments role
            where role.enrollment_id = enrollment.enrollment_id
              and role.status = 'active'
              and (role.expires_at is null or role.expires_at > now())
          ), '[]'::jsonb)
        ) order by enrollment.workspace_key, coalesce(profile.display_name, profile.normalized_email))
        from public.tenant_workspace_enrollments enrollment
        join public.tenant_product_entitlements entitlement
          on entitlement.tenant_id = enrollment.tenant_id
         and entitlement.workspace_key = enrollment.workspace_key
         and entitlement.status in ('granted', 'suspended')
        join public.tenant_memberships membership
          on membership.membership_id = enrollment.membership_id
         and membership.tenant_id = enrollment.tenant_id
        join public.person_profiles profile on profile.person_id = membership.person_id
        where enrollment.tenant_id = target_tenant_id
          and enrollment.status = 'active'
          and (enrollment.expires_at is null or enrollment.expires_at > now())
      ), '[]'::jsonb)
    )
  end;
$$;

alter table public.tenant_product_entitlements enable row level security;

create policy tenant_product_entitlements_read on public.tenant_product_entitlements
  for select to authenticated using (
    public.has_active_tenant_membership(tenant_id) or public.is_platform_data_admin()
  );

grant select on public.tenant_product_entitlements to authenticated;
grant all on public.tenant_product_entitlements to service_role;

revoke all on function public.protect_tenant_product_entitlement_identity() from public, anon, authenticated;
revoke all on function public.has_active_product_entitlement(uuid, text) from public, anon, authenticated;
revoke all on function public.set_tenant_product_entitlement(uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.has_active_product_entitlement(uuid, text) to authenticated;
grant execute on function public.set_tenant_product_entitlement(uuid, text, text, text) to authenticated;

comment on table public.tenant_product_entitlements is
  'Platform-owned authority for a tenant to use a product. Tenant workspace activation, enrollment, and roles remain separate.';
comment on function public.set_tenant_product_entitlement(uuid, text, text, text) is
  'Platform Owner/Admin-only grant, suspend, restore, or revoke operation with tenant audit evidence.';
