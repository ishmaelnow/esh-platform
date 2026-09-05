-- Search only the public Community surface. Private/member content never enters this result set.
create or replace function public.community_public_search(search_query text, result_limit integer default 20)
returns jsonb language sql stable security definer set search_path = public as $$
  with cleaned as (
    select nullif(btrim(search_query), '') as query_text,
           greatest(1, least(coalesce(result_limit, 20), 50)) as max_results
  ),
  matches as (
    select item.content_id, item.tenant_id, cfg.display_name as community_name,
      item.content_kind, item.title, item.body, item.published_at,
      profile.display_name as author_name,
      case when cleaned.query_text is null then 0
        else ts_rank(item.search_vector, websearch_to_tsquery('simple', cleaned.query_text)) end as rank
    from public.community_content_items item
    join public.tenant_configurations cfg on cfg.tenant_id = item.tenant_id
    join public.person_profiles profile on profile.person_id = item.author_person_id
    cross join cleaned
    where public.community_public_enabled(item.tenant_id)
      and public.can_read_community_content(item.tenant_id, item.content_id)
      and (cleaned.query_text is null
        or item.search_vector @@ websearch_to_tsquery('simple', cleaned.query_text)
        or item.title ilike '%' || cleaned.query_text || '%'
        or item.body ilike '%' || cleaned.query_text || '%')
    order by rank desc, item.published_at desc
    limit (select max_results from cleaned)
  )
  select jsonb_build_object(
    'query', coalesce((select query_text from cleaned), ''),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'content_id', content_id, 'tenant_id', tenant_id, 'community_name', community_name,
      'content_kind', content_kind, 'title', title, 'body', body,
      'published_at', published_at, 'author_name', author_name
    ) order by rank desc, published_at desc) from matches), '[]'::jsonb)
  );
$$;

revoke all on function public.community_public_search(text, integer) from public, anon, authenticated;
grant execute on function public.community_public_search(text, integer) to anon, authenticated;
