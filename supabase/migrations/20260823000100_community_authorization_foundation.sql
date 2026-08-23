-- Community product capability, settings, role-bundle, permission, RLS, and audit foundation.
-- Community remains disabled for every tenant until explicitly enabled by Platform Administration.

create table public.capability_catalog (
  capability_key text primary key,
  product_domain text not null,
  display_name text not null,
  description text not null,
  default_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  constraint capability_catalog_key_check check (
    capability_key ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$'
  ),
  constraint capability_catalog_domain_check check (
    product_domain ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint capability_catalog_display_name_not_blank check (length(btrim(display_name)) > 0),
  constraint capability_catalog_description_not_blank check (length(btrim(description)) > 0)
);

insert into public.capability_catalog (
  capability_key, product_domain, display_name, description, default_enabled
) values
  ('tenant.memberships', 'platform', 'Tenant memberships', 'Tenant membership administration.', true),
  ('tenant.roles', 'platform', 'Tenant roles', 'Tenant role administration.', true),
  ('tenant.audit', 'platform', 'Tenant audit', 'Tenant audit history.', true),
  ('app.admin', 'platform', 'Admin application', 'Tenant administration application.', true),
  ('app.rider', 'transportation', 'Rider application', 'Transportation Rider application.', false),
  ('app.driver', 'transportation', 'Driver application', 'Transportation Driver application.', false),
  ('driver.management', 'transportation', 'Driver management', 'Driver operations and compliance.', false),
  ('vehicle.management', 'transportation', 'Vehicle management', 'Fleet and vehicle operations.', false),
  ('finance.ledger', 'transportation', 'Finance ledger', 'Tenant finance ledger.', false),
  ('pricing.management', 'transportation', 'Pricing management', 'Tenant transportation pricing.', false),
  ('app.community', 'community', 'Community application', 'Community member application and read surfaces.', false),
  ('community.content', 'community', 'Community content', 'Member content and community information.', false),
  ('community.groups', 'community', 'Community groups', 'Community groups and group discussion.', false),
  ('community.services', 'community', 'Community services', 'Provider profiles and service listings.', false),
  ('community.moderation', 'community', 'Community moderation', 'Moderation, verification, and official publication.', false),
  ('community.broadcasts', 'community', 'Community broadcasts', 'Privileged Community notification broadcasts.', false);

alter table public.tenant_capabilities
  drop constraint tenant_capabilities_key_check;

alter table public.tenant_capabilities
  add constraint tenant_capabilities_catalog_fk
  foreign key (capability_key)
  references public.capability_catalog (capability_key)
  on update restrict
  on delete restrict;

create table public.community_permission_catalog (
  permission_key text primary key,
  required_capability_key text not null
    references public.capability_catalog (capability_key) on delete restrict,
  display_name text not null,
  description text not null,
  privileged boolean not null default false,
  created_at timestamptz not null default now(),
  constraint community_permission_catalog_key_check check (
    permission_key ~ '^community\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'
  ),
  constraint community_permission_catalog_display_name_not_blank check (length(btrim(display_name)) > 0),
  constraint community_permission_catalog_description_not_blank check (length(btrim(description)) > 0)
);

insert into public.community_permission_catalog (
  permission_key, required_capability_key, display_name, description, privileged
) values
  ('community.content.create', 'community.content', 'Create content', 'Create and manage own ordinary Community content.', false),
  ('community.content.comment', 'community.content', 'Comment', 'Create and manage own comments.', false),
  ('community.content.react', 'community.content', 'React', 'Create and remove own reactions.', false),
  ('community.events.submit', 'community.content', 'Submit events', 'Submit local events for publication or review.', false),
  ('community.submissions.create', 'community.content', 'Submit announcements', 'Submit content for Community announcement review.', false),
  ('community.groups.participate', 'community.groups', 'Participate in groups', 'Participate in eligible Community groups.', false),
  ('community.services.manage_own', 'community.services', 'Manage own services', 'Manage eligible provider profile and service listings.', false),
  ('community.content.moderate', 'community.moderation', 'Moderate content', 'Moderate Community content and comments.', true),
  ('community.submissions.review', 'community.moderation', 'Review submissions', 'Review announcement submissions.', true),
  ('community.events.approve', 'community.moderation', 'Approve events', 'Approve or reject submitted events.', true),
  ('community.services.moderate', 'community.moderation', 'Moderate services', 'Moderate provider profiles and service listings.', true),
  ('community.content.pin', 'community.moderation', 'Pin content', 'Pin eligible Community content.', true),
  ('community.verifications.manage', 'community.moderation', 'Manage verification', 'Review organization and provider verification.', true),
  ('community.announcements.publish', 'community.moderation', 'Publish announcements', 'Publish official Community announcements.', true),
  ('community.groups.manage', 'community.groups', 'Manage groups', 'Create and moderate Community groups.', true),
  ('community.alerts.urgent', 'community.broadcasts', 'Publish urgent alerts', 'Publish urgent Community alerts.', true),
  ('community.broadcasts.urgent', 'community.broadcasts', 'Broadcast urgent content', 'Authorize urgent Community notification delivery.', true),
  ('community.broadcasts.important', 'community.broadcasts', 'Broadcast important content', 'Authorize important Community notification delivery.', true),
  ('community.alerts.emergency', 'community.broadcasts', 'Publish emergency alerts', 'Publish emergency Community alerts.', true),
  ('community.broadcasts.emergency', 'community.broadcasts', 'Broadcast emergencies', 'Authorize emergency Community notification delivery.', true);

create table public.community_role_catalog (
  role_key text primary key,
  display_name text not null,
  description text not null,
  assignable boolean not null default true,
  created_at timestamptz not null default now(),
  constraint community_role_catalog_key_check check (role_key ~ '^[a-z][a-z0-9_]*$'),
  constraint community_role_catalog_display_name_not_blank check (length(btrim(display_name)) > 0),
  constraint community_role_catalog_description_not_blank check (length(btrim(description)) > 0)
);

insert into public.community_role_catalog (role_key, display_name, description, assignable) values
  ('community_member', 'Community member', 'Baseline permissions derived from active tenant membership.', false),
  ('community_moderator', 'Community moderator', 'Content, event, submission, and service moderation.', true),
  ('community_admin', 'Community administrator', 'Official publication, verification, pinning, and group administration.', false),
  ('emergency_publisher', 'Emergency publisher', 'Separately assigned emergency publication and broadcast authority.', true);

create table public.community_role_permissions (
  role_key text not null references public.community_role_catalog (role_key) on delete cascade,
  permission_key text not null references public.community_permission_catalog (permission_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_key, permission_key)
);

insert into public.community_role_permissions (role_key, permission_key)
select 'community_member', permission_key
from public.community_permission_catalog
where permission_key in (
  'community.content.create',
  'community.content.comment',
  'community.content.react',
  'community.events.submit',
  'community.submissions.create',
  'community.groups.participate',
  'community.services.manage_own'
);

insert into public.community_role_permissions (role_key, permission_key)
select 'community_moderator', permission_key
from public.community_permission_catalog
where permission_key in (
  'community.content.create',
  'community.content.comment',
  'community.content.react',
  'community.events.submit',
  'community.submissions.create',
  'community.groups.participate',
  'community.services.manage_own',
  'community.content.moderate',
  'community.submissions.review',
  'community.events.approve',
  'community.services.moderate'
);

insert into public.community_role_permissions (role_key, permission_key)
select 'community_admin', permission_key
from public.community_permission_catalog
where permission_key not in (
  'community.alerts.emergency',
  'community.broadcasts.emergency'
);

insert into public.community_role_permissions (role_key, permission_key) values
  ('emergency_publisher', 'community.alerts.emergency'),
  ('emergency_publisher', 'community.broadcasts.emergency');

create table public.tenant_community_settings (
  tenant_id uuid primary key references public.tenants (tenant_id) on delete restrict,
  membership_mode text not null default 'approval_required',
  member_posting_enabled boolean not null default true,
  service_provider_posting_enabled boolean not null default false,
  event_submission_requires_review boolean not null default true,
  post_moderation_mode text not null default 'post_publish',
  important_broadcast_enabled boolean not null default false,
  urgent_broadcast_enabled boolean not null default false,
  emergency_broadcast_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  constraint tenant_community_settings_membership_mode_check check (
    membership_mode in ('invite_only', 'approval_required', 'open')
  ),
  constraint tenant_community_settings_moderation_mode_check check (
    post_moderation_mode in ('pre_publish', 'post_publish')
  ),
  constraint tenant_community_settings_broadcast_dependency_check check (
    not emergency_broadcast_enabled or urgent_broadcast_enabled
  )
);

create table public.tenant_community_role_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  membership_id uuid not null,
  role_key text not null references public.community_role_catalog (role_key) on delete restrict,
  status text not null default 'active',
  assigned_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  revoked_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  expires_at timestamptz,
  foreign key (membership_id, tenant_id)
    references public.tenant_memberships (membership_id, tenant_id) on delete cascade,
  constraint tenant_community_role_assignments_status_check check (
    status in ('active', 'revoked', 'expired')
  ),
  constraint tenant_community_role_assignments_reason_not_blank check (length(btrim(reason)) > 0),
  constraint tenant_community_role_assignments_assignable_check check (
    role_key in ('community_moderator', 'emergency_publisher')
  ),
  constraint tenant_community_role_assignments_dates_check check (
    (status = 'active' and revoked_at is null and revoked_by_person_id is null
      and (expires_at is null or expires_at > assigned_at))
    or (status = 'revoked' and revoked_at is not null and revoked_by_person_id is not null)
    or (status = 'expired' and expires_at is not null)
  )
);

