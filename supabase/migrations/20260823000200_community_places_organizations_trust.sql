-- Community areas, groups, organizations, providers, and verification foundation.
-- All Community capabilities remain disabled unless explicitly enabled for a pilot tenant.

insert into public.community_permission_catalog
  (permission_key, required_capability_key, display_name, description, privileged)
values
  ('community.organizations.create', 'community.content', 'Create organizations', 'Create a Community organization profile.', false),
  ('community.organizations.manage_own', 'community.content', 'Manage own organizations', 'Manage organizations represented by the member.', false),
  ('community.verifications.submit', 'community.content', 'Submit verification', 'Submit organization or provider verification for review.', false);

insert into public.community_role_permissions (role_key, permission_key)
select role_key, permission_key
from (values
  ('community_member', 'community.organizations.create'),
  ('community_member', 'community.organizations.manage_own'),
  ('community_member', 'community.verifications.submit'),
  ('community_moderator', 'community.organizations.create'),
  ('community_moderator', 'community.organizations.manage_own'),
  ('community_moderator', 'community.verifications.submit'),
  ('community_admin', 'community.organizations.create'),
  ('community_admin', 'community.organizations.manage_own'),
  ('community_admin', 'community.verifications.submit')
) as value(role_key, permission_key);

create table public.community_areas (
  area_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  parent_area_id uuid,
  area_type text not null,
  name text not null,
  description text,
  visibility text not null default 'members',
  status text not null default 'draft',
  center_latitude numeric(9, 6),
  center_longitude numeric(9, 6),
  radius_km numeric(8, 2),
  created_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  updated_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, area_id),
  foreign key (tenant_id, parent_area_id)
    references public.community_areas (tenant_id, area_id) on delete restrict,
  constraint community_areas_type_check check (area_type in ('city', 'neighborhood', 'district', 'other')),
  constraint community_areas_name_not_blank check (length(btrim(name)) between 1 and 120),
  constraint community_areas_visibility_check check (visibility in ('public', 'members')),
  constraint community_areas_status_check check (status in ('draft', 'active', 'inactive')),
  constraint community_areas_parent_check check (parent_area_id is null or parent_area_id <> area_id),
  constraint community_areas_geometry_check check (
    (center_latitude is null and center_longitude is null and radius_km is null)
    or (center_latitude between -90 and 90 and center_longitude between -180 and 180
      and radius_km > 0 and radius_km <= 1000)
  ),
  unique (tenant_id, name)
);

create table public.community_groups (
  group_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  area_id uuid,
  name text not null,
  group_slug text not null,
  description text,
  visibility text not null default 'members',
  membership_mode text not null default 'approval_required',
  status text not null default 'draft',
  created_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  updated_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, group_id),
  foreign key (tenant_id, area_id) references public.community_areas (tenant_id, area_id) on delete restrict,
  constraint community_groups_name_not_blank check (length(btrim(name)) between 1 and 120),
  constraint community_groups_slug_check check (group_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint community_groups_visibility_check check (visibility in ('public', 'members', 'private')),
  constraint community_groups_membership_mode_check check (membership_mode in ('open', 'approval_required', 'invite_only')),
  constraint community_groups_status_check check (status in ('draft', 'active', 'inactive', 'archived')),
  unique (tenant_id, group_slug)
);

create table public.community_group_memberships (
  group_membership_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  group_id uuid not null,
  membership_id uuid not null,
  group_role text not null default 'member',
  status text not null default 'pending',
  joined_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, group_id) references public.community_groups (tenant_id, group_id) on delete cascade,
  foreign key (membership_id, tenant_id) references public.tenant_memberships (membership_id, tenant_id) on delete cascade,
  constraint community_group_memberships_role_check check (group_role in ('member', 'moderator', 'owner')),
  constraint community_group_memberships_status_check check (status in ('pending', 'active', 'rejected', 'removed')),
  constraint community_group_memberships_dates_check check (
    (status = 'active' and joined_at is not null and ended_at is null)
    or (status = 'pending' and joined_at is null and ended_at is null)
    or (status in ('rejected', 'removed') and ended_at is not null)
  )
);
create unique index community_group_memberships_current_idx
  on public.community_group_memberships (tenant_id, group_id, membership_id)
  where status in ('pending', 'active');

