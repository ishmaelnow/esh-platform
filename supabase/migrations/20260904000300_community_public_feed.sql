-- Expose only published, clear, public Community posts to the public website.
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
      and public.can_read_community_content(item.tenant_id, item.content_id)
    order by item.published_at desc
    limit greatest(1, least(coalesce(result_limit, 50), 100))
  ) feed;
$$;

drop policy if exists community_media_object_select on storage.objects;
create policy community_media_object_select on storage.objects for select to anon, authenticated using (
  bucket_id = 'community-media' and exists (
    select 1 from public.community_media_assets media
    join public.community_content_media attachment using (media_id)
    where media.storage_path = name and media.moderation_status = 'clear'
      and public.can_read_community_content(attachment.tenant_id, attachment.content_id)
  )
);

revoke all on function public.community_feed_snapshot(uuid,integer) from public, anon, authenticated;
grant execute on function public.community_feed_snapshot(uuid,integer) to anon, authenticated;
