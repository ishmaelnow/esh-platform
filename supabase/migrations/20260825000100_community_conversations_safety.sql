-- Community Conversations and Safety V1: comments, reactions, private media, reports,
-- personal blocks/mutes, and reasoned moderation. Community product admission remains required.

create table public.community_reaction_kinds (
  reaction_kind text primary key,
  display_name text not null,
  sort_order smallint not null,
  constraint community_reaction_kind_check check (reaction_kind in ('like', 'support', 'helpful')),
  constraint community_reaction_display_check check (length(btrim(display_name)) between 1 and 40),
  unique (sort_order)
);

insert into public.community_reaction_kinds (reaction_kind, display_name, sort_order) values
  ('like', 'Like', 10),
  ('support', 'Support', 20),
  ('helpful', 'Helpful', 30);

create table public.community_comments (
  comment_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  content_id uuid not null,
  parent_comment_id uuid,
  author_membership_id uuid not null,
  author_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  body text not null,
  moderation_status text not null default 'clear',
  removed_at timestamptz,
  removed_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  removal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, comment_id),
  foreign key (tenant_id, content_id)
    references public.community_content_items (tenant_id, content_id) on delete cascade,
  foreign key (tenant_id, parent_comment_id)
    references public.community_comments (tenant_id, comment_id) on delete restrict,
  foreign key (author_membership_id, tenant_id)
    references public.tenant_memberships (membership_id, tenant_id) on delete restrict,
  constraint community_comment_body_check check (length(btrim(body)) between 1 and 3000),
  constraint community_comment_moderation_check check (
    moderation_status in ('clear', 'under_review', 'restricted', 'removed')
  ),
  constraint community_comment_removal_check check (
    (removed_at is null and removed_by_person_id is null and removal_reason is null)
    or (removed_at is not null and removed_by_person_id is not null
      and length(btrim(removal_reason)) between 3 and 1000)
  )
);
create index community_comments_content_idx
  on public.community_comments (tenant_id, content_id, created_at);
create index community_comments_author_idx
  on public.community_comments (tenant_id, author_person_id, created_at desc);

create or replace function public.protect_community_comment_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tenant_id <> old.tenant_id
    or new.content_id <> old.content_id
    or new.parent_comment_id is distinct from old.parent_comment_id
    or new.author_membership_id <> old.author_membership_id
    or new.author_person_id <> old.author_person_id
    or new.created_at <> old.created_at then
    raise exception 'Community comment identity is immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger community_comment_identity_guard before update on public.community_comments
  for each row execute function public.protect_community_comment_identity();

create or replace function public.validate_community_comment_parent()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.parent_comment_id is not null and not exists (
    select 1 from public.community_comments parent
    where parent.tenant_id = new.tenant_id
      and parent.comment_id = new.parent_comment_id
      and parent.content_id = new.content_id
      and parent.parent_comment_id is null
      and parent.moderation_status = 'clear'
  ) then
    raise exception 'Replies may be nested one level beneath a visible comment';
  end if;
  return new;
end;
$$;
create trigger community_comment_parent_guard before insert on public.community_comments
  for each row execute function public.validate_community_comment_parent();

create table public.community_content_reactions (
  reaction_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  content_id uuid not null,
  actor_membership_id uuid not null,
  actor_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  reaction_kind text not null references public.community_reaction_kinds (reaction_kind) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, content_id)
    references public.community_content_items (tenant_id, content_id) on delete cascade,
  foreign key (actor_membership_id, tenant_id)
    references public.tenant_memberships (membership_id, tenant_id) on delete restrict,
  unique (tenant_id, content_id, actor_person_id, reaction_kind)
);
create index community_content_reactions_summary_idx
  on public.community_content_reactions (tenant_id, content_id, reaction_kind);

