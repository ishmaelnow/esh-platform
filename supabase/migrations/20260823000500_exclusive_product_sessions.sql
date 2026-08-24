-- One person may operate only one ESH product at a time. Product context is server-authoritative.

create table public.product_operational_sessions (
  product_session_id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.person_profiles (person_id) on delete cascade,
  auth_session_id uuid not null,
  tenant_id uuid not null references public.tenants (tenant_id) on delete cascade,
  workspace_key text not null references public.product_workspace_catalog (workspace_key) on delete restrict,
  status text not null default 'active',
  activated_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  ended_at timestamptz,
  end_reason text,
  superseded_by_session_id uuid references public.product_operational_sessions (product_session_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_operational_sessions_status_check check (
    status in ('active', 'ended', 'expired', 'superseded')
  ),
  constraint product_operational_sessions_end_check check (
    (status = 'active' and ended_at is null and end_reason is null)
    or (status <> 'active' and ended_at is not null and length(btrim(end_reason)) > 0)
  ),
  constraint product_operational_sessions_expiry_check check (expires_at > activated_at)
);

create unique index product_operational_sessions_one_active_person_idx
  on public.product_operational_sessions (person_id)
  where status = 'active';
create index product_operational_sessions_auth_idx
  on public.product_operational_sessions (auth_session_id, status, expires_at);
create index product_operational_sessions_tenant_workspace_idx
  on public.product_operational_sessions (tenant_id, workspace_key, status);

create trigger product_operational_sessions_set_updated_at
  before update on public.product_operational_sessions
  for each row execute function public.set_updated_at();

create or replace function public.current_auth_session_id()
returns uuid language sql stable security definer set search_path = public as $$
  select case
    when nullif(auth.jwt() ->> 'session_id', '') is null then null
    else (auth.jwt() ->> 'session_id')::uuid
  end;
$$;

create or replace function public.has_foundation_tenant_role(
  target_tenant_id uuid,
  required_roles text[]
)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.person_profiles profile
    join public.tenant_memberships membership on membership.person_id = profile.person_id
    join public.tenants tenant on tenant.tenant_id = membership.tenant_id
    join public.tenant_role_assignments role
      on role.membership_id = membership.membership_id and role.tenant_id = membership.tenant_id
    where profile.auth_user_id = auth.uid()
      and profile.status = 'active'
      and tenant.status = 'active'
      and membership.tenant_id = target_tenant_id
      and membership.status = 'active'
      and (membership.expires_at is null or membership.expires_at > now())
      and role.status = 'active'
      and role.role_key = any(required_roles)
      and (role.expires_at is null or role.expires_at > now())
  );
$$;

create or replace function public.has_active_product_session(
  target_tenant_id uuid,
  target_workspace_key text
)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.product_operational_sessions product_session
    where product_session.person_id = public.current_person_id()
      and product_session.auth_session_id = public.current_auth_session_id()
      and product_session.tenant_id = target_tenant_id
      and product_session.workspace_key = target_workspace_key
      and product_session.status = 'active'
      and product_session.expires_at > now()
  );
$$;

