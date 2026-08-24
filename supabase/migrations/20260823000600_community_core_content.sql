-- Community core content, typed records, targeting, actions, and first member feed slice.
-- Community remains disabled until tenant governance deliberately enables every required capability.

create table public.community_content_kinds (
  content_kind text primary key,
  display_name text not null,
  official_only boolean not null default false,
  constraint community_content_kinds_key_check check (content_kind ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint community_content_kinds_name_check check (length(btrim(display_name)) between 1 and 80)
);

insert into public.community_content_kinds (content_kind, display_name, official_only) values
  ('post', 'Community post', false),
  ('announcement', 'Announcement', true),
  ('event', 'Event', false),
  ('alert', 'Alert', true),
  ('help_request', 'Help request', false),
  ('opportunity', 'Opportunity', false),
  ('resource', 'Resource', false),
  ('service_promotion', 'Service promotion', false);

create table public.community_content_items (
  content_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  content_kind text not null references public.community_content_kinds (content_kind) on delete restrict,
  author_membership_id uuid not null,
  author_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  publishing_organization_id uuid,
  title text,
  body text not null,
  visibility text not null default 'members',
  priority text not null default 'normal',
  publication_status text not null default 'draft',
  moderation_status text not null default 'clear',
  published_at timestamptz,
  expires_at timestamptz,
  pinned_at timestamptz,
  pinned_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  removed_at timestamptz,
  removed_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  removal_reason text,
  source_content_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || body)
  ) stored,
  unique (tenant_id, content_id),
  foreign key (author_membership_id, tenant_id)
    references public.tenant_memberships (membership_id, tenant_id) on delete restrict,
  foreign key (tenant_id, publishing_organization_id)
    references public.community_organizations (tenant_id, organization_id) on delete restrict,
  foreign key (tenant_id, source_content_id)
    references public.community_content_items (tenant_id, content_id) on delete restrict,
  constraint community_content_title_check check (title is null or length(btrim(title)) between 1 and 180),
  constraint community_content_body_check check (length(btrim(body)) between 1 and 10000),
  constraint community_content_visibility_check check (visibility in ('public', 'members', 'group_private')),
  constraint community_content_priority_check check (priority in ('normal', 'important', 'urgent', 'emergency')),
  constraint community_content_publication_check check (publication_status in ('draft', 'submitted', 'published', 'rejected', 'expired', 'archived')),
  constraint community_content_moderation_check check (moderation_status in ('clear', 'under_review', 'restricted', 'removed')),
  constraint community_content_publication_dates_check check (
    (publication_status = 'published' and published_at is not null)
    or (publication_status <> 'published')
  ),
  constraint community_content_expiration_check check (expires_at is null or (published_at is not null and expires_at > published_at)),
  constraint community_content_pin_check check ((pinned_at is null) = (pinned_by_person_id is null)),
  constraint community_content_removal_check check (
    (removed_at is null and removed_by_person_id is null and removal_reason is null)
    or (removed_at is not null and removed_by_person_id is not null and length(btrim(removal_reason)) between 3 and 1000)
  ),
  constraint community_content_official_priority_check check (
    priority in ('normal', 'important') or content_kind = 'alert'
  )
);

create index community_content_feed_idx on public.community_content_items
  (tenant_id, publication_status, moderation_status, published_at desc);
create index community_content_kind_idx on public.community_content_items
  (tenant_id, content_kind, published_at desc);
create index community_content_expiration_idx on public.community_content_items (expires_at)
  where expires_at is not null and publication_status = 'published';
create index community_content_search_idx on public.community_content_items using gin (search_vector);

create or replace function public.protect_community_content_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tenant_id <> old.tenant_id
    or new.content_kind <> old.content_kind
    or new.author_membership_id <> old.author_membership_id
    or new.author_person_id <> old.author_person_id
    or new.created_at <> old.created_at then
    raise exception 'Community content identity is immutable';
  end if;
  if old.publication_status in ('published', 'expired', 'archived')
    and (new.publishing_organization_id is distinct from old.publishing_organization_id
      or new.published_at is distinct from old.published_at
      or new.source_content_id is distinct from old.source_content_id) then
    raise exception 'Published Community attribution is immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger community_content_identity_guard
  before update on public.community_content_items
  for each row execute function public.protect_community_content_identity();

create table public.community_posts (
  tenant_id uuid not null,
  content_id uuid primary key,
  post_category text not null default 'general',
  foreign key (tenant_id, content_id) references public.community_content_items (tenant_id, content_id) on delete cascade,
  constraint community_posts_category_check check (post_category in ('general', 'discussion', 'question'))
);

