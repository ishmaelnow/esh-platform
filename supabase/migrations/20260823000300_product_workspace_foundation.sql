-- Product workspaces separate tenant governance from product operations.
-- Shared identity and tenant membership are prerequisites, never product authorization by themselves.

create table public.product_workspace_catalog (
  workspace_key text primary key,
  display_name text not null,
  description text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint product_workspace_catalog_key_check check (workspace_key ~ '^[a-z][a-z0-9_]*$'),
  constraint product_workspace_catalog_name_check check (length(btrim(display_name)) > 0),
  constraint product_workspace_catalog_description_check check (length(btrim(description)) > 0),
  constraint product_workspace_catalog_sort_check check (sort_order >= 0)
);

insert into public.product_workspace_catalog (workspace_key, display_name, description, sort_order)
values
  ('transportation', 'Transportation', 'Dispatch, drivers, vehicles, fares, and transportation operations.', 10),
  ('community', 'Community', 'Community publishing, services, groups, trust, and moderation.', 20);

create table public.workspace_role_catalog (
  workspace_key text not null references public.product_workspace_catalog (workspace_key) on delete restrict,
  role_key text not null,
  display_name text not null,
  description text not null,
  assignable boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (workspace_key, role_key),
  constraint workspace_role_catalog_key_check check (role_key ~ '^[a-z][a-z0-9_]*$'),
  constraint workspace_role_catalog_name_check check (length(btrim(display_name)) > 0),
  constraint workspace_role_catalog_description_check check (length(btrim(description)) > 0)
);

insert into public.workspace_role_catalog
  (workspace_key, role_key, display_name, description, assignable)
values
  ('transportation', 'transportation_admin', 'Transportation administrator',
    'Operates the tenant Transportation workspace.', true),
  ('community', 'community_member', 'Community member',
    'Participates in the Community workspace using ordinary member permissions.', true),
  ('community', 'community_admin', 'Community administrator',
    'Operates Community settings, publishing, trust, and moderation.', true),
  ('community', 'community_moderator', 'Community moderator',
    'Moderates Community content without tenant or emergency authority.', true),
  ('community', 'emergency_publisher', 'Emergency publisher',
    'Holds the separately controlled emergency publication permissions.', true);

create table public.tenant_product_workspaces (
  tenant_id uuid not null references public.tenants (tenant_id) on delete cascade,
  workspace_key text not null references public.product_workspace_catalog (workspace_key) on delete restrict,
  status text not null default 'disabled',
  enabled_at timestamptz,
  disabled_at timestamptz,
  updated_by_person_id uuid references public.person_profiles (person_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, workspace_key),
  constraint tenant_product_workspaces_status_check check (status in ('disabled', 'enabled', 'suspended')),
  constraint tenant_product_workspaces_dates_check check (
    (status = 'enabled' and enabled_at is not null and disabled_at is null)
    or (status <> 'enabled')
  )
);

create table public.tenant_workspace_enrollments (
  enrollment_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  membership_id uuid not null,
  workspace_key text not null,
  status text not null default 'active',
  source text not null default 'manual',
  enrolled_by_person_id uuid references public.person_profiles (person_id) on delete set null,
  removed_by_person_id uuid references public.person_profiles (person_id) on delete set null,
  reason text not null,
  enrolled_at timestamptz not null default now(),
  removed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (membership_id, tenant_id)
    references public.tenant_memberships (membership_id, tenant_id) on delete cascade,
  foreign key (tenant_id, workspace_key)
    references public.tenant_product_workspaces (tenant_id, workspace_key) on delete cascade,
  unique (enrollment_id, tenant_id, workspace_key),
  constraint tenant_workspace_enrollments_status_check check (
    status in ('active', 'suspended', 'removed', 'expired')
  ),
  constraint tenant_workspace_enrollments_source_check check (source in ('manual', 'migration', 'system')),
  constraint tenant_workspace_enrollments_reason_check check (length(btrim(reason)) > 0),
  constraint tenant_workspace_enrollments_dates_check check (
    (status = 'removed' and removed_at is not null) or status <> 'removed'
  )
);

create unique index tenant_workspace_enrollments_one_active_idx
  on public.tenant_workspace_enrollments (tenant_id, membership_id, workspace_key)
  where status = 'active';
