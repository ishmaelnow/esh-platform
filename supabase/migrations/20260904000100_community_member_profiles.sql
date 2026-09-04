-- Community member profiles: tenant-scoped editable identity, profile items, and avatars.

create table public.community_member_profiles (
  profile_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  membership_id uuid not null,
  person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  display_name text not null,
  bio text,
  locality text,
  profile_visibility text not null default 'members',
  avatar_media_id uuid references public.community_media_assets (media_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, profile_id),
  unique (tenant_id, membership_id),
  foreign key (membership_id, tenant_id) references public.tenant_memberships (membership_id, tenant_id) on delete cascade,
  foreign key (tenant_id, person_id) references public.tenant_memberships (tenant_id, person_id) on delete cascade,
  constraint community_member_profile_name_check check (length(btrim(display_name)) between 1 and 120),
  constraint community_member_profile_bio_check check (bio is null or length(btrim(bio)) between 1 and 1000),
  constraint community_member_profile_locality_check check (locality is null or length(btrim(locality)) between 1 and 160),
  constraint community_member_profile_visibility_check check (profile_visibility in ('members', 'public'))
);

create index community_member_profiles_person_idx on public.community_member_profiles (tenant_id, person_id);

create table public.community_member_profile_items (
  item_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  profile_id uuid not null,
  item_kind text not null,
  label text not null,
  value text not null,
  sort_order smallint not null default 0,
  item_visibility text not null default 'members',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, item_id),
  foreign key (tenant_id, profile_id) references public.community_member_profiles (tenant_id, profile_id) on delete cascade,
  constraint community_profile_item_kind_check check (item_kind in ('interest', 'skill', 'link', 'service')),
  constraint community_profile_item_label_check check (length(btrim(label)) between 1 and 80),
  constraint community_profile_item_value_check check (length(btrim(value)) between 1 and 300),
  constraint community_profile_item_order_check check (sort_order between 0 and 19),
  constraint community_profile_item_visibility_check check (item_visibility in ('members', 'public')),
  constraint community_profile_item_link_check check (item_kind <> 'link' or value ~ '^https://')
);

create index community_member_profile_items_profile_idx on public.community_member_profile_items (tenant_id, profile_id, sort_order);

create trigger community_member_profiles_set_updated_at before update on public.community_member_profiles
  for each row execute function public.set_updated_at();
create trigger community_member_profile_items_set_updated_at before update on public.community_member_profile_items
  for each row execute function public.set_updated_at();

alter table public.community_member_profiles enable row level security;
alter table public.community_member_profile_items enable row level security;

create policy community_member_profiles_read on public.community_member_profiles for select to authenticated using (
  public.can_read_community(tenant_id)
  and (person_id = public.current_person_id() or profile_visibility = 'public'
    or public.has_active_product_session(tenant_id, 'community'))
);
create policy community_member_profile_items_read on public.community_member_profile_items for select to authenticated using (
  exists (select 1 from public.community_member_profiles profile
    where profile.tenant_id = community_member_profile_items.tenant_id
      and profile.profile_id = community_member_profile_items.profile_id
      and public.can_read_community(profile.tenant_id)
      and (profile.person_id = public.current_person_id() or item_visibility = 'public'
        or public.has_active_product_session(profile.tenant_id, 'community')))
);

revoke all on public.community_member_profiles, public.community_member_profile_items from public, anon, authenticated;
grant select on public.community_member_profiles, public.community_member_profile_items to authenticated;

create or replace function public.community_profile_snapshot(target_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare profile_row public.community_member_profiles; items jsonb;
begin
  if not public.can_operate_community(target_tenant_id) then raise exception 'Community profile access is not permitted'; end if;
  select * into profile_row from public.community_member_profiles
    where tenant_id = target_tenant_id and person_id = public.current_person_id();
  if profile_row.profile_id is null then
    return jsonb_build_object('profile', null, 'items', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.sort_order, item.created_at), '[]'::jsonb)
    into items from public.community_member_profile_items item
    where item.tenant_id = target_tenant_id and item.profile_id = profile_row.profile_id;
  return jsonb_build_object('profile', to_jsonb(profile_row), 'items', items);