create table public.community_announcements (
  tenant_id uuid not null,
  content_id uuid primary key,
  notification_policy text not null default 'in_app',
  foreign key (tenant_id, content_id) references public.community_content_items (tenant_id, content_id) on delete cascade,
  constraint community_announcements_notification_check check (notification_policy in ('in_app', 'important', 'urgent', 'emergency'))
);

create table public.community_events (
  tenant_id uuid not null,
  content_id uuid primary key,
  organizer_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location_name text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  capacity integer,
  rsvp_enabled boolean not null default true,
  external_registration_url text,
  event_status text not null default 'scheduled',
  foreign key (tenant_id, content_id) references public.community_content_items (tenant_id, content_id) on delete cascade,
  constraint community_events_organizer_check check (length(btrim(organizer_name)) between 1 and 160),
  constraint community_events_dates_check check (ends_at > starts_at),
  constraint community_events_capacity_check check (capacity is null or capacity > 0),
  constraint community_events_coordinates_check check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180)),
  constraint community_events_url_check check (external_registration_url is null or external_registration_url ~ '^https://'),
  constraint community_events_status_check check (event_status in ('scheduled', 'cancelled', 'past'))
);
create index community_events_time_idx on public.community_events (tenant_id, starts_at, ends_at);

create table public.community_alerts (
  tenant_id uuid not null,
  content_id uuid primary key,
  effective_at timestamptz not null,
  resolved_at timestamptz,
  alert_status text not null default 'active',
  foreign key (tenant_id, content_id) references public.community_content_items (tenant_id, content_id) on delete cascade,
  constraint community_alerts_status_check check (alert_status in ('active', 'resolved')),
  constraint community_alerts_resolution_check check ((alert_status = 'active' and resolved_at is null) or (alert_status = 'resolved' and resolved_at is not null and resolved_at >= effective_at))
);

create table public.community_help_requests (
  tenant_id uuid not null,
  content_id uuid primary key,
  help_category text not null,
  request_status text not null default 'open',
  resolved_at timestamptz,
  foreign key (tenant_id, content_id) references public.community_content_items (tenant_id, content_id) on delete cascade,
  constraint community_help_category_check check (length(btrim(help_category)) between 1 and 80),
  constraint community_help_status_check check (request_status in ('open', 'in_progress', 'resolved', 'cancelled')),
  constraint community_help_resolution_check check (
    (request_status in ('open', 'in_progress') and resolved_at is null)
    or (request_status = 'resolved' and resolved_at is not null)
    or request_status = 'cancelled'
  )
);

create table public.community_opportunities (
  tenant_id uuid not null,
  content_id uuid primary key,
  opportunity_type text not null,
  deadline_at timestamptz,
  opportunity_status text not null default 'open',
  foreign key (tenant_id, content_id) references public.community_content_items (tenant_id, content_id) on delete cascade,
  constraint community_opportunity_type_check check (opportunity_type in ('job', 'volunteer', 'grant', 'education', 'other')),
  constraint community_opportunity_status_check check (opportunity_status in ('open', 'closed', 'cancelled'))
);

create table public.community_resources (
  tenant_id uuid not null,
  content_id uuid primary key,
  resource_category text not null,
  provider_name text,
  foreign key (tenant_id, content_id) references public.community_content_items (tenant_id, content_id) on delete cascade,
  constraint community_resources_category_check check (length(btrim(resource_category)) between 1 and 80)
);

create or replace function public.validate_community_typed_content()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.community_content_items item
    where item.tenant_id = new.tenant_id and item.content_id = new.content_id
      and item.content_kind = tg_argv[0]
  ) then
    raise exception 'Typed Community record does not match its content kind';
  end if;
  return new;
end;
$$;

create trigger community_posts_kind before insert or update on public.community_posts
  for each row execute function public.validate_community_typed_content('post');
create trigger community_announcements_kind before insert or update on public.community_announcements
  for each row execute function public.validate_community_typed_content('announcement');
create trigger community_events_kind before insert or update on public.community_events
  for each row execute function public.validate_community_typed_content('event');
create trigger community_alerts_kind before insert or update on public.community_alerts
  for each row execute function public.validate_community_typed_content('alert');
create trigger community_help_requests_kind before insert or update on public.community_help_requests
  for each row execute function public.validate_community_typed_content('help_request');
create trigger community_opportunities_kind before insert or update on public.community_opportunities
  for each row execute function public.validate_community_typed_content('opportunity');
create trigger community_resources_kind before insert or update on public.community_resources
  for each row execute function public.validate_community_typed_content('resource');

