-- Community approval is delivered as the tokenized passwordless authentication email.
-- Do not queue a second generic approval message that lacks the invitation token.
create or replace function public.review_community_join_request(
  target_request_id uuid,
  decision_value text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  request_record public.community_join_requests%rowtype;
begin
  select * into request_record
  from public.community_join_requests
  where request_id = target_request_id
  for update;

  if request_record.tenant_id is null
     or not public.can_moderate_community(request_record.tenant_id) then
    raise exception 'Community moderation access is required';
  end if;
  if decision_value not in ('approved', 'rejected') then
    raise exception 'Unsupported membership decision';
  end if;

  update public.community_join_requests
  set status = decision_value,
      reviewed_at = now()
  where request_id = target_request_id;

  return true;
end;
$$;

revoke all on function public.review_community_join_request(uuid, text)
  from public, anon, authenticated;
grant execute on function public.review_community_join_request(uuid, text)
  to authenticated;
