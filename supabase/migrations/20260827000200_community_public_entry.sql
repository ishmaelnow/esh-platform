-- Public Community discovery is read-only; joining and feedback are separate workflows.
create table public.community_join_requests (
  request_id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(tenant_id) on delete restrict,
  email text not null, display_name text not null, locality text, reason text, status text not null default 'pending',
  created_at timestamptz not null default now(), reviewed_at timestamptz,
  constraint community_join_requests_status_check check (status in ('pending','approved','rejected','withdrawn')),
  constraint community_join_requests_email_check check (position('@' in email) > 1),
  constraint community_join_requests_name_check check (length(btrim(display_name)) between 1 and 160)
);
create unique index community_join_requests_pending_idx on public.community_join_requests(tenant_id, lower(email)) where status = 'pending';
create table public.community_public_feedback (
  feedback_id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(tenant_id) on delete restrict,
  category text not null, message text not null, contact_email text, status text not null default 'new', created_at timestamptz not null default now(),
  constraint community_public_feedback_category_check check (category in ('suggestion','issue','question','service_concern')),
  constraint community_public_feedback_message_check check (length(btrim(message)) between 1 and 5000),
  constraint community_public_feedback_status_check check (status in ('new','reviewing','resolved','dismissed'))
);
alter table public.community_join_requests enable row level security;
alter table public.community_public_feedback enable row level security;
revoke all on public.community_join_requests, public.community_public_feedback from anon, authenticated;
create or replace function public.community_public_directory_snapshot()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('tenant_id', cfg.tenant_id, 'display_name', cfg.display_name) order by cfg.display_name), '[]'::jsonb)
  from public.tenant_configurations cfg
  where public.community_public_enabled(cfg.tenant_id);
$$;
create or replace function public.submit_community_join_request(target_tenant_id uuid, email_value text, display_name_value text, locality_value text default null, reason_value text default null)
returns uuid language plpgsql security definer set search_path = public as $$ declare new_id uuid; begin
  if not public.community_public_enabled(target_tenant_id) then raise exception 'Community is not accepting join requests'; end if;
  insert into public.community_join_requests(tenant_id,email,display_name,locality,reason) values(target_tenant_id,lower(btrim(email_value)),btrim(display_name_value),nullif(btrim(locality_value),''),nullif(btrim(reason_value),'')) returning request_id into new_id; return new_id;
end $$;
create or replace function public.submit_community_public_feedback(target_tenant_id uuid, category_value text, message_value text, contact_email_value text default null)
returns uuid language plpgsql security definer set search_path = public as $$ declare new_id uuid; begin
  if target_tenant_id is not null and not public.community_public_enabled(target_tenant_id) then raise exception 'Community is not accepting public feedback'; end if;
  insert into public.community_public_feedback(tenant_id,category,message,contact_email) values(target_tenant_id,category_value,btrim(message_value),nullif(lower(btrim(contact_email_value)),'')) returning feedback_id into new_id; return new_id;
end $$;
revoke all on function public.submit_community_join_request(uuid,text,text,text,text) from public, authenticated;
revoke all on function public.submit_community_public_feedback(uuid,text,text,text) from public, authenticated;
grant execute on function public.submit_community_join_request(uuid,text,text,text,text) to anon, authenticated;
grant execute on function public.submit_community_public_feedback(uuid,text,text,text) to anon, authenticated;
revoke all on function public.community_public_directory_snapshot() from public, authenticated;
grant execute on function public.community_public_directory_snapshot() to anon, authenticated;

create or replace function public.community_join_review_snapshot(target_tenant_id uuid, result_limit integer default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(entry) order by entry.created_at), '[]'::jsonb)
  from (select request_id, email, display_name, locality, reason, status, created_at
    from public.community_join_requests where tenant_id = target_tenant_id and status = 'pending'
      and public.can_moderate_community(target_tenant_id)
    order by created_at limit greatest(1, least(coalesce(result_limit,50),100))) entry;
$$;
create or replace function public.community_feedback_review_snapshot(target_tenant_id uuid, result_limit integer default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(entry) order by entry.created_at), '[]'::jsonb)
  from (select feedback_id, category, message, contact_email, status, created_at
    from public.community_public_feedback where (tenant_id = target_tenant_id or tenant_id is null) and status in ('new','reviewing')
      and public.can_moderate_community(target_tenant_id)
    order by created_at limit greatest(1, least(coalesce(result_limit,50),100))) entry;
$$;
create or replace function public.review_community_join_request(target_request_id uuid, decision_value text)
returns boolean language plpgsql security definer set search_path = public as $$ declare tenant_value uuid; begin
  select tenant_id into tenant_value from public.community_join_requests where request_id = target_request_id for update;
  if tenant_value is null or not public.can_moderate_community(tenant_value) then raise exception 'Community moderation access is required'; end if;
  if decision_value not in ('approved','rejected') then raise exception 'Unsupported membership decision'; end if;
  update public.community_join_requests set status = decision_value, reviewed_at = now() where request_id = target_request_id;
  return true;
end $$;
create or replace function public.review_community_public_feedback(target_feedback_id uuid, decision_value text)
returns boolean language plpgsql security definer set search_path = public as $$ declare tenant_value uuid; begin
  select tenant_id into tenant_value from public.community_public_feedback where feedback_id = target_feedback_id for update;
  if tenant_value is not null and not public.can_moderate_community(tenant_value) then raise exception 'Community moderation access is required'; end if;
  if decision_value not in ('reviewing','resolved','dismissed') then raise exception 'Unsupported feedback decision'; end if;
  update public.community_public_feedback set status = decision_value where feedback_id = target_feedback_id;
  return true;
end $$;
revoke all on function public.community_join_review_snapshot(uuid,integer), public.community_feedback_review_snapshot(uuid,integer), public.review_community_join_request(uuid,text), public.review_community_public_feedback(uuid,text) from public, anon, authenticated;
grant execute on function public.community_join_review_snapshot(uuid,integer), public.community_feedback_review_snapshot(uuid,integer), public.review_community_join_request(uuid,text), public.review_community_public_feedback(uuid,text) to authenticated;