create table public.community_content_targets (
  target_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  content_id uuid not null,
  target_type text not null,
  area_id uuid,
  group_id uuid,
  organization_id uuid,
  membership_id uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, target_id),
  foreign key (tenant_id, content_id) references public.community_content_items (tenant_id, content_id) on delete cascade,
  foreign key (tenant_id, area_id) references public.community_areas (tenant_id, area_id) on delete restrict,
  foreign key (tenant_id, group_id) references public.community_groups (tenant_id, group_id) on delete restrict,
  foreign key (tenant_id, organization_id) references public.community_organizations (tenant_id, organization_id) on delete restrict,
  foreign key (membership_id, tenant_id) references public.tenant_memberships (membership_id, tenant_id) on delete restrict,
  constraint community_targets_type_check check (target_type in ('tenant', 'area', 'group', 'organization', 'member')),
  constraint community_targets_exact_check check (
    (target_type = 'tenant' and num_nonnulls(area_id, group_id, organization_id, membership_id) = 0)
    or (target_type = 'area' and area_id is not null and num_nonnulls(group_id, organization_id, membership_id) = 0)
    or (target_type = 'group' and group_id is not null and num_nonnulls(area_id, organization_id, membership_id) = 0)
    or (target_type = 'organization' and organization_id is not null and num_nonnulls(area_id, group_id, membership_id) = 0)
    or (target_type = 'member' and membership_id is not null and num_nonnulls(area_id, group_id, organization_id) = 0)
  ),
  unique nulls not distinct (content_id, target_type, area_id, group_id, organization_id, membership_id)
);
create index community_targets_area_idx on public.community_content_targets (tenant_id, area_id) where area_id is not null;
create index community_targets_group_idx on public.community_content_targets (tenant_id, group_id) where group_id is not null;

create or replace function public.can_operate_community(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_read_community(target_tenant_id)
    and public.has_active_product_session(target_tenant_id, 'community');
$$;

create or replace function public.can_read_community_content(
  target_tenant_id uuid,
  target_content_id uuid
)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_content_items item
    where item.tenant_id = target_tenant_id
      and item.content_id = target_content_id
      and item.publication_status = 'published'
      and item.moderation_status = 'clear'
      and (item.expires_at is null or item.expires_at > now())
      and (
        (item.visibility = 'public' and public.community_public_enabled(target_tenant_id))
        or (
          public.can_operate_community(target_tenant_id)
          and (
            item.visibility in ('public', 'members')
            or (
              item.visibility = 'group_private'
              and exists (
                select 1 from public.community_content_targets target
                join public.community_group_memberships group_member
                  on group_member.tenant_id = target.tenant_id
                 and group_member.group_id = target.group_id
                where target.tenant_id = item.tenant_id
                  and target.content_id = item.content_id
                  and target.target_type = 'group'
                  and group_member.membership_id = public.current_tenant_membership_id(target_tenant_id)
                  and group_member.status = 'active'
              )
            )
          )
        )
      )
  );
$$;

create table public.community_content_actions (
  action_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  content_id uuid not null,
  action_kind text not null,
  label text not null,
  action_url text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, content_id) references public.community_content_items (tenant_id, content_id) on delete cascade,
  constraint community_actions_kind_check check (action_kind in ('rsvp', 'directions', 'add_to_calendar', 'register', 'apply', 'volunteer', 'call', 'email', 'visit_website', 'request_service', 'message_provider', 'download', 'report_issue', 'learn_more')),
  constraint community_actions_label_check check (length(btrim(label)) between 1 and 80),
  constraint community_actions_url_check check (action_url ~ '^(https://|mailto:|tel:)'),
  constraint community_actions_order_check check (sort_order between 0 and 20),
  unique (content_id, sort_order)
);

create or replace function public.create_my_community_post(
  target_tenant_id uuid,
  title_value text,
  body_value text,
  visibility_value text default 'members'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  membership_id_value uuid := public.current_tenant_membership_id(target_tenant_id);
  content_id_value uuid;
begin
  if actor_id is null or membership_id_value is null
    or not public.has_active_product_session(target_tenant_id, 'community')
    or not public.can_create_community_content(target_tenant_id) then
    raise exception 'Community posting is not permitted';
  end if;
  if visibility_value not in ('public', 'members') then raise exception 'Invalid visibility'; end if;

  insert into public.community_content_items (
    tenant_id, content_kind, author_membership_id, author_person_id, title, body,
    visibility, publication_status, published_at
  ) values (
    target_tenant_id, 'post', membership_id_value, actor_id, nullif(btrim(title_value), ''),
    btrim(body_value), visibility_value, 'published', now()
  ) returning content_id into content_id_value;
  insert into public.community_posts (tenant_id, content_id) values (target_tenant_id, content_id_value);
  insert into public.community_content_targets (tenant_id, content_id, target_type)
    values (target_tenant_id, content_id_value, 'tenant');
  return content_id_value;
end;
$$;

create or replace function public.community_feed_snapshot(target_tenant_id uuid, result_limit integer default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tenant_id', target_tenant_id,
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'content_id', feed.content_id, 'content_kind', feed.content_kind, 'title', feed.title,
      'body', feed.body, 'visibility', feed.visibility, 'priority', feed.priority,
      'published_at', feed.published_at, 'expires_at', feed.expires_at,
      'author_name', feed.author_name
    ) order by feed.published_at desc) filter (where feed.content_id is not null), '[]'::jsonb)
  )
  from (
    select item.content_id, item.content_kind, item.title, item.body, item.visibility,
      item.priority, item.published_at, item.expires_at, profile.display_name as author_name
    from public.community_content_items item
    join public.person_profiles profile on profile.person_id = item.author_person_id
    where item.tenant_id = target_tenant_id
      and public.can_operate_community(target_tenant_id)
      and public.can_read_community_content(item.tenant_id, item.content_id)
    order by item.published_at desc
    limit greatest(1, least(coalesce(result_limit, 50), 100))
  ) feed;