create unique index tenant_community_role_assignments_active_idx
  on public.tenant_community_role_assignments (tenant_id, membership_id, role_key)
  where status = 'active';
create index tenant_community_role_assignments_tenant_role_idx
  on public.tenant_community_role_assignments (tenant_id, role_key, status);
create index tenant_community_role_assignments_membership_idx
  on public.tenant_community_role_assignments (membership_id, status);

create trigger tenant_community_settings_set_updated_at
  before update on public.tenant_community_settings
  for each row execute function public.set_updated_at();
create trigger tenant_community_settings_prevent_tenant_id_change
  before update on public.tenant_community_settings
  for each row execute function public.prevent_tenant_id_change();

create or replace function public.attribute_tenant_community_settings_update()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_at := old.created_at;
  new.updated_by_person_id := public.current_person_id();
  return new;
end;
$$;

create trigger tenant_community_settings_attribute_update
  before update on public.tenant_community_settings
  for each row execute function public.attribute_tenant_community_settings_update();
create trigger tenant_community_role_assignments_set_updated_at
  before update on public.tenant_community_role_assignments
  for each row execute function public.set_updated_at();

create or replace function public.prevent_community_role_assignment_identity_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.assignment_id is distinct from old.assignment_id
    or new.tenant_id is distinct from old.tenant_id
    or new.membership_id is distinct from old.membership_id
    or new.role_key is distinct from old.role_key
    or new.assigned_by_person_id is distinct from old.assigned_by_person_id
    or new.assigned_at is distinct from old.assigned_at
  then
    raise exception 'Community role assignment identity cannot change';
  end if;
  if old.status <> 'active' then
    raise exception 'inactive Community role assignments are immutable';
  end if;
  return new;
