-- Keep approved Community requests visible when the application failed to create their invitation.
create or replace function public.community_join_review_snapshot(
  target_tenant_id uuid,
  result_limit integer default 50
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(entry) order by entry.created_at), '[]'::jsonb)
  from (
    select request.request_id,
      request.email,
      request.display_name,
      request.locality,
      request.reason,
      request.status,
      request.created_at
    from public.community_join_requests request
    where request.tenant_id = target_tenant_id
      and public.can_moderate_community(target_tenant_id)
      and (
        request.status = 'pending'
        or (
          request.status = 'approved'
          and not exists (
            select 1
            from public.tenant_invitations invitation
            where invitation.tenant_id = request.tenant_id
              and invitation.normalized_email = lower(btrim(request.email))
              and invitation.status = 'pending'
              and invitation.workspace_key = 'community'
              and invitation.workspace_role_key = 'community_member'
          )
        )
      )
    order by request.created_at
    limit greatest(1, least(coalesce(result_limit, 50), 100))
  ) entry;
$$;

revoke all on function public.community_join_review_snapshot(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.community_join_review_snapshot(uuid, integer)
  to authenticated;