end;
$$;

create or replace function public.upsert_my_community_profile(
  target_tenant_id uuid, display_name_value text, bio_value text default null,
  locality_value text default null, visibility_value text default 'members'
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); membership_id_value uuid := public.current_tenant_membership_id(target_tenant_id); profile_id_value uuid;
begin
  if actor_id is null or membership_id_value is null or not public.can_operate_community(target_tenant_id) then raise exception 'Community profile updates are not permitted'; end if;
  if visibility_value not in ('members', 'public') then raise exception 'Invalid profile visibility'; end if;
  insert into public.community_member_profiles (tenant_id, membership_id, person_id, display_name, bio, locality, profile_visibility)
    values (target_tenant_id, membership_id_value, actor_id, btrim(display_name_value), nullif(btrim(bio_value), ''), nullif(btrim(locality_value), ''), visibility_value)
    on conflict (tenant_id, membership_id) do update set display_name = excluded.display_name, bio = excluded.bio,
      locality = excluded.locality, profile_visibility = excluded.profile_visibility, updated_at = now()
    returning profile_id into profile_id_value;
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_person_id, reason, correlation_id, resource_type, resource_id, metadata)
    values (target_tenant_id, 'community.profile_updated', 'person', actor_id, 'Member updated their Community profile.', gen_random_uuid(), 'community_member_profile', profile_id_value::text, '{}');
  return profile_id_value;
end;
$$;

create or replace function public.add_my_community_profile_item(
  target_tenant_id uuid, item_kind_value text, label_value text, value_value text,
  visibility_value text default 'members'
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); profile_id_value uuid; item_id_value uuid; next_order smallint;
begin
  if actor_id is null or not public.can_operate_community(target_tenant_id) then raise exception 'Community profile updates are not permitted'; end if;
  select profile_id into profile_id_value from public.community_member_profiles where tenant_id = target_tenant_id and person_id = actor_id;
  if profile_id_value is null then raise exception 'Create your Community profile first'; end if;
  if visibility_value not in ('members', 'public') then raise exception 'Invalid item visibility'; end if;
  select coalesce(max(sort_order) + 1, 0) into next_order from public.community_member_profile_items where tenant_id = target_tenant_id and profile_id = profile_id_value;
  if next_order > 19 then raise exception 'A profile can contain no more than 20 items'; end if;
  insert into public.community_member_profile_items (tenant_id, profile_id, item_kind, label, value, sort_order, item_visibility)
    values (target_tenant_id, profile_id_value, item_kind_value, btrim(label_value), btrim(value_value), next_order, visibility_value)
    returning item_id into item_id_value;
  return item_id_value;
end;
$$;