end;
$$;

create trigger tenant_community_role_assignments_prevent_identity_change
  before update on public.tenant_community_role_assignments
  for each row execute function public.prevent_community_role_assignment_identity_change();

insert into public.tenant_capabilities (
  tenant_id, capability_key, enabled, enabled_at, disabled_at, updated_by_person_id
)
select tenant.tenant_id, capability.capability_key, false, null, now(), null
from public.tenants tenant
cross join (
  values
    ('app.community'),
    ('community.content'),
    ('community.groups'),
    ('community.services'),
    ('community.moderation'),
    ('community.broadcasts')
) as capability(capability_key)
on conflict (tenant_id, capability_key) do nothing;

insert into public.tenant_community_settings (tenant_id)
select tenant_id from public.tenants
on conflict (tenant_id) do nothing;

create or replace function public.seed_community_foundation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tenant_capabilities (
    tenant_id, capability_key, enabled, enabled_at, disabled_at, updated_by_person_id
  ) values
    (new.tenant_id, 'app.community', false, null, now(), null),
    (new.tenant_id, 'community.content', false, null, now(), null),
    (new.tenant_id, 'community.groups', false, null, now(), null),
    (new.tenant_id, 'community.services', false, null, now(), null),
    (new.tenant_id, 'community.moderation', false, null, now(), null),
    (new.tenant_id, 'community.broadcasts', false, null, now(), null)
  on conflict (tenant_id, capability_key) do nothing;

  insert into public.tenant_community_settings (tenant_id)
  values (new.tenant_id)
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