create table public.community_organizations (
  organization_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  name text not null,
  organization_slug text not null,
  summary text,
  website_url text,
  public_email text,
  public_phone text,
  visibility text not null default 'members',
  status text not null default 'draft',
  created_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  updated_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, organization_id),
  constraint community_organizations_name_not_blank check (length(btrim(name)) between 1 and 160),
  constraint community_organizations_slug_check check (organization_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint community_organizations_visibility_check check (visibility in ('public', 'members')),
  constraint community_organizations_status_check check (status in ('draft', 'active', 'suspended', 'inactive')),
  constraint community_organizations_website_check check (website_url is null or website_url ~ '^https://'),
  constraint community_organizations_email_check check (public_email is null or public_email = lower(btrim(public_email))),
  unique (tenant_id, organization_slug)
);

create table public.community_organization_memberships (
  organization_membership_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  organization_id uuid not null,
  membership_id uuid not null,
  organization_role text not null default 'member',
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, organization_id) references public.community_organizations (tenant_id, organization_id) on delete cascade,
  foreign key (membership_id, tenant_id) references public.tenant_memberships (membership_id, tenant_id) on delete cascade,
  constraint community_organization_memberships_role_check check (organization_role in ('owner', 'admin', 'editor', 'member')),
  constraint community_organization_memberships_status_check check (status in ('active', 'removed')),
  constraint community_organization_memberships_dates_check check (
    (status = 'active' and ended_at is null) or (status = 'removed' and ended_at is not null)
  )
);
create unique index community_organization_memberships_active_idx
  on public.community_organization_memberships (tenant_id, organization_id, membership_id)
  where status = 'active';

create table public.community_provider_profiles (
  provider_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  owner_membership_id uuid,
  owner_organization_id uuid,
  display_name text not null,
  summary text,
  status text not null default 'draft',
  created_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  updated_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_id),
  foreign key (owner_membership_id, tenant_id) references public.tenant_memberships (membership_id, tenant_id) on delete restrict,
  foreign key (tenant_id, owner_organization_id) references public.community_organizations (tenant_id, organization_id) on delete restrict,
  constraint community_provider_profiles_owner_check check (
    (owner_membership_id is not null and owner_organization_id is null)
    or (owner_membership_id is null and owner_organization_id is not null)
  ),
  constraint community_provider_profiles_name_not_blank check (length(btrim(display_name)) between 1 and 160),
  constraint community_provider_profiles_status_check check (status in ('draft', 'active', 'suspended', 'inactive'))
);
create unique index community_provider_person_owner_idx
  on public.community_provider_profiles (tenant_id, owner_membership_id) where owner_membership_id is not null;
create unique index community_provider_org_owner_idx
  on public.community_provider_profiles (tenant_id, owner_organization_id) where owner_organization_id is not null;

create table public.community_organization_verifications (
  verification_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  organization_id uuid not null,
  verification_type text not null,
  status text not null default 'pending',
  evidence_reference text not null,
  submitted_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  reviewed_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  review_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  effective_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, organization_id) references public.community_organizations (tenant_id, organization_id) on delete restrict,
  constraint community_organization_verifications_type_check check (verification_type in ('nonprofit', 'business', 'government', 'community_official', 'other')),
  constraint community_organization_verifications_status_check check (status in ('pending', 'verified', 'rejected', 'suspended', 'expired')),
  constraint community_organization_verifications_evidence_check check (length(btrim(evidence_reference)) between 1 and 500),
  constraint community_organization_verifications_review_check check (
    (status = 'pending' and reviewed_by_person_id is null and reviewed_at is null and review_reason is null and effective_at is null)
    or (status = 'verified' and reviewed_by_person_id is not null and reviewed_at is not null and review_reason is not null and effective_at is not null)
    or (status in ('rejected', 'suspended', 'expired') and reviewed_by_person_id is not null and reviewed_at is not null and review_reason is not null)
  ),
  constraint community_organization_verifications_expiration_check check (expires_at is null or expires_at > submitted_at)
);
create unique index community_organization_verifications_current_idx
  on public.community_organization_verifications (tenant_id, organization_id)
  where status in ('pending', 'verified');