$$;

alter table public.community_content_kinds enable row level security;
alter table public.community_content_items enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_announcements enable row level security;
alter table public.community_events enable row level security;
alter table public.community_alerts enable row level security;
alter table public.community_help_requests enable row level security;
alter table public.community_opportunities enable row level security;
alter table public.community_resources enable row level security;
alter table public.community_content_targets enable row level security;
alter table public.community_content_actions enable row level security;

create policy community_content_kinds_read on public.community_content_kinds for select using (true);
create policy community_content_items_read on public.community_content_items for select using (
  public.can_read_community_content(tenant_id, content_id)
);
create policy community_posts_read on public.community_posts for select using (
  exists (select 1 from public.community_content_items item where item.tenant_id = community_posts.tenant_id and item.content_id = community_posts.content_id)
);
create policy community_announcements_read on public.community_announcements for select using (
  exists (select 1 from public.community_content_items item where item.tenant_id = community_announcements.tenant_id and item.content_id = community_announcements.content_id)
);
create policy community_events_read on public.community_events for select using (
  exists (select 1 from public.community_content_items item where item.tenant_id = community_events.tenant_id and item.content_id = community_events.content_id)
);
create policy community_alerts_read on public.community_alerts for select using (
  exists (select 1 from public.community_content_items item where item.tenant_id = community_alerts.tenant_id and item.content_id = community_alerts.content_id)
);
create policy community_help_requests_read on public.community_help_requests for select using (
  exists (select 1 from public.community_content_items item where item.tenant_id = community_help_requests.tenant_id and item.content_id = community_help_requests.content_id)
);
create policy community_opportunities_read on public.community_opportunities for select using (
  exists (select 1 from public.community_content_items item where item.tenant_id = community_opportunities.tenant_id and item.content_id = community_opportunities.content_id)
);
create policy community_resources_read on public.community_resources for select using (
  exists (select 1 from public.community_content_items item where item.tenant_id = community_resources.tenant_id and item.content_id = community_resources.content_id)
);
create policy community_targets_read on public.community_content_targets for select using (
  exists (select 1 from public.community_content_items item where item.tenant_id = community_content_targets.tenant_id and item.content_id = community_content_targets.content_id)
);
create policy community_actions_read on public.community_content_actions for select using (
  exists (select 1 from public.community_content_items item where item.tenant_id = community_content_actions.tenant_id and item.content_id = community_content_actions.content_id)
);

revoke all on public.community_content_kinds, public.community_content_items, public.community_posts,
  public.community_announcements, public.community_events, public.community_alerts,
  public.community_help_requests, public.community_opportunities, public.community_resources,
  public.community_content_targets, public.community_content_actions from public, anon, authenticated;
grant select on public.community_content_kinds to anon, authenticated;
grant select on public.community_content_items, public.community_posts, public.community_announcements,
  public.community_events, public.community_alerts, public.community_help_requests,
  public.community_opportunities, public.community_resources, public.community_content_targets,
  public.community_content_actions to anon, authenticated;
revoke all on function public.can_operate_community(uuid) from public, anon, authenticated;
revoke all on function public.can_read_community_content(uuid,uuid) from public, anon, authenticated;
revoke all on function public.create_my_community_post(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.community_feed_snapshot(uuid,integer) from public, anon, authenticated;
grant execute on function public.can_operate_community(uuid) to authenticated;
grant execute on function public.can_read_community_content(uuid,uuid) to anon, authenticated;
grant execute on function public.create_my_community_post(uuid,text,text,text) to authenticated;
grant execute on function public.community_feed_snapshot(uuid,integer) to authenticated;

comment on function public.create_my_community_post(uuid,text,text,text) is
  'Creates an ordinary member-authored Community post. Official, priority, pin, moderation, and broadcast fields are not caller-controlled.';