create table public.community_comment_reactions (
  reaction_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  comment_id uuid not null,
  actor_membership_id uuid not null,
  actor_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  reaction_kind text not null references public.community_reaction_kinds (reaction_kind) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, comment_id)
    references public.community_comments (tenant_id, comment_id) on delete cascade,
  foreign key (actor_membership_id, tenant_id)
    references public.tenant_memberships (membership_id, tenant_id) on delete restrict,
  unique (tenant_id, comment_id, actor_person_id, reaction_kind)
);
create index community_comment_reactions_summary_idx
  on public.community_comment_reactions (tenant_id, comment_id, reaction_kind);

create table public.community_user_blocks (
  block_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  owner_membership_id uuid not null,
  owner_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  blocked_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (owner_membership_id, tenant_id)
    references public.tenant_memberships (membership_id, tenant_id) on delete restrict,
  constraint community_block_self_check check (owner_person_id <> blocked_person_id)
);
create unique index community_user_blocks_active_idx
  on public.community_user_blocks (tenant_id, owner_person_id, blocked_person_id)
  where ended_at is null;

create table public.community_user_mutes (
  mute_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  owner_membership_id uuid not null,
  owner_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  muted_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (owner_membership_id, tenant_id)
    references public.tenant_memberships (membership_id, tenant_id) on delete restrict,
  constraint community_mute_self_check check (owner_person_id <> muted_person_id)
);
create unique index community_user_mutes_active_idx
  on public.community_user_mutes (tenant_id, owner_person_id, muted_person_id)
  where ended_at is null;

create table public.community_reports (
  report_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  reporter_membership_id uuid not null,
  reporter_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  target_type text not null,
  content_id uuid,
  comment_id uuid,
  category text not null,
  details text,
  status text not null default 'open',
  resolution text,
  resolved_at timestamptz,
  resolved_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (reporter_membership_id, tenant_id)
    references public.tenant_memberships (membership_id, tenant_id) on delete restrict,
  foreign key (tenant_id, content_id)
    references public.community_content_items (tenant_id, content_id) on delete restrict,
  foreign key (tenant_id, comment_id)
    references public.community_comments (tenant_id, comment_id) on delete restrict,
  constraint community_report_target_check check (
    (target_type = 'content' and content_id is not null and comment_id is null)
    or (target_type = 'comment' and comment_id is not null and content_id is null)
  ),
  constraint community_report_category_check check (
    category in ('harassment', 'hate', 'misinformation', 'spam', 'unsafe', 'privacy', 'other')
  ),
  constraint community_report_details_check check (
    details is null or length(btrim(details)) between 3 and 1000
  ),
  constraint community_report_status_check check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  constraint community_report_resolution_check check (
    (status in ('open', 'reviewing') and resolution is null and resolved_at is null and resolved_by_person_id is null)
    or (status in ('resolved', 'dismissed') and length(btrim(resolution)) between 3 and 1000
      and resolved_at is not null and resolved_by_person_id is not null)
  )
);
create index community_reports_queue_idx on public.community_reports (tenant_id, status, created_at);
create unique index community_reports_open_content_idx
  on public.community_reports (tenant_id, reporter_person_id, content_id)
  where status in ('open', 'reviewing') and content_id is not null;
create unique index community_reports_open_comment_idx
  on public.community_reports (tenant_id, reporter_person_id, comment_id)
  where status in ('open', 'reviewing') and comment_id is not null;

create table public.community_media_assets (
  media_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  owner_membership_id uuid not null,
  owner_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  storage_path text not null unique,
  mime_type text not null,
  byte_size bigint not null,
  alt_text text,
  moderation_status text not null default 'clear',
  created_at timestamptz not null default now(),
  foreign key (owner_membership_id, tenant_id)
    references public.tenant_memberships (membership_id, tenant_id) on delete restrict,
  constraint community_media_path_check check (storage_path !~ '(^|/)\.\.(/|$)'),
  constraint community_media_type_check check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint community_media_size_check check (byte_size between 1 and 5242880),
  constraint community_media_alt_check check (alt_text is null or length(btrim(alt_text)) between 1 and 300),
  constraint community_media_moderation_check check (moderation_status in ('clear', 'restricted', 'removed'))
);