create trigger tenants_seed_community_foundation
  after insert on public.tenants
  for each row execute function public.seed_community_foundation();

create or replace function public.has_community_permission(
  target_tenant_id uuid,
  required_permission_key text
)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_active_tenant_membership(target_tenant_id)
    and public.tenant_capability_enabled(target_tenant_id, 'app.community')
    and exists (
      select 1
      from public.community_permission_catalog permission
      where permission.permission_key = required_permission_key
        and public.tenant_capability_enabled(target_tenant_id, permission.required_capability_key)
        and exists (
          select 1
          from public.community_role_permissions role_permission
          where role_permission.permission_key = permission.permission_key
            and (
              role_permission.role_key = 'community_member'
              or (
                role_permission.role_key = 'community_admin'
                and public.has_tenant_role(target_tenant_id, array['tenant_owner', 'tenant_admin'])
              )
              or exists (
                select 1
                from public.tenant_community_role_assignments assignment
                join public.tenant_memberships membership
                  on membership.membership_id = assignment.membership_id
                 and membership.tenant_id = assignment.tenant_id
                where assignment.tenant_id = target_tenant_id
                  and assignment.role_key = role_permission.role_key
                  and assignment.status = 'active'
                  and (assignment.expires_at is null or assignment.expires_at > now())
                  and membership.person_id = public.current_person_id()
                  and membership.status = 'active'
                  and (membership.expires_at is null or membership.expires_at > now())
              )
            )
        )
    );
$$;