create table public.community_provider_verifications (
  verification_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  provider_id uuid not null,
  verification_type text not null,
  status text not null default 'pending',
  evidence_reference text not null,
  submitted_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  reviewed_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  review_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  effective_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, provider_id) references public.community_provider_profiles (tenant_id, provider_id) on delete restrict,
  constraint community_provider_verifications_type_check check (verification_type in ('identity', 'business', 'license', 'insurance', 'other')),
  constraint community_provider_verifications_status_check check (status in ('pending', 'verified', 'rejected', 'suspended', 'expired')),
  constraint community_provider_verifications_evidence_check check (length(btrim(evidence_reference)) between 1 and 500),
  constraint community_provider_verifications_review_check check (
    (status = 'pending' and reviewed_by_person_id is null and reviewed_at is null and review_reason is null and effective_at is null)
    or (status = 'verified' and reviewed_by_person_id is not null and reviewed_at is not null and review_reason is not null and effective_at is not null)
    or (status in ('rejected', 'suspended', 'expired') and reviewed_by_person_id is not null and reviewed_at is not null and review_reason is not null)
  ),
  constraint community_provider_verifications_expiration_check check (expires_at is null or expires_at > submitted_at)
);
create unique index community_provider_verifications_current_idx
  on public.community_provider_verifications (tenant_id, provider_id)
  where status in ('pending', 'verified');

create index community_areas_tenant_status_idx on public.community_areas (tenant_id, status, name);
create index community_areas_parent_idx on public.community_areas (tenant_id, parent_area_id);
create index community_groups_tenant_status_idx on public.community_groups (tenant_id, status, name);
create index community_groups_area_idx on public.community_groups (tenant_id, area_id, status);
create index community_group_memberships_member_idx on public.community_group_memberships (tenant_id, membership_id, status);
create index community_organizations_tenant_status_idx on public.community_organizations (tenant_id, status, name);
create index community_organization_memberships_member_idx on public.community_organization_memberships (tenant_id, membership_id, status);
create index community_provider_profiles_tenant_status_idx on public.community_provider_profiles (tenant_id, status, display_name);
create index community_org_verifications_queue_idx on public.community_organization_verifications (tenant_id, status, submitted_at);
create index community_provider_verifications_queue_idx on public.community_provider_verifications (tenant_id, status, submitted_at);

create or replace function public.community_public_enabled(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tenants where tenant_id = target_tenant_id and status = 'active')
    and public.tenant_capability_enabled(target_tenant_id, 'app.community');
$$;