create table public.community_content_media (
  tenant_id uuid not null,
  content_id uuid not null,
  media_id uuid not null,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  primary key (content_id, media_id),
  foreign key (tenant_id, content_id)
    references public.community_content_items (tenant_id, content_id) on delete cascade,
  foreign key (media_id) references public.community_media_assets (media_id) on delete restrict,
  constraint community_content_media_order_check check (sort_order between 0 and 3),
  unique (content_id, sort_order)
);
create index community_content_media_tenant_idx on public.community_content_media (tenant_id, content_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-media', 'community-media', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.community_actor_hidden(target_tenant_id uuid, other_person_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_user_blocks relation
    where relation.tenant_id = target_tenant_id and relation.ended_at is null
      and ((relation.owner_person_id = public.current_person_id() and relation.blocked_person_id = other_person_id)
        or (relation.blocked_person_id = public.current_person_id() and relation.owner_person_id = other_person_id))
  ) or exists (
    select 1 from public.community_user_mutes relation
    where relation.tenant_id = target_tenant_id and relation.ended_at is null
      and relation.owner_person_id = public.current_person_id()
      and relation.muted_person_id = other_person_id
  );
$$;

create or replace function public.create_my_community_comment(
  target_tenant_id uuid, target_content_id uuid, body_value text, parent_comment_id_value uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  membership_id_value uuid := public.current_tenant_membership_id(target_tenant_id);
  author_id uuid;
  new_id uuid;
begin
  if not public.can_operate_community(target_tenant_id)
    or not public.has_community_permission(target_tenant_id, 'community.content.comment')
    or not public.can_read_community_content(target_tenant_id, target_content_id) then
    raise exception 'Community commenting is not permitted';
  end if;
  select author_person_id into author_id from public.community_content_items
    where tenant_id = target_tenant_id and content_id = target_content_id;
  if public.community_actor_hidden(target_tenant_id, author_id) then
    raise exception 'Interaction with this Community member is unavailable';
  end if;
  if (select count(*) from public.community_comments where author_person_id = actor_id
      and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Comment limit reached. Please try again later';
  end if;
  insert into public.community_comments (
    tenant_id, content_id, parent_comment_id, author_membership_id, author_person_id, body
  ) values (
    target_tenant_id, target_content_id, parent_comment_id_value, membership_id_value, actor_id,
    btrim(body_value)
  ) returning comment_id into new_id;
  return new_id;
end;
$$;

create or replace function public.toggle_my_community_content_reaction(
  target_tenant_id uuid, target_content_id uuid, reaction_kind_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  membership_id_value uuid := public.current_tenant_membership_id(target_tenant_id);
begin
  if not public.can_operate_community(target_tenant_id)
    or not public.has_community_permission(target_tenant_id, 'community.content.react')
    or not public.can_read_community_content(target_tenant_id, target_content_id)
    or not exists (select 1 from public.community_reaction_kinds where reaction_kind = reaction_kind_value) then
    raise exception 'Community reaction is not permitted';
  end if;
  if exists (select 1 from public.community_content_reactions where tenant_id = target_tenant_id
    and content_id = target_content_id and actor_person_id = actor_id and reaction_kind = reaction_kind_value) then
    delete from public.community_content_reactions where tenant_id = target_tenant_id
      and content_id = target_content_id and actor_person_id = actor_id and reaction_kind = reaction_kind_value;
    return false;
  end if;
  insert into public.community_content_reactions (
    tenant_id, content_id, actor_membership_id, actor_person_id, reaction_kind
  ) values (target_tenant_id, target_content_id, membership_id_value, actor_id, reaction_kind_value);
  return true;
end;
$$;

create or replace function public.toggle_my_community_comment_reaction(
  target_tenant_id uuid, target_comment_id uuid, reaction_kind_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  membership_id_value uuid := public.current_tenant_membership_id(target_tenant_id);
  comment_row public.community_comments;
begin
  select * into comment_row from public.community_comments
    where tenant_id = target_tenant_id and comment_id = target_comment_id;
  if comment_row.comment_id is null or comment_row.moderation_status <> 'clear'
    or not public.can_operate_community(target_tenant_id)
    or not public.has_community_permission(target_tenant_id, 'community.content.react')
    or not public.can_read_community_content(target_tenant_id, comment_row.content_id)
    or not exists (select 1 from public.community_reaction_kinds where reaction_kind = reaction_kind_value) then
    raise exception 'Community reaction is not permitted';
  end if;
  if exists (select 1 from public.community_comment_reactions where tenant_id = target_tenant_id
    and comment_id = target_comment_id and actor_person_id = actor_id and reaction_kind = reaction_kind_value) then
    delete from public.community_comment_reactions where tenant_id = target_tenant_id
      and comment_id = target_comment_id and actor_person_id = actor_id and reaction_kind = reaction_kind_value;
    return false;
  end if;
  insert into public.community_comment_reactions (
    tenant_id, comment_id, actor_membership_id, actor_person_id, reaction_kind
  ) values (target_tenant_id, target_comment_id, membership_id_value, actor_id, reaction_kind_value);
  return true;
end;
$$;

create or replace function public.report_community_item(
  target_tenant_id uuid, target_type_value text, target_id_value uuid,
  category_value text, details_value text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  membership_id_value uuid := public.current_tenant_membership_id(target_tenant_id);
  content_id_value uuid;
  target_author_id uuid;
  report_id_value uuid;
begin
  if not public.can_operate_community(target_tenant_id) then raise exception 'Community reporting is not permitted'; end if;
  if (select count(*) from public.community_reports where reporter_person_id = actor_id
      and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Report limit reached. Please try again later';
  end if;
  if target_type_value = 'content' then
    select content_id, author_person_id into content_id_value, target_author_id
      from public.community_content_items where tenant_id = target_tenant_id and content_id = target_id_value;
  elsif target_type_value = 'comment' then
    select content_id, author_person_id into content_id_value, target_author_id
      from public.community_comments where tenant_id = target_tenant_id and comment_id = target_id_value;
  else raise exception 'Invalid report target'; end if;
  if content_id_value is null or target_author_id = actor_id
    or not public.can_read_community_content(target_tenant_id, content_id_value) then
    raise exception 'Community report target is unavailable';
  end if;
  insert into public.community_reports (
    tenant_id, reporter_membership_id, reporter_person_id, target_type, content_id, comment_id,
    category, details
  ) values (
    target_tenant_id, membership_id_value, actor_id, target_type_value,
    case when target_type_value = 'content' then target_id_value end,
    case when target_type_value = 'comment' then target_id_value end,
    category_value, nullif(btrim(details_value), '')
  ) returning report_id into report_id_value;
  return report_id_value;
end;
$$;

create or replace function public.set_my_community_relationship(
  target_tenant_id uuid, target_person_id uuid, relationship_type text, active_value boolean
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  membership_id_value uuid := public.current_tenant_membership_id(target_tenant_id);
begin
  if not public.can_operate_community(target_tenant_id) or actor_id = target_person_id
    or not exists (select 1 from public.tenant_memberships membership
      where membership.tenant_id = target_tenant_id and membership.person_id = target_person_id
        and membership.status = 'active') then
    raise exception 'Community relationship is not permitted';
  end if;
  if relationship_type = 'block' then
    if active_value and not exists (select 1 from public.community_user_blocks where tenant_id = target_tenant_id
      and owner_person_id = actor_id and blocked_person_id = target_person_id and ended_at is null) then
      insert into public.community_user_blocks (tenant_id, owner_membership_id, owner_person_id, blocked_person_id)
        values (target_tenant_id, membership_id_value, actor_id, target_person_id);
    elsif not active_value then
      update public.community_user_blocks set ended_at = now() where tenant_id = target_tenant_id
        and owner_person_id = actor_id and blocked_person_id = target_person_id and ended_at is null;
    end if;
  elsif relationship_type = 'mute' then
    if active_value and not exists (select 1 from public.community_user_mutes where tenant_id = target_tenant_id
      and owner_person_id = actor_id and muted_person_id = target_person_id and ended_at is null) then
      insert into public.community_user_mutes (tenant_id, owner_membership_id, owner_person_id, muted_person_id)
        values (target_tenant_id, membership_id_value, actor_id, target_person_id);
    elsif not active_value then
      update public.community_user_mutes set ended_at = now() where tenant_id = target_tenant_id
        and owner_person_id = actor_id and muted_person_id = target_person_id and ended_at is null;
    end if;
  else raise exception 'Invalid Community relationship'; end if;
  return active_value;
end;
$$;

create or replace function public.my_community_safety_snapshot(target_tenant_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.can_operate_community(target_tenant_id) then
    jsonb_build_object('blocked', '[]'::jsonb, 'muted', '[]'::jsonb)
  else jsonb_build_object(
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('person_id', relation.blocked_person_id,
      'display_name', profile.display_name) order by profile.display_name)
      from public.community_user_blocks relation join public.person_profiles profile
        on profile.person_id = relation.blocked_person_id
      where relation.tenant_id = target_tenant_id and relation.owner_person_id = public.current_person_id()
        and relation.ended_at is null), '[]'::jsonb),
    'muted', coalesce((select jsonb_agg(jsonb_build_object('person_id', relation.muted_person_id,
      'display_name', profile.display_name) order by profile.display_name)
      from public.community_user_mutes relation join public.person_profiles profile
        on profile.person_id = relation.muted_person_id
      where relation.tenant_id = target_tenant_id and relation.owner_person_id = public.current_person_id()
        and relation.ended_at is null), '[]'::jsonb)
  ) end;
$$;

create or replace function public.attach_my_community_media(
  target_tenant_id uuid, target_content_id uuid, storage_path_value text,
  mime_type_value text, byte_size_value bigint, alt_text_value text, sort_order_value smallint
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  membership_id_value uuid := public.current_tenant_membership_id(target_tenant_id);
  media_id_value uuid;
begin
  if not public.can_operate_community(target_tenant_id)
    or not exists (select 1 from public.community_content_items item where item.tenant_id = target_tenant_id
      and item.content_id = target_content_id and item.author_person_id = actor_id
      and item.publication_status = 'published' and item.moderation_status = 'clear') then
    raise exception 'Community media attachment is not permitted';
  end if;
  if storage_path_value !~ ('^' || target_tenant_id::text || '/' || auth.uid()::text || '/[0-9a-f-]+/[^/]+$')
    or not exists (select 1 from storage.objects object where object.bucket_id = 'community-media'
      and object.name = storage_path_value
      and object.metadata ->> 'mimetype' = mime_type_value
      and (object.metadata ->> 'size')::bigint = byte_size_value) then
    raise exception 'Community media upload was not found';
  end if;
  insert into public.community_media_assets (
    tenant_id, owner_membership_id, owner_person_id, storage_path, mime_type, byte_size, alt_text
  ) values (
    target_tenant_id, membership_id_value, actor_id, storage_path_value, mime_type_value,
    byte_size_value, nullif(btrim(alt_text_value), '')
  ) returning media_id into media_id_value;
  insert into public.community_content_media (tenant_id, content_id, media_id, sort_order)
    values (target_tenant_id, target_content_id, media_id_value, sort_order_value);
  return media_id_value;
end;
$$;

create or replace function public.community_feed_snapshot(target_tenant_id uuid, result_limit integer default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('tenant_id', target_tenant_id, 'items', coalesce(jsonb_agg(feed.item order by feed.published_at desc), '[]'::jsonb))
  from (
    select item.published_at, jsonb_build_object(
      'content_id', item.content_id, 'content_kind', item.content_kind, 'title', item.title,
      'body', item.body, 'visibility', item.visibility, 'priority', item.priority,
      'published_at', item.published_at, 'expires_at', item.expires_at,
      'author_name', profile.display_name, 'author_person_id', item.author_person_id,
      'viewer_is_author', item.author_person_id = public.current_person_id(),
      'reaction_counts', (select coalesce(jsonb_object_agg(summary.reaction_kind, summary.total), '{}'::jsonb)
        from (select reaction_kind, count(*) total from public.community_content_reactions reaction
          where reaction.tenant_id = item.tenant_id and reaction.content_id = item.content_id group by reaction_kind) summary),
      'viewer_reactions', (select coalesce(jsonb_agg(reaction_kind), '[]'::jsonb) from public.community_content_reactions reaction
        where reaction.tenant_id = item.tenant_id and reaction.content_id = item.content_id
          and reaction.actor_person_id = public.current_person_id()),
      'comments', (select coalesce(jsonb_agg(jsonb_build_object(
          'comment_id', cmt.comment_id, 'parent_comment_id', cmt.parent_comment_id,
          'body', cmt.body, 'author_name', comment_profile.display_name,
          'author_person_id', cmt.author_person_id, 'viewer_is_author', cmt.author_person_id = public.current_person_id(),
          'created_at', cmt.created_at,
          'reaction_counts', (select coalesce(jsonb_object_agg(crs.reaction_kind, crs.total), '{}'::jsonb)
            from (select reaction_kind, count(*) total from public.community_comment_reactions cr
              where cr.tenant_id = cmt.tenant_id and cr.comment_id = cmt.comment_id group by reaction_kind) crs),
          'viewer_reactions', (select coalesce(jsonb_agg(reaction_kind), '[]'::jsonb) from public.community_comment_reactions cr
            where cr.tenant_id = cmt.tenant_id and cr.comment_id = cmt.comment_id
              and cr.actor_person_id = public.current_person_id())
        ) order by cmt.created_at), '[]'::jsonb) from public.community_comments cmt
        join public.person_profiles comment_profile on comment_profile.person_id = cmt.author_person_id
        where cmt.tenant_id = item.tenant_id and cmt.content_id = item.content_id
          and cmt.moderation_status = 'clear'
          and not public.community_actor_hidden(cmt.tenant_id, cmt.author_person_id)),
      'media', (select coalesce(jsonb_agg(jsonb_build_object('media_id', media.media_id,
          'storage_path', media.storage_path, 'alt_text', media.alt_text, 'mime_type', media.mime_type)
          order by attachment.sort_order), '[]'::jsonb)
        from public.community_content_media attachment join public.community_media_assets media using (media_id)
        where attachment.tenant_id = item.tenant_id and attachment.content_id = item.content_id
          and media.moderation_status = 'clear')
    ) as item
    from public.community_content_items item
    join public.person_profiles profile on profile.person_id = item.author_person_id
    where item.tenant_id = target_tenant_id and public.can_operate_community(target_tenant_id)
      and public.can_read_community_content(item.tenant_id, item.content_id)
      and not public.community_actor_hidden(item.tenant_id, item.author_person_id)
    order by item.published_at desc limit greatest(1, least(coalesce(result_limit, 50), 100))
  ) feed;
$$;

create or replace function public.community_moderation_snapshot(target_tenant_id uuid, result_limit integer default 100)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.can_moderate_community(target_tenant_id)
    or not public.has_active_product_session(target_tenant_id, 'community') then
      jsonb_build_object('tenant_id', target_tenant_id, 'reports', '[]'::jsonb)
    else jsonb_build_object('tenant_id', target_tenant_id, 'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'report_id', report.report_id, 'target_type', report.target_type,
        'target_id', coalesce(report.content_id, report.comment_id), 'category', report.category,
        'details', report.details, 'status', report.status, 'created_at', report.created_at,
        'reporter_name', reporter.display_name,
        'target_excerpt', case when report.target_type = 'content' then left(content.body, 300) else left(cmt.body, 300) end,
        'target_author_name', target_author.display_name
      ) order by report.created_at)
      from public.community_reports report
      join public.person_profiles reporter on reporter.person_id = report.reporter_person_id
      left join public.community_content_items content on content.tenant_id = report.tenant_id and content.content_id = report.content_id
      left join public.community_comments cmt on cmt.tenant_id = report.tenant_id and cmt.comment_id = report.comment_id
      join public.person_profiles target_author on target_author.person_id = coalesce(content.author_person_id, cmt.author_person_id)
      where report.tenant_id = target_tenant_id and report.status in ('open', 'reviewing')
      limit greatest(1, least(coalesce(result_limit, 100), 200))
    ), '[]'::jsonb)) end;
$$;

create or replace function public.moderate_community_report(
  target_report_id uuid, decision_value text, reason_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  report_row public.community_reports;
  final_status text;
begin
  select * into report_row from public.community_reports where report_id = target_report_id for update;
  if report_row.report_id is null or report_row.status not in ('open', 'reviewing')
    or not public.can_moderate_community(report_row.tenant_id)
    or not public.has_active_product_session(report_row.tenant_id, 'community') then
    raise exception 'Community moderation is not permitted';
  end if;
  if decision_value not in ('dismiss', 'restrict', 'remove', 'restore')
    or nullif(btrim(reason_value), '') is null then raise exception 'A valid decision and reason are required'; end if;
  if report_row.target_type = 'content' then
    update public.community_content_items set
      moderation_status = case decision_value when 'dismiss' then 'clear' when 'restore' then 'clear'
        when 'restrict' then 'restricted' else 'removed' end,
      removed_at = case when decision_value = 'remove' then now() else null end,
      removed_by_person_id = case when decision_value = 'remove' then actor_id else null end,
      removal_reason = case when decision_value = 'remove' then btrim(reason_value) else null end
    where tenant_id = report_row.tenant_id and content_id = report_row.content_id;
  else
    update public.community_comments set
      moderation_status = case decision_value when 'dismiss' then 'clear' when 'restore' then 'clear'
        when 'restrict' then 'restricted' else 'removed' end,
      removed_at = case when decision_value = 'remove' then now() else null end,
      removed_by_person_id = case when decision_value = 'remove' then actor_id else null end,
      removal_reason = case when decision_value = 'remove' then btrim(reason_value) else null end
    where tenant_id = report_row.tenant_id and comment_id = report_row.comment_id;
  end if;
  final_status := case when decision_value = 'dismiss' then 'dismissed' else 'resolved' end;
  update public.community_reports set status = final_status, resolution = btrim(reason_value),
    resolved_at = now(), resolved_by_person_id = actor_id, updated_at = now()
  where tenant_id = report_row.tenant_id and status in ('open', 'reviewing') and (
    (report_row.target_type = 'content' and content_id = report_row.content_id)
    or (report_row.target_type = 'comment' and comment_id = report_row.comment_id)
  );
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    report_row.tenant_id, 'community.report_moderated', 'person', actor_id, '{}', btrim(reason_value),
    gen_random_uuid(), 'community_report', report_row.report_id::text,
    jsonb_build_object('decision', decision_value, 'target_type', report_row.target_type,
      'target_id', coalesce(report_row.content_id, report_row.comment_id))
  );
  return true;
end;
$$;

alter table public.community_reaction_kinds enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_content_reactions enable row level security;
alter table public.community_comment_reactions enable row level security;
alter table public.community_user_blocks enable row level security;
alter table public.community_user_mutes enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_media_assets enable row level security;
alter table public.community_content_media enable row level security;

create policy community_reaction_kinds_read on public.community_reaction_kinds for select using (true);
create policy community_comments_read on public.community_comments for select using (
  public.can_read_community_content(tenant_id, content_id) and moderation_status = 'clear'
    and not public.community_actor_hidden(tenant_id, author_person_id)
);
create policy community_content_reactions_read on public.community_content_reactions for select using (
  public.can_read_community_content(tenant_id, content_id)
);
create policy community_comment_reactions_read on public.community_comment_reactions for select using (
  exists (select 1 from public.community_comments comment where comment.tenant_id = community_comment_reactions.tenant_id
    and comment.comment_id = community_comment_reactions.comment_id
    and public.can_read_community_content(comment.tenant_id, comment.content_id))
);
create policy community_blocks_self_read on public.community_user_blocks for select using (
  owner_person_id = public.current_person_id()
);
create policy community_mutes_self_read on public.community_user_mutes for select using (
  owner_person_id = public.current_person_id()
);
create policy community_reports_self_or_moderator_read on public.community_reports for select using (
  reporter_person_id = public.current_person_id() or public.can_moderate_community(tenant_id)
);
create policy community_media_read on public.community_media_assets for select using (
  exists (select 1 from public.community_content_media attachment
    where attachment.tenant_id = community_media_assets.tenant_id
      and attachment.media_id = community_media_assets.media_id
      and public.can_read_community_content(attachment.tenant_id, attachment.content_id))
);
create policy community_content_media_read on public.community_content_media for select using (
  public.can_read_community_content(tenant_id, content_id)
);

create policy community_media_object_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'community-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.can_operate_community(((storage.foldername(name))[1])::uuid)
);
create policy community_media_object_select on storage.objects for select to authenticated using (
  bucket_id = 'community-media' and exists (
    select 1 from public.community_media_assets media
    join public.community_content_media attachment using (media_id)
    where media.storage_path = name and media.moderation_status = 'clear'
      and public.can_read_community_content(attachment.tenant_id, attachment.content_id)
  )
);

revoke all on public.community_reaction_kinds, public.community_comments,
  public.community_content_reactions, public.community_comment_reactions,
  public.community_user_blocks, public.community_user_mutes, public.community_reports,
  public.community_media_assets, public.community_content_media from public, anon, authenticated;
grant select on public.community_reaction_kinds, public.community_comments,
  public.community_content_reactions, public.community_comment_reactions,
  public.community_user_blocks, public.community_user_mutes, public.community_reports,
  public.community_media_assets, public.community_content_media to authenticated;

revoke all on function public.community_actor_hidden(uuid,uuid) from public, anon, authenticated;
revoke all on function public.create_my_community_comment(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.toggle_my_community_content_reaction(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.toggle_my_community_comment_reaction(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.report_community_item(uuid,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.set_my_community_relationship(uuid,uuid,text,boolean) from public, anon, authenticated;
revoke all on function public.my_community_safety_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.attach_my_community_media(uuid,uuid,text,text,bigint,text,smallint) from public, anon, authenticated;
revoke all on function public.community_moderation_snapshot(uuid,integer) from public, anon, authenticated;
revoke all on function public.moderate_community_report(uuid,text,text) from public, anon, authenticated;
grant execute on function public.create_my_community_comment(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.toggle_my_community_content_reaction(uuid,uuid,text) to authenticated;
grant execute on function public.toggle_my_community_comment_reaction(uuid,uuid,text) to authenticated;
grant execute on function public.report_community_item(uuid,text,uuid,text,text) to authenticated;
grant execute on function public.set_my_community_relationship(uuid,uuid,text,boolean) to authenticated;
grant execute on function public.my_community_safety_snapshot(uuid) to authenticated;
grant execute on function public.attach_my_community_media(uuid,uuid,text,text,bigint,text,smallint) to authenticated;
grant execute on function public.community_moderation_snapshot(uuid,integer) to authenticated;
grant execute on function public.moderate_community_report(uuid,text,text) to authenticated;

comment on function public.moderate_community_report(uuid,text,text) is
  'Resolves one Community report with a reasoned, auditable, non-destructive moderation decision.';