create or replace function public.remove_my_community_profile_item(target_tenant_id uuid, item_id_value uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.can_operate_community(target_tenant_id) then raise exception 'Community profile updates are not permitted'; end if;
  delete from public.community_member_profile_items item using public.community_member_profiles profile
    where item.tenant_id = target_tenant_id and item.item_id = item_id_value and item.profile_id = profile.profile_id
      and profile.tenant_id = target_tenant_id and profile.person_id = public.current_person_id();
  return found;
end;
$$;

create or replace function public.update_my_community_profile_item(
  target_tenant_id uuid, item_id_value uuid, item_kind_value text, label_value text,
  value_value text, visibility_value text default 'members'
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.can_operate_community(target_tenant_id) then raise exception 'Community profile updates are not permitted'; end if;
  if visibility_value not in ('members', 'public') then raise exception 'Invalid item visibility'; end if;
  update public.community_member_profile_items item set item_kind = item_kind_value, label = btrim(label_value), value = btrim(value_value), item_visibility = visibility_value, updated_at = now()
    from public.community_member_profiles profile
    where item.tenant_id = target_tenant_id and item.item_id = item_id_value and item.profile_id = profile.profile_id
      and profile.tenant_id = target_tenant_id and profile.person_id = public.current_person_id();
  return found;
end;
$$;

create or replace function public.attach_my_community_profile_avatar(
  target_tenant_id uuid, storage_path_value text, mime_type_value text, byte_size_value bigint, alt_text_value text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); membership_id_value uuid := public.current_tenant_membership_id(target_tenant_id); media_id_value uuid; profile_id_value uuid;
begin
  if actor_id is null or membership_id_value is null or not public.can_operate_community(target_tenant_id) then raise exception 'Community profile updates are not permitted'; end if;
  if storage_path_value !~ ('^' || target_tenant_id::text || '/' || auth.uid()::text || '/profile/') then raise exception 'Invalid profile photo path'; end if;
  insert into public.community_media_assets (tenant_id, owner_membership_id, owner_person_id, storage_path, mime_type, byte_size, alt_text)
    values (target_tenant_id, membership_id_value, actor_id, storage_path_value, mime_type_value, byte_size_value, nullif(btrim(alt_text_value), '')) returning media_id into media_id_value;
  select profile_id into profile_id_value from public.community_member_profiles where tenant_id = target_tenant_id and person_id = actor_id;
  if profile_id_value is null then raise exception 'Create your Community profile first'; end if;
  update public.community_member_profiles set avatar_media_id = media_id_value, updated_at = now() where profile_id = profile_id_value;
  return media_id_value;
end;
$$;

create or replace function public.remove_my_community_profile_avatar(target_tenant_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare old_path text;
begin
  if not public.can_operate_community(target_tenant_id) then raise exception 'Community profile updates are not permitted'; end if;
  select media.storage_path into old_path from public.community_member_profiles profile join public.community_media_assets media on media.media_id = profile.avatar_media_id
    where profile.tenant_id = target_tenant_id and profile.person_id = public.current_person_id();
  update public.community_member_profiles set avatar_media_id = null, updated_at = now() where tenant_id = target_tenant_id and person_id = public.current_person_id();
  return old_path;
end;
$$;

revoke all on function public.community_profile_snapshot(uuid), public.upsert_my_community_profile(uuid,text,text,text,text), public.add_my_community_profile_item(uuid,text,text,text,text), public.update_my_community_profile_item(uuid,uuid,text,text,text,text), public.remove_my_community_profile_item(uuid,uuid), public.attach_my_community_profile_avatar(uuid,text,text,bigint,text), public.remove_my_community_profile_avatar(uuid) from public, anon, authenticated;
grant execute on function public.community_profile_snapshot(uuid), public.upsert_my_community_profile(uuid,text,text,text,text), public.add_my_community_profile_item(uuid,text,text,text,text), public.update_my_community_profile_item(uuid,uuid,text,text,text,text), public.remove_my_community_profile_item(uuid,uuid), public.attach_my_community_profile_avatar(uuid,text,text,bigint,text), public.remove_my_community_profile_avatar(uuid) to authenticated;

drop policy if exists community_media_read on public.community_media_assets;
create policy community_media_read on public.community_media_assets for select using (
  exists (select 1 from public.community_content_media attachment where attachment.tenant_id = community_media_assets.tenant_id and attachment.media_id = community_media_assets.media_id and public.can_read_community_content(attachment.tenant_id, attachment.content_id))
  or exists (select 1 from public.community_member_profiles profile where profile.tenant_id = community_media_assets.tenant_id and profile.avatar_media_id = community_media_assets.media_id and public.can_read_community(profile.tenant_id))
);

drop policy if exists community_media_object_select on storage.objects;
create policy community_media_object_select on storage.objects for select to authenticated using (
  bucket_id = 'community-media' and (exists (select 1 from public.community_media_assets media join public.community_content_media attachment using (media_id) where media.storage_path = name and media.moderation_status = 'clear' and public.can_read_community_content(attachment.tenant_id, attachment.content_id))
    or exists (select 1 from public.community_media_assets media join public.community_member_profiles profile on profile.avatar_media_id = media.media_id where media.storage_path = name and media.moderation_status = 'clear' and public.can_read_community(profile.tenant_id)))
);

create policy community_profile_avatar_delete on storage.objects for delete to authenticated using (
  bucket_id = 'community-media' and (storage.foldername(name))[2] = auth.uid()::text and (storage.foldername(name))[3] = 'profile'
);