create or replace function public.current_tenant_membership_id(target_tenant_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select membership.membership_id from public.tenant_memberships membership
  where membership.tenant_id = target_tenant_id
    and membership.person_id = public.current_person_id()
    and membership.status = 'active'
    and (membership.expires_at is null or membership.expires_at > now()) limit 1;
$$;

create or replace function public.represents_community_organization(target_tenant_id uuid, target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_organization_memberships representative
    where representative.tenant_id = target_tenant_id
      and representative.organization_id = target_organization_id
      and representative.membership_id = public.current_tenant_membership_id(target_tenant_id)
      and representative.status = 'active'
      and representative.organization_role in ('owner', 'admin', 'editor')
  );
$$;

create or replace function public.owns_community_provider(target_tenant_id uuid, target_provider_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_provider_profiles provider
    where provider.tenant_id = target_tenant_id and provider.provider_id = target_provider_id
      and (provider.owner_membership_id = public.current_tenant_membership_id(target_tenant_id)
        or (provider.owner_organization_id is not null
          and public.represents_community_organization(target_tenant_id, provider.owner_organization_id)))
  );
$$;

create or replace function public.guard_community_owned_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tenant_id is distinct from old.tenant_id then raise exception 'Community tenant cannot change'; end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

do $$ declare table_name text; begin
  foreach table_name in array array['community_areas','community_groups','community_group_memberships',
    'community_organizations','community_organization_memberships','community_provider_profiles',
    'community_organization_verifications','community_provider_verifications'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.guard_community_owned_identity()',
      table_name || '_guard', table_name);
  end loop;
end $$;

alter table public.community_areas enable row level security;
alter table public.community_groups enable row level security;
alter table public.community_group_memberships enable row level security;
alter table public.community_organizations enable row level security;
alter table public.community_organization_memberships enable row level security;
alter table public.community_provider_profiles enable row level security;
alter table public.community_organization_verifications enable row level security;
alter table public.community_provider_verifications enable row level security;

create policy community_areas_public_select on public.community_areas for select to anon
  using (visibility = 'public' and status = 'active' and public.community_public_enabled(tenant_id));
create policy community_areas_member_select on public.community_areas for select to authenticated
  using (public.can_read_community(tenant_id));
create policy community_groups_public_select on public.community_groups for select to anon
  using (visibility = 'public' and status = 'active' and public.community_public_enabled(tenant_id)
    and public.tenant_capability_enabled(tenant_id, 'community.groups'));
create policy community_groups_member_select on public.community_groups for select to authenticated
  using (public.can_read_community(tenant_id)
    and public.tenant_capability_enabled(tenant_id, 'community.groups'));
create policy community_group_memberships_self_or_manager_select on public.community_group_memberships for select to authenticated
  using (public.tenant_capability_enabled(tenant_id, 'community.groups')
    and (membership_id = public.current_tenant_membership_id(tenant_id) or public.can_moderate_community(tenant_id)));
create policy community_organizations_public_select on public.community_organizations for select to anon
  using (visibility = 'public' and status = 'active' and public.community_public_enabled(tenant_id)
    and public.tenant_capability_enabled(tenant_id, 'community.content'));
create policy community_organizations_member_select on public.community_organizations for select to authenticated
  using (public.can_read_community(tenant_id)
    and public.tenant_capability_enabled(tenant_id, 'community.content'));
create policy community_organization_memberships_self_or_manager_select on public.community_organization_memberships for select to authenticated
  using (membership_id = public.current_tenant_membership_id(tenant_id) or public.can_moderate_community(tenant_id));
create policy community_provider_profiles_member_select on public.community_provider_profiles for select to authenticated
  using (public.tenant_capability_enabled(tenant_id, 'community.services')
    and public.can_read_community(tenant_id));
create policy community_organization_verifications_owner_or_manager_select on public.community_organization_verifications for select to authenticated
  using (public.represents_community_organization(tenant_id, organization_id) or public.can_moderate_community(tenant_id));
create policy community_provider_verifications_owner_or_manager_select on public.community_provider_verifications for select to authenticated
  using (public.owns_community_provider(tenant_id, provider_id) or public.can_moderate_community(tenant_id));

grant select on public.community_areas, public.community_groups, public.community_organizations to anon;
grant select on public.community_areas, public.community_groups, public.community_group_memberships,
  public.community_organizations, public.community_organization_memberships,
  public.community_provider_profiles, public.community_organization_verifications,
  public.community_provider_verifications to authenticated;
grant all on public.community_areas, public.community_groups, public.community_group_memberships,
  public.community_organizations, public.community_organization_memberships,
  public.community_provider_profiles, public.community_organization_verifications,
  public.community_provider_verifications to service_role;

create or replace function public.create_community_area(
  target_tenant_id uuid, area_type_value text, name_value text, description_value text default null,
  parent_area_id_value uuid default null, visibility_value text default 'members',
  center_latitude_value numeric default null, center_longitude_value numeric default null,
  radius_km_value numeric default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); new_id uuid;
begin
  if not public.has_community_permission(target_tenant_id,'community.groups.manage') then
    raise exception 'Community area administration access is required'; end if;
  insert into public.community_areas
    (tenant_id,parent_area_id,area_type,name,description,visibility,status,center_latitude,
      center_longitude,radius_km,created_by_person_id,updated_by_person_id)
  values (target_tenant_id,parent_area_id_value,area_type_value,btrim(name_value),
    nullif(btrim(description_value),''),visibility_value,'active',center_latitude_value,
    center_longitude_value,radius_km_value,actor_id,actor_id)
  returning area_id into new_id;
  insert into public.tenant_audit_events
    (tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,reason,correlation_id,resource_type,resource_id,metadata)
  values (target_tenant_id,'community.area_created','person',actor_id,'{}','Community area created.',
    gen_random_uuid(),'community_area',new_id::text,jsonb_build_object('area_type',area_type_value));
  return new_id;
end $$;

create or replace function public.create_community_group(
  target_tenant_id uuid, name_value text, slug_value text, description_value text default null,
  area_id_value uuid default null, visibility_value text default 'members',
  membership_mode_value text default 'approval_required'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); member_id uuid; new_id uuid;
begin
  if not public.has_community_permission(target_tenant_id,'community.groups.manage') then
    raise exception 'Community group administration access is required'; end if;
  member_id := public.current_tenant_membership_id(target_tenant_id);
  insert into public.community_groups
    (tenant_id,area_id,name,group_slug,description,visibility,membership_mode,status,
      created_by_person_id,updated_by_person_id)
  values (target_tenant_id,area_id_value,btrim(name_value),lower(btrim(slug_value)),
    nullif(btrim(description_value),''),visibility_value,membership_mode_value,'active',actor_id,actor_id)
  returning group_id into new_id;
  insert into public.community_group_memberships
    (tenant_id,group_id,membership_id,group_role,status,joined_at)
  values (target_tenant_id,new_id,member_id,'owner','active',now());
  insert into public.tenant_audit_events
    (tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,reason,correlation_id,resource_type,resource_id,metadata)
  values (target_tenant_id,'community.group_created','person',actor_id,'{}','Community group created.',
    gen_random_uuid(),'community_group',new_id::text,jsonb_build_object('slug',lower(btrim(slug_value))));
  return new_id;
end $$;

create or replace function public.create_community_organization(
  target_tenant_id uuid, name_value text, slug_value text, summary_value text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); member_id uuid; new_id uuid;
begin
  if not public.has_community_permission(target_tenant_id, 'community.organizations.create') then
    raise exception 'Community organization creation access is required'; end if;
  member_id := public.current_tenant_membership_id(target_tenant_id);
  if nullif(btrim(name_value), '') is null or lower(btrim(slug_value)) !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Valid organization name and slug are required'; end if;
  insert into public.community_organizations
    (tenant_id,name,organization_slug,summary,created_by_person_id,updated_by_person_id)
  values (target_tenant_id,btrim(name_value),lower(btrim(slug_value)),nullif(btrim(summary_value),''),actor_id,actor_id)
  returning organization_id into new_id;
  insert into public.community_organization_memberships
    (tenant_id,organization_id,membership_id,organization_role)
  values (target_tenant_id,new_id,member_id,'owner');
  insert into public.tenant_audit_events
    (tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,reason,correlation_id,resource_type,resource_id,metadata)
  values (target_tenant_id,'community.organization_created','person',actor_id,'{}','Community organization created.',
    gen_random_uuid(),'community_organization',new_id::text,jsonb_build_object('slug',lower(btrim(slug_value))));
  return new_id;
end $$;

create or replace function public.create_my_community_provider(
  target_tenant_id uuid, display_name_value text, summary_value text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); member_id uuid; new_id uuid;
begin
  if not public.has_community_permission(target_tenant_id, 'community.services.manage_own')
    or not coalesce((select service_provider_posting_enabled from public.tenant_community_settings where tenant_id=target_tenant_id),false)
  then raise exception 'Community provider posting is not enabled'; end if;
  member_id := public.current_tenant_membership_id(target_tenant_id);
  if nullif(btrim(display_name_value),'') is null then raise exception 'Provider display name is required'; end if;
  insert into public.community_provider_profiles
    (tenant_id,owner_membership_id,display_name,summary,created_by_person_id,updated_by_person_id)
  values (target_tenant_id,member_id,btrim(display_name_value),nullif(btrim(summary_value),''),actor_id,actor_id)
  returning provider_id into new_id;
  insert into public.tenant_audit_events
    (tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,reason,correlation_id,resource_type,resource_id,metadata)
  values (target_tenant_id,'community.provider_created','person',actor_id,'{}','Community provider profile created.',
    gen_random_uuid(),'community_provider',new_id::text,'{}');
  return new_id;
end $$;

create or replace function public.submit_community_organization_verification(
  target_tenant_id uuid, target_organization_id uuid, verification_type_value text,
  evidence_reference_value text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); new_id uuid;
begin
  if not public.has_community_permission(target_tenant_id,'community.verifications.submit')
    or not public.represents_community_organization(target_tenant_id,target_organization_id)
  then raise exception 'Organization verification submission access is required'; end if;
  insert into public.community_organization_verifications
    (tenant_id,organization_id,verification_type,evidence_reference,submitted_by_person_id)
  values (target_tenant_id,target_organization_id,verification_type_value,
    btrim(evidence_reference_value),actor_id) returning verification_id into new_id;
  insert into public.tenant_audit_events
    (tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,reason,correlation_id,resource_type,resource_id,metadata)
  values (target_tenant_id,'community.organization_verification_submitted','person',actor_id,'{}',
    'Organization verification submitted.',gen_random_uuid(),'community_verification',new_id::text,
    jsonb_build_object('organization_id',target_organization_id,'verification_type',verification_type_value));
  return new_id;
end $$;

create or replace function public.submit_community_provider_verification(
  target_tenant_id uuid, target_provider_id uuid, verification_type_value text,
  evidence_reference_value text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); new_id uuid;
begin
  if not public.has_community_permission(target_tenant_id,'community.verifications.submit')
    or not public.owns_community_provider(target_tenant_id,target_provider_id)
  then raise exception 'Provider verification submission access is required'; end if;
  insert into public.community_provider_verifications
    (tenant_id,provider_id,verification_type,evidence_reference,submitted_by_person_id)
  values (target_tenant_id,target_provider_id,verification_type_value,
    btrim(evidence_reference_value),actor_id) returning verification_id into new_id;
  insert into public.tenant_audit_events
    (tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,reason,correlation_id,resource_type,resource_id,metadata)
  values (target_tenant_id,'community.provider_verification_submitted','person',actor_id,'{}',
    'Provider verification submitted.',gen_random_uuid(),'community_verification',new_id::text,
    jsonb_build_object('provider_id',target_provider_id,'verification_type',verification_type_value));
  return new_id;
end $$;

create or replace function public.review_community_verification(
  target_kind text, target_verification_id uuid, target_status text, reason_value text,
  expires_at_value timestamptz default null
)
returns boolean language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); target_tenant_id uuid;
begin
  if target_status not in ('verified','rejected') or nullif(btrim(reason_value),'') is null then
    raise exception 'Valid verification decision and reason are required'; end if;
  if target_kind = 'organization' then
    select tenant_id into target_tenant_id from public.community_organization_verifications
      where verification_id=target_verification_id and status='pending' for update;
  elsif target_kind = 'provider' then
    select tenant_id into target_tenant_id from public.community_provider_verifications
      where verification_id=target_verification_id and status='pending' for update;
  else raise exception 'Invalid verification kind'; end if;
  if target_tenant_id is null or not public.has_community_permission(target_tenant_id,'community.verifications.manage') then
    raise exception 'Community verification review access is required'; end if;
  if target_status='verified' and expires_at_value is not null and expires_at_value <= now() then
    raise exception 'Verification expiration must be in the future'; end if;
  if target_kind='organization' then
    update public.community_organization_verifications set status=target_status,reviewed_by_person_id=actor_id,
      review_reason=btrim(reason_value),reviewed_at=now(),effective_at=case when target_status='verified' then now() end,
      expires_at=case when target_status='verified' then expires_at_value end where verification_id=target_verification_id;
  else
    update public.community_provider_verifications set status=target_status,reviewed_by_person_id=actor_id,
      review_reason=btrim(reason_value),reviewed_at=now(),effective_at=case when target_status='verified' then now() end,
      expires_at=case when target_status='verified' then expires_at_value end where verification_id=target_verification_id;
  end if;
  insert into public.tenant_audit_events
    (tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,reason,correlation_id,resource_type,resource_id,metadata)
  values (target_tenant_id,'community.verification_reviewed','person',actor_id,'{}',btrim(reason_value),gen_random_uuid(),
    'community_verification',target_verification_id::text,jsonb_build_object('kind',target_kind,'status',target_status));
  return true;
