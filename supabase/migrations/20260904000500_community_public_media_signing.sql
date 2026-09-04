-- Allow anonymous signed URLs only for media attached to public, published, clear content.
create or replace function public.can_read_public_community_media(storage_path_value text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.community_media_assets media
    join public.community_content_media attachment on attachment.media_id = media.media_id
    join public.community_content_items item
      on item.tenant_id = attachment.tenant_id and item.content_id = attachment.content_id
    where media.storage_path = storage_path_value
      and media.moderation_status = 'clear'
      and public.can_read_community_content(item.tenant_id, item.content_id)
  );
$$;

revoke all on function public.can_read_public_community_media(text) from public, anon, authenticated;
grant execute on function public.can_read_public_community_media(text) to anon, authenticated;

drop policy if exists community_media_object_select on storage.objects;
create policy community_media_object_select on storage.objects for select to anon, authenticated using (
  bucket_id = 'community-media' and public.can_read_public_community_media(name)
);