create index tenant_workspace_enrollments_member_idx
  on public.tenant_workspace_enrollments (membership_id, workspace_key, status);

create table public.tenant_workspace_role_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  workspace_key text not null,
  enrollment_id uuid not null,
  role_key text not null,
  status text not null default 'active',
  assigned_by_person_id uuid references public.person_profiles (person_id) on delete set null,
  revoked_by_person_id uuid references public.person_profiles (person_id) on delete set null,
  reason text not null,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (enrollment_id, tenant_id, workspace_key)
    references public.tenant_workspace_enrollments (enrollment_id, tenant_id, workspace_key)
    on delete cascade,
  foreign key (workspace_key, role_key)
    references public.workspace_role_catalog (workspace_key, role_key) on delete restrict,
  constraint tenant_workspace_role_assignments_status_check check (
    status in ('active', 'revoked', 'expired')
  ),
  constraint tenant_workspace_role_assignments_reason_check check (length(btrim(reason)) > 0),
  constraint tenant_workspace_role_assignments_dates_check check (
    (status = 'revoked' and revoked_at is not null) or status <> 'revoked'
  )
);

create unique index tenant_workspace_role_assignments_one_active_idx
  on public.tenant_workspace_role_assignments (enrollment_id, role_key)
  where status = 'active';
create index tenant_workspace_role_assignments_access_idx
  on public.tenant_workspace_role_assignments (tenant_id, workspace_key, role_key, status);

create trigger tenant_product_workspaces_set_updated_at before update on public.tenant_product_workspaces
  for each row execute function public.set_updated_at();
create trigger tenant_workspace_enrollments_set_updated_at before update on public.tenant_workspace_enrollments
  for each row execute function public.set_updated_at();
create trigger tenant_workspace_role_assignments_set_updated_at before update on public.tenant_workspace_role_assignments
  for each row execute function public.set_updated_at();

create or replace function public.seed_product_workspaces()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tenant_product_workspaces (tenant_id, workspace_key, status)
  select new.tenant_id, catalog.workspace_key, 'disabled'
  from public.product_workspace_catalog catalog
  on conflict (tenant_id, workspace_key) do nothing;
  return new;
end;
$$;

create trigger tenants_seed_product_workspaces after insert on public.tenants
  for each row execute function public.seed_product_workspaces();

-- Preserve the installed Transportation product for existing tenants. This is a one-time,
-- auditable migration bridge; future tenant roles do not create workspace enrollment.
insert into public.tenant_product_workspaces (tenant_id, workspace_key, status, enabled_at)
select tenant_id, 'transportation', 'enabled', now() from public.tenants
on conflict (tenant_id, workspace_key) do update
set status = 'enabled', enabled_at = coalesce(tenant_product_workspaces.enabled_at, now()),
    disabled_at = null, updated_at = now();

insert into public.tenant_product_workspaces (tenant_id, workspace_key, status)
select tenant_id, 'community', 'disabled' from public.tenants
on conflict (tenant_id, workspace_key) do nothing;

with eligible as (
  select distinct membership.tenant_id, membership.membership_id
  from public.tenant_memberships membership
  join public.tenant_role_assignments role
    on role.tenant_id = membership.tenant_id and role.membership_id = membership.membership_id
  where membership.status = 'active'
    and (membership.expires_at is null or membership.expires_at > now())
    and role.status = 'active'
    and (role.expires_at is null or role.expires_at > now())
    and role.role_key in ('tenant_owner', 'tenant_admin')
), inserted as (
  insert into public.tenant_workspace_enrollments
    (tenant_id, membership_id, workspace_key, status, source, reason)
  select tenant_id, membership_id, 'transportation', 'active', 'migration',
    'Preserved existing Transportation administration during workspace separation.'
  from eligible
  on conflict do nothing
  returning enrollment_id, tenant_id, workspace_key
)
insert into public.tenant_workspace_role_assignments
  (tenant_id, workspace_key, enrollment_id, role_key, status, reason)
select tenant_id, workspace_key, enrollment_id, 'transportation_admin', 'active',
  'Preserved existing Transportation administration during workspace separation.'
from inserted;

