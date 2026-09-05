-- Admin-managed starter information is public, explicitly labeled, and independently removable.
create table public.community_starter_content (
  tenant_id uuid not null references public.tenants(tenant_id) on delete cascade,
  content_id uuid not null,
  label text not null default 'Starter information',
  created_by_person_id uuid not null references public.person_profiles(person_id),
  created_at timestamptz not null default now(),
  primary key (tenant_id, content_id),
  foreign key (tenant_id, content_id) references public.community_content_items(tenant_id, content_id) on delete cascade,
  constraint community_starter_label_check check (length(btrim(label)) between 1 and 80)
);

alter table public.community_starter_content enable row level security;
revoke all on public.community_starter_content from public, anon, authenticated;

create or replace function public.community_starter_content_snapshot(target_tenant_id uuid, result_limit integer default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'content_id', item.content_id, 'title', item.title, 'body', item.body,
    'publication_status', item.publication_status, 'expires_at', item.expires_at,
    'label', starter.label, 'created_at', starter.created_at
  ) order by starter.created_at desc), '[]'::jsonb)
  from public.community_starter_content starter
  join public.community_content_items item using (tenant_id, content_id)
  where starter.tenant_id = target_tenant_id
    and public.can_moderate_community(target_tenant_id)
  limit greatest(1, least(coalesce(result_limit, 50), 100));
$$;

create or replace function public.create_community_starter_post(
  target_tenant_id uuid, title_value text, body_value text, expires_at_value timestamptz default null,
  label_value text default 'Starter information'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  membership_id_value uuid := public.current_tenant_membership_id(target_tenant_id);
  content_id_value uuid;
begin
  if actor_id is null or membership_id_value is null or not public.can_moderate_community(target_tenant_id) then
    raise exception 'Community moderation access is required';
  end if;
  if length(btrim(title_value)) not between 1 and 180 or length(btrim(body_value)) not between 1 and 10000 then
    raise exception 'Starter content title and body are required';
  end if;
  if expires_at_value is not null and expires_at_value <= now() then raise exception 'Starter content expiration must be in the future'; end if;

  insert into public.community_content_items (
    tenant_id, content_kind, author_membership_id, author_person_id, title, body,
    visibility, publication_status, published_at, expires_at
  ) values (
    target_tenant_id, 'post', membership_id_value, actor_id, btrim(title_value), btrim(body_value),
    'public', 'published', now(), expires_at_value
  ) returning content_id into content_id_value;
  insert into public.community_posts (tenant_id, content_id) values (target_tenant_id, content_id_value);
  insert into public.community_content_targets (tenant_id, content_id, target_type)
    values (target_tenant_id, content_id_value, 'tenant');
  insert into public.community_starter_content (tenant_id, content_id, label, created_by_person_id)
    values (target_tenant_id, content_id_value, btrim(label_value), actor_id);
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason, correlation_id, resource_type, resource_id, metadata)
    values (target_tenant_id, 'community.starter_content_created', 'person', actor_id, '{}', 'Starter information created.', gen_random_uuid(), 'community_content', content_id_value::text, jsonb_build_object('label', btrim(label_value)));
  return content_id_value;
end;
$$;

create or replace function public.update_community_starter_post(
  target_tenant_id uuid, target_content_id uuid, title_value text, body_value text, expires_at_value timestamptz default null
)
returns boolean language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id();
begin
  if actor_id is null or not public.can_moderate_community(target_tenant_id) then raise exception 'Community moderation access is required'; end if;
  if not exists (select 1 from public.community_starter_content where tenant_id = target_tenant_id and content_id = target_content_id) then raise exception 'Starter content was not found'; end if;
  if length(btrim(title_value)) not between 1 and 180 or length(btrim(body_value)) not between 1 and 10000 then raise exception 'Starter content title and body are required'; end if;
  if expires_at_value is not null and expires_at_value <= now() then raise exception 'Starter content expiration must be in the future'; end if;
  update public.community_content_items set title = btrim(title_value), body = btrim(body_value), expires_at = expires_at_value, updated_at = now()
    where tenant_id = target_tenant_id and content_id = target_content_id;
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason, correlation_id, resource_type, resource_id, metadata)
    values (target_tenant_id, 'community.starter_content_updated', 'person', actor_id, '{}', 'Starter information updated.', gen_random_uuid(), 'community_content', target_content_id::text, '{}'::jsonb);
  return true;
end;
$$;

create or replace function public.archive_community_starter_post(target_tenant_id uuid, target_content_id uuid, reason_value text)
returns boolean language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id();
begin
  if actor_id is null or not public.can_moderate_community(target_tenant_id) then raise exception 'Community moderation access is required'; end if;
  if nullif(btrim(reason_value), '') is null then raise exception 'Archive reason is required'; end if;
  if not exists (select 1 from public.community_starter_content where tenant_id = target_tenant_id and content_id = target_content_id) then raise exception 'Starter content was not found'; end if;
  update public.community_content_items set publication_status = 'archived', removed_at = now(), removed_by_person_id = actor_id, removal_reason = btrim(reason_value), updated_at = now()
    where tenant_id = target_tenant_id and content_id = target_content_id;
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason, correlation_id, resource_type, resource_id, metadata)
    values (target_tenant_id, 'community.starter_content_archived', 'person', actor_id, '{}', btrim(reason_value), gen_random_uuid(), 'community_content', target_content_id::text, '{}'::jsonb);
  return true;
end;
$$;

revoke all on function public.community_starter_content_snapshot(uuid, integer), public.create_community_starter_post(uuid, text, text, timestamptz, text), public.update_community_starter_post(uuid, uuid, text, text, timestamptz), public.archive_community_starter_post(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.community_starter_content_snapshot(uuid, integer), public.create_community_starter_post(uuid, text, text, timestamptz, text), public.update_community_starter_post(uuid, uuid, text, text, timestamptz), public.archive_community_starter_post(uuid, uuid, text) to authenticated;