end $$;

revoke all on function public.community_public_enabled(uuid) from public, anon, authenticated;
revoke all on function public.current_tenant_membership_id(uuid) from public, anon, authenticated;
revoke all on function public.represents_community_organization(uuid,uuid) from public, anon, authenticated;
revoke all on function public.owns_community_provider(uuid,uuid) from public, anon, authenticated;
revoke all on function public.create_community_area(uuid,text,text,text,uuid,text,numeric,numeric,numeric) from public, anon, authenticated;
revoke all on function public.create_community_group(uuid,text,text,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.create_community_organization(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.create_my_community_provider(uuid,text,text) from public, anon, authenticated;
revoke all on function public.submit_community_organization_verification(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.submit_community_provider_verification(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.review_community_verification(text,uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.community_public_enabled(uuid) to anon, authenticated;
grant execute on function public.current_tenant_membership_id(uuid) to authenticated;
grant execute on function public.represents_community_organization(uuid,uuid) to authenticated;
grant execute on function public.owns_community_provider(uuid,uuid) to authenticated;
grant execute on function public.create_community_area(uuid,text,text,text,uuid,text,numeric,numeric,numeric) to authenticated;
grant execute on function public.create_community_group(uuid,text,text,text,uuid,text,text) to authenticated;
grant execute on function public.create_community_organization(uuid,text,text,text) to authenticated;
grant execute on function public.create_my_community_provider(uuid,text,text) to authenticated;
grant execute on function public.submit_community_organization_verification(uuid,uuid,text,text) to authenticated;
grant execute on function public.submit_community_provider_verification(uuid,uuid,text,text) to authenticated;
grant execute on function public.review_community_verification(text,uuid,text,text,timestamptz) to authenticated;