insert into public.tenant_audit_events (
  tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
  correlation_id, resource_type, resource_id, metadata
)
select enrollment.tenant_id, 'workspace.transportation_access_backfilled', 'platform_system', null,
  '{}', 'Preserved existing Transportation administration during workspace separation.',
  gen_random_uuid(), 'tenant_workspace_enrollment', enrollment.enrollment_id::text,
  jsonb_build_object('membership_id', enrollment.membership_id,
    'workspace_key', enrollment.workspace_key, 'role_key', 'transportation_admin')
from public.tenant_workspace_enrollments enrollment
where enrollment.workspace_key = 'transportation'
  and enrollment.source = 'migration'
  and enrollment.reason = 'Preserved existing Transportation administration during workspace separation.';

create or replace function public.has_active_workspace_enrollment(
  target_tenant_id uuid,
  target_workspace_key text
)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_active_tenant_membership(target_tenant_id)
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

create or replace function public.has_workspace_role(
  target_tenant_id uuid,
  target_workspace_key text,
  required_roles text[]
)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_active_workspace_enrollment(target_tenant_id, target_workspace_key)
    and exists (
      select 1
      from public.tenant_workspace_enrollments enrollment
      join public.tenant_memberships membership
        on membership.tenant_id = enrollment.tenant_id
       and membership.membership_id = enrollment.membership_id
      join public.tenant_workspace_role_assignments role
        on role.enrollment_id = enrollment.enrollment_id
       and role.tenant_id = enrollment.tenant_id
       and role.workspace_key = enrollment.workspace_key
      where enrollment.tenant_id = target_tenant_id
        and enrollment.workspace_key = target_workspace_key
        and enrollment.status = 'active'
        and (enrollment.expires_at is null or enrollment.expires_at > now())
        and membership.person_id = public.current_person_id()
        and role.status = 'active'
        and role.role_key = any(required_roles)
        and (role.expires_at is null or role.expires_at > now())
    );
$$;

create or replace function public.can_manage_workspace_access(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_data_admin()
    or public.has_tenant_role(target_tenant_id, array['tenant_owner']);
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
    raise exception 'Tenant owner or platform administration access is required';
  end if;
  if target_status not in ('disabled', 'enabled', 'suspended') then
    raise exception 'Invalid workspace status';
  end if;
  if nullif(btrim(reason_value), '') is null then
    raise exception 'Workspace status reason is required';
  end if;
  if target_workspace_key = 'community' and target_status = 'enabled'
    and not public.tenant_capability_enabled(target_tenant_id, 'app.community')
  then
    raise exception 'Enable the Community capability before enabling its workspace';
  end if;

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

create or replace function public.enroll_tenant_workspace_member(
  target_tenant_id uuid,
  target_membership_id uuid,
  target_workspace_key text,
  initial_role_key text,
  reason_value text,
  expires_at_value timestamptz default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); new_enrollment_id uuid;
begin
  if not public.can_manage_workspace_access(target_tenant_id) then
    raise exception 'Tenant owner or platform administration access is required';
  end if;
  if nullif(btrim(reason_value), '') is null then raise exception 'Enrollment reason is required'; end if;
  if expires_at_value is not null and expires_at_value <= now() then
    raise exception 'Enrollment expiration must be in the future';
  end if;
  if not exists (
    select 1 from public.tenant_product_workspaces
    where tenant_id = target_tenant_id and workspace_key = target_workspace_key and status = 'enabled'
  ) then raise exception 'Workspace is not enabled'; end if;
  if not exists (
    select 1 from public.tenant_memberships
    where tenant_id = target_tenant_id and membership_id = target_membership_id
      and status = 'active' and (expires_at is null or expires_at > now())
  ) then raise exception 'Active tenant membership is required'; end if;
  if not exists (
    select 1 from public.workspace_role_catalog
    where workspace_key = target_workspace_key and role_key = initial_role_key and assignable
  ) then raise exception 'Role does not belong to this workspace or is not assignable'; end if;

  insert into public.tenant_workspace_enrollments (
    tenant_id, membership_id, workspace_key, source, enrolled_by_person_id, reason, expires_at
  ) values (
    target_tenant_id, target_membership_id, target_workspace_key, 'manual', actor_id,
    btrim(reason_value), expires_at_value
  ) returning enrollment_id into new_enrollment_id;

  insert into public.tenant_workspace_role_assignments (
    tenant_id, workspace_key, enrollment_id, role_key, assigned_by_person_id, reason, expires_at
  ) values (
    target_tenant_id, target_workspace_key, new_enrollment_id, initial_role_key, actor_id,
    btrim(reason_value), expires_at_value
  );

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    target_tenant_id, 'workspace.member_enrolled', 'person', actor_id, '{}', btrim(reason_value),
    gen_random_uuid(), 'tenant_workspace_enrollment', new_enrollment_id::text,
    jsonb_build_object('membership_id', target_membership_id, 'workspace_key', target_workspace_key,
      'initial_role_key', initial_role_key, 'expires_at', expires_at_value)
  );
  return new_enrollment_id;