-- Existing tenant-role authorization is Transportation operational authorization. Neutral
-- control-plane functions use has_foundation_tenant_role directly.
create or replace function public.has_tenant_role(target_tenant_id uuid, required_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_foundation_tenant_role(target_tenant_id, required_roles)
    and (
      -- Safe rollout: migration precedes UI deploy. Enforcement activates permanently when the
      -- paired UI creates the first explicit product lease.
      not exists (select 1 from public.product_operational_sessions)
      or public.has_active_product_session(target_tenant_id, 'transportation')
    );
$$;

create or replace function public.can_manage_workspace_access(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_data_admin()
    or public.has_foundation_tenant_role(target_tenant_id, array['tenant_owner']);
$$;

create or replace function public.enter_my_product_session(
  target_tenant_id uuid,
  target_workspace_key text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  auth_session uuid := public.current_auth_session_id();
  new_session_id uuid := gen_random_uuid();
  previous_session public.product_operational_sessions;
  allowed boolean := false;
begin
  if actor_id is null or auth_session is null then
    raise exception 'An authenticated person session is required';
  end if;
  if target_workspace_key = 'transportation' then
    allowed := public.has_workspace_role(
      target_tenant_id, target_workspace_key, array['transportation_admin']
    );
  elsif target_workspace_key = 'community' then
    allowed := public.has_workspace_role(
      target_tenant_id, target_workspace_key,
      array['community_member','community_admin','community_moderator','emergency_publisher']
    );
  end if;
  if not allowed then raise exception 'Active product enrollment and role are required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_id::text, 0));

  select * into previous_session
  from public.product_operational_sessions
  where person_id = actor_id and status = 'active'
  for update;

  if previous_session.product_session_id is not null then
    update public.product_operational_sessions set
      status = 'superseded', ended_at = now(),
      end_reason = 'Superseded by explicit product entry.'
    where product_session_id = previous_session.product_session_id;

    insert into public.tenant_audit_events (
      tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
      correlation_id, resource_type, resource_id, metadata
    ) values (
      previous_session.tenant_id, 'product_session.superseded', 'person', actor_id, '{}',
      'Another product was entered explicitly.', gen_random_uuid(), 'product_operational_session',
      previous_session.product_session_id::text,
      jsonb_build_object('workspace_key', previous_session.workspace_key,
        'superseded_by_session_id', new_session_id)
    );
  end if;

  insert into public.product_operational_sessions (
    product_session_id, person_id, auth_session_id, tenant_id, workspace_key
  ) values (new_session_id, actor_id, auth_session, target_tenant_id, target_workspace_key);

  if previous_session.product_session_id is not null then
    update public.product_operational_sessions
    set superseded_by_session_id = new_session_id
    where product_session_id = previous_session.product_session_id;
  end if;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    target_tenant_id, 'product_session.entered', 'person', actor_id, '{}',
    'Product entered explicitly.', gen_random_uuid(), 'product_operational_session',
    new_session_id::text, jsonb_build_object('workspace_key', target_workspace_key)
  );

  return jsonb_build_object(
    'product_session_id', new_session_id,
    'tenant_id', target_tenant_id,
    'workspace_key', target_workspace_key,
    'expires_at', now() + interval '30 minutes'
  );
end;
$$;

create or replace function public.refresh_my_product_session(
  target_tenant_id uuid,
  target_workspace_key text
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.product_operational_sessions set
    heartbeat_at = now(), expires_at = now() + interval '30 minutes'
  where person_id = public.current_person_id()
    and auth_session_id = public.current_auth_session_id()
    and tenant_id = target_tenant_id
    and workspace_key = target_workspace_key
    and status = 'active'
    and expires_at > now();
  return found;
end;
$$;

create or replace function public.leave_my_product_session(reason_value text default 'Returned to governance.')
returns boolean language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); ended_session public.product_operational_sessions;
begin
  if nullif(btrim(reason_value), '') is null then raise exception 'Session exit reason is required'; end if;
  select * into ended_session from public.product_operational_sessions
  where person_id = actor_id and status = 'active' for update;
  if ended_session.product_session_id is null then return false; end if;

  update public.product_operational_sessions set
    status = 'ended', ended_at = now(), end_reason = btrim(reason_value)
  where product_session_id = ended_session.product_session_id;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    ended_session.tenant_id, 'product_session.ended', 'person', actor_id, '{}',
    btrim(reason_value), gen_random_uuid(), 'product_operational_session',
    ended_session.product_session_id::text,
    jsonb_build_object('workspace_key', ended_session.workspace_key)
  );
  return true;
end;
$$;

create or replace function public.expire_product_operational_sessions(batch_limit integer default 500)
returns integer language plpgsql security definer set search_path = public as $$
declare expired_count integer;
begin
  with due as (
    select product_session_id from public.product_operational_sessions
    where status = 'active' and expires_at <= now()
    order by expires_at for update skip locked limit greatest(1, least(batch_limit, 2000))
  )
  update public.product_operational_sessions product_session set
    status = 'expired', ended_at = now(), end_reason = 'Product session lease expired.'
  from due where product_session.product_session_id = due.product_session_id;
  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

alter table public.product_operational_sessions enable row level security;
create policy product_operational_sessions_own_select on public.product_operational_sessions
  for select to authenticated using (person_id = public.current_person_id());

grant select on public.product_operational_sessions to authenticated;
grant all on public.product_operational_sessions to service_role;

revoke all on function public.current_auth_session_id() from public, anon, authenticated;
revoke all on function public.has_foundation_tenant_role(uuid, text[]) from public, anon, authenticated;
revoke all on function public.has_active_product_session(uuid, text) from public, anon, authenticated;
revoke all on function public.enter_my_product_session(uuid, text) from public, anon, authenticated;
revoke all on function public.refresh_my_product_session(uuid, text) from public, anon, authenticated;
revoke all on function public.leave_my_product_session(text) from public, anon, authenticated;
revoke all on function public.expire_product_operational_sessions(integer) from public, anon, authenticated;

grant execute on function public.has_active_product_session(uuid, text) to authenticated;
grant execute on function public.enter_my_product_session(uuid, text) to authenticated;
grant execute on function public.refresh_my_product_session(uuid, text) to authenticated;
grant execute on function public.leave_my_product_session(text) to authenticated;
grant execute on function public.expire_product_operational_sessions(integer) to service_role;

comment on table public.product_operational_sessions is
  'Exclusive, server-authoritative operational product leases. One active product per person.';