create or replace function public.can_read_community(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_data_admin()
    or (
      public.has_active_tenant_membership(target_tenant_id)
      and public.tenant_capability_enabled(target_tenant_id, 'app.community')
    );
$$;

create or replace function public.can_create_community_content(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_community_permission(target_tenant_id, 'community.content.create')
    and coalesce((
      select settings.member_posting_enabled
      from public.tenant_community_settings settings
      where settings.tenant_id = target_tenant_id
    ), false);
$$;

create or replace function public.can_moderate_community(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.tenant_capability_enabled(target_tenant_id, 'app.community')
    and (
      public.is_platform_data_admin()
      or public.has_community_permission(target_tenant_id, 'community.content.moderate')
    );
$$;

create or replace function public.can_broadcast_community(
  target_tenant_id uuid,
  target_severity text
)
returns boolean language sql stable security definer set search_path = public as $$
  select case target_severity
    when 'important' then
      public.has_community_permission(target_tenant_id, 'community.broadcasts.important')
      and coalesce((select important_broadcast_enabled from public.tenant_community_settings
        where tenant_id = target_tenant_id), false)
    when 'urgent' then
      public.has_community_permission(target_tenant_id, 'community.broadcasts.urgent')
      and coalesce((select urgent_broadcast_enabled from public.tenant_community_settings
        where tenant_id = target_tenant_id), false)
    when 'emergency' then
      public.has_community_permission(target_tenant_id, 'community.broadcasts.emergency')
      and coalesce((select emergency_broadcast_enabled from public.tenant_community_settings
        where tenant_id = target_tenant_id), false)
    else false
  end;
$$;

create or replace function public.can_manage_community_settings(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_data_admin()
    or (
      public.has_tenant_role(target_tenant_id, array['tenant_owner', 'tenant_admin'])
      and public.tenant_capability_enabled(target_tenant_id, 'app.community')
    );
$$;

alter table public.capability_catalog enable row level security;
alter table public.community_permission_catalog enable row level security;
alter table public.community_role_catalog enable row level security;
alter table public.community_role_permissions enable row level security;
alter table public.tenant_community_settings enable row level security;
alter table public.tenant_community_role_assignments enable row level security;

create policy capability_catalog_authenticated_select on public.capability_catalog
  for select to authenticated using (true);
create policy community_permission_catalog_authenticated_select on public.community_permission_catalog
  for select to authenticated using (true);
create policy community_role_catalog_authenticated_select on public.community_role_catalog
  for select to authenticated using (true);
create policy community_role_permissions_authenticated_select on public.community_role_permissions
  for select to authenticated using (true);
create policy tenant_community_settings_select on public.tenant_community_settings
  for select to authenticated using (public.can_read_community(tenant_id));
create policy tenant_community_settings_update on public.tenant_community_settings
  for update to authenticated
  using (public.can_manage_community_settings(tenant_id))
  with check (public.can_manage_community_settings(tenant_id));
create policy tenant_community_role_assignments_select on public.tenant_community_role_assignments
  for select to authenticated using (
    public.is_platform_data_admin()
    or public.can_moderate_community(tenant_id)
    or membership_id = (
      select membership.membership_id from public.tenant_memberships membership
      where membership.tenant_id = tenant_community_role_assignments.tenant_id
        and membership.person_id = public.current_person_id()
      limit 1
    )
  );

grant select on public.capability_catalog, public.community_permission_catalog,
  public.community_role_catalog, public.community_role_permissions to authenticated;
grant select, update on public.tenant_community_settings to authenticated;
grant select on public.tenant_community_role_assignments to authenticated;
grant all on public.capability_catalog, public.community_permission_catalog,
  public.community_role_catalog, public.community_role_permissions,
  public.tenant_community_settings, public.tenant_community_role_assignments to service_role;

create or replace function public.assign_community_role(
  target_tenant_id uuid,
  target_membership_id uuid,
  target_role_key text,
  reason_value text,
  expires_at_value timestamptz default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  new_assignment_id uuid;
begin
  if not public.tenant_capability_enabled(target_tenant_id, 'app.community') then
    raise exception 'Community is not enabled for this tenant';
  end if;
  if not public.has_tenant_role(target_tenant_id, array['tenant_owner', 'tenant_admin'])
    and not public.is_platform_data_admin()
  then
    raise exception 'Community role administration access is required';
  end if;
  if target_role_key not in ('community_moderator', 'emergency_publisher') then
    raise exception 'Community role is not assignable';
  end if;
  if target_role_key = 'emergency_publisher'
    and not public.tenant_capability_enabled(target_tenant_id, 'community.broadcasts')
  then
    raise exception 'Community broadcasts are not enabled';
  end if;
  if nullif(btrim(reason_value), '') is null then
    raise exception 'Community role assignment reason is required';
  end if;
  if expires_at_value is not null and expires_at_value <= now() then
    raise exception 'Community role expiration must be in the future';
  end if;
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.membership_id = target_membership_id
      and membership.status = 'active'
      and (membership.expires_at is null or membership.expires_at > now())
  ) then
    raise exception 'Active target tenant membership is required';
  end if;

  insert into public.tenant_community_role_assignments (
    tenant_id, membership_id, role_key, assigned_by_person_id, reason, expires_at
  ) values (
    target_tenant_id, target_membership_id, target_role_key, actor_id,
    btrim(reason_value), expires_at_value
  ) returning assignment_id into new_assignment_id;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    target_tenant_id, 'community.role_assigned', 'person', actor_id, '{}', btrim(reason_value),
    gen_random_uuid(), 'community_role_assignment', new_assignment_id::text,
    jsonb_build_object('membership_id', target_membership_id, 'role_key', target_role_key,
      'expires_at', expires_at_value)
  );
  return new_assignment_id;
end;
$$;

create or replace function public.revoke_community_role(
  target_assignment_id uuid,
  reason_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  assignment public.tenant_community_role_assignments;
begin
  select * into assignment from public.tenant_community_role_assignments
  where assignment_id = target_assignment_id for update;
  if assignment.assignment_id is null or assignment.status <> 'active' then
    raise exception 'Active Community role assignment is required';
  end if;
  if not public.has_tenant_role(assignment.tenant_id, array['tenant_owner', 'tenant_admin'])
    and not public.is_platform_data_admin()
  then
    raise exception 'Community role administration access is required';
  end if;
  if nullif(btrim(reason_value), '') is null then
    raise exception 'Community role revocation reason is required';
  end if;

  update public.tenant_community_role_assignments set
    status = 'revoked', revoked_at = now(), revoked_by_person_id = actor_id,
    reason = btrim(reason_value)
  where assignment_id = target_assignment_id;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    assignment.tenant_id, 'community.role_revoked', 'person', actor_id, '{}', btrim(reason_value),
    gen_random_uuid(), 'community_role_assignment', assignment.assignment_id::text,
    jsonb_build_object('membership_id', assignment.membership_id, 'role_key', assignment.role_key)
  );
  return true;
end;
$$;

create or replace function public.audit_tenant_community_settings_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new is distinct from old then
    insert into public.tenant_audit_events (
      tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
      correlation_id, resource_type, resource_id, metadata
    ) values (
      new.tenant_id, 'community.settings_updated', 'person', public.current_person_id(), '{}',
      'Community settings updated.', gen_random_uuid(), 'tenant_community_settings', new.tenant_id::text,
      jsonb_build_object(
        'membership_mode', new.membership_mode,
        'member_posting_enabled', new.member_posting_enabled,
        'service_provider_posting_enabled', new.service_provider_posting_enabled,
        'event_submission_requires_review', new.event_submission_requires_review,
        'post_moderation_mode', new.post_moderation_mode,
        'important_broadcast_enabled', new.important_broadcast_enabled,
        'urgent_broadcast_enabled', new.urgent_broadcast_enabled,
        'emergency_broadcast_enabled', new.emergency_broadcast_enabled
      )
    );
  end if;
  return new;
end;
$$;

create trigger tenant_community_settings_audit
  after update on public.tenant_community_settings
  for each row execute function public.audit_tenant_community_settings_change();

revoke all on function public.seed_community_foundation() from public, anon, authenticated;
revoke all on function public.has_community_permission(uuid, text) from public, anon, authenticated;
revoke all on function public.can_read_community(uuid) from public, anon, authenticated;
revoke all on function public.can_create_community_content(uuid) from public, anon, authenticated;
revoke all on function public.can_moderate_community(uuid) from public, anon, authenticated;
revoke all on function public.can_broadcast_community(uuid, text) from public, anon, authenticated;
revoke all on function public.can_manage_community_settings(uuid) from public, anon, authenticated;
revoke all on function public.assign_community_role(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.revoke_community_role(uuid, text) from public, anon, authenticated;

grant execute on function public.has_community_permission(uuid, text) to authenticated;
grant execute on function public.can_read_community(uuid) to authenticated;
grant execute on function public.can_create_community_content(uuid) to authenticated;
grant execute on function public.can_moderate_community(uuid) to authenticated;
grant execute on function public.can_broadcast_community(uuid, text) to authenticated;
grant execute on function public.can_manage_community_settings(uuid) to authenticated;
grant execute on function public.assign_community_role(uuid, uuid, text, text, timestamptz)
  to authenticated;
grant execute on function public.revoke_community_role(uuid, text) to authenticated;