end;
$$;

create or replace function public.assign_workspace_role(
  target_enrollment_id uuid,
  target_role_key text,
  reason_value text,
  expires_at_value timestamptz default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); enrollment public.tenant_workspace_enrollments;
  new_assignment_id uuid;
begin
  select * into enrollment from public.tenant_workspace_enrollments
  where enrollment_id = target_enrollment_id and status = 'active' for update;
  if enrollment.enrollment_id is null then raise exception 'Active workspace enrollment is required'; end if;
  if not public.can_manage_workspace_access(enrollment.tenant_id) then
    raise exception 'Tenant owner or platform administration access is required';
  end if;
  if nullif(btrim(reason_value), '') is null then raise exception 'Role assignment reason is required'; end if;
  if expires_at_value is not null and expires_at_value <= now() then
    raise exception 'Role expiration must be in the future';
  end if;
  if not exists (
    select 1 from public.workspace_role_catalog
    where workspace_key = enrollment.workspace_key and role_key = target_role_key and assignable
  ) then raise exception 'Role does not belong to this workspace or is not assignable'; end if;

  insert into public.tenant_workspace_role_assignments (
    tenant_id, workspace_key, enrollment_id, role_key, assigned_by_person_id, reason, expires_at
  ) values (
    enrollment.tenant_id, enrollment.workspace_key, enrollment.enrollment_id, target_role_key,
    actor_id, btrim(reason_value), expires_at_value
  ) returning assignment_id into new_assignment_id;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    enrollment.tenant_id, 'workspace.role_assigned', 'person', actor_id, '{}', btrim(reason_value),
    gen_random_uuid(), 'tenant_workspace_role_assignment', new_assignment_id::text,
    jsonb_build_object('workspace_key', enrollment.workspace_key, 'role_key', target_role_key,
      'enrollment_id', enrollment.enrollment_id, 'expires_at', expires_at_value)
  );
  return new_assignment_id;
end;
$$;

create or replace function public.remove_tenant_workspace_enrollment(
  target_enrollment_id uuid,
  reason_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); enrollment public.tenant_workspace_enrollments;
begin
  select * into enrollment from public.tenant_workspace_enrollments
  where enrollment_id = target_enrollment_id and status = 'active' for update;
  if enrollment.enrollment_id is null then raise exception 'Active workspace enrollment is required'; end if;
  if not public.can_manage_workspace_access(enrollment.tenant_id) then
    raise exception 'Tenant owner or platform administration access is required';
  end if;
  if nullif(btrim(reason_value), '') is null then raise exception 'Removal reason is required'; end if;

  update public.tenant_workspace_enrollments set status = 'removed', removed_at = now(),
    removed_by_person_id = actor_id, reason = btrim(reason_value)
  where enrollment_id = target_enrollment_id;
  update public.tenant_workspace_role_assignments set status = 'revoked', revoked_at = now(),
    revoked_by_person_id = actor_id, reason = btrim(reason_value)
  where enrollment_id = target_enrollment_id and status = 'active';

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    enrollment.tenant_id, 'workspace.member_removed', 'person', actor_id, '{}', btrim(reason_value),
    gen_random_uuid(), 'tenant_workspace_enrollment', enrollment.enrollment_id::text,
    jsonb_build_object('workspace_key', enrollment.workspace_key,
      'membership_id', enrollment.membership_id)
  );
  return true;
end;
$$;

create or replace function public.has_community_permission(
  target_tenant_id uuid,
  required_permission_key text
)
returns boolean language sql stable security definer set search_path = public as $$
  select public.tenant_capability_enabled(target_tenant_id, 'app.community')
    and public.has_active_workspace_enrollment(target_tenant_id, 'community')
    and exists (
      select 1
      from public.community_permission_catalog permission
      join public.community_role_permissions role_permission
        on role_permission.permission_key = permission.permission_key
      where permission.permission_key = required_permission_key
        and public.tenant_capability_enabled(target_tenant_id, permission.required_capability_key)
        and public.has_workspace_role(
          target_tenant_id, 'community', array[role_permission.role_key]
        )
    );
$$;

create or replace function public.can_read_community(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_data_admin()
    or (
      public.tenant_capability_enabled(target_tenant_id, 'app.community')
      and public.has_active_workspace_enrollment(target_tenant_id, 'community')
    );
$$;

create or replace function public.can_manage_community_settings(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_data_admin()
    or public.has_workspace_role(target_tenant_id, 'community', array['community_admin']);
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
  group by enrollment.tenant_id, enrollment.membership_id, enrollment.workspace_key,
    catalog.display_name, catalog.sort_order
  order by catalog.sort_order;
$$;

alter table public.product_workspace_catalog enable row level security;
alter table public.workspace_role_catalog enable row level security;
alter table public.tenant_product_workspaces enable row level security;
alter table public.tenant_workspace_enrollments enable row level security;
alter table public.tenant_workspace_role_assignments enable row level security;

create policy product_workspace_catalog_read on public.product_workspace_catalog
  for select to authenticated using (true);
create policy workspace_role_catalog_read on public.workspace_role_catalog
  for select to authenticated using (true);
create policy tenant_product_workspaces_read on public.tenant_product_workspaces
  for select to authenticated using (
    public.has_active_tenant_membership(tenant_id) or public.is_platform_data_admin()
  );
create policy tenant_workspace_enrollments_read on public.tenant_workspace_enrollments
  for select to authenticated using (
    public.can_manage_workspace_access(tenant_id)
    or membership_id in (
      select membership_id from public.tenant_memberships
      where person_id = public.current_person_id() and tenant_id = tenant_workspace_enrollments.tenant_id
    )
  );
create policy tenant_workspace_role_assignments_read on public.tenant_workspace_role_assignments
  for select to authenticated using (
    public.can_manage_workspace_access(tenant_id)
    or enrollment_id in (
      select enrollment.enrollment_id from public.tenant_workspace_enrollments enrollment
      join public.tenant_memberships membership using (membership_id, tenant_id)
      where membership.person_id = public.current_person_id()
    )
  );

grant select on public.product_workspace_catalog, public.workspace_role_catalog,
  public.tenant_product_workspaces, public.tenant_workspace_enrollments,
  public.tenant_workspace_role_assignments to authenticated;
grant all on public.product_workspace_catalog, public.workspace_role_catalog,
  public.tenant_product_workspaces, public.tenant_workspace_enrollments,
  public.tenant_workspace_role_assignments to service_role;

revoke all on function public.seed_product_workspaces() from public, anon, authenticated;
revoke all on function public.has_active_workspace_enrollment(uuid, text) from public, anon, authenticated;
revoke all on function public.has_workspace_role(uuid, text, text[]) from public, anon, authenticated;
revoke all on function public.can_manage_workspace_access(uuid) from public, anon, authenticated;
revoke all on function public.my_workspace_access() from public, anon, authenticated;
revoke all on function public.set_tenant_workspace_status(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.enroll_tenant_workspace_member(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.assign_workspace_role(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.remove_tenant_workspace_enrollment(uuid, text) from public, anon, authenticated;

grant execute on function public.has_active_workspace_enrollment(uuid, text) to authenticated;
grant execute on function public.has_workspace_role(uuid, text, text[]) to authenticated;
grant execute on function public.can_manage_workspace_access(uuid) to authenticated;
grant execute on function public.my_workspace_access() to authenticated;
grant execute on function public.set_tenant_workspace_status(uuid, text, text, text) to authenticated;
grant execute on function public.enroll_tenant_workspace_member(uuid, uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.assign_workspace_role(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.remove_tenant_workspace_enrollment(uuid, text) to authenticated;

comment on table public.tenant_workspace_enrollments is
  'Explicit product enrollment. Tenant membership, Rider status, and Driver status never create rows automatically.';
comment on function public.has_community_permission(uuid, text) is
  'Requires active identity, tenant relationship, enabled Community workspace/capabilities, explicit Community enrollment, and explicit workspace role.';
