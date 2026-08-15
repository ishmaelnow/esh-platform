-- Tenant-scoped Rider and Driver browser push subscriptions with independent delivery history.

alter table public.notification_outbox add constraint notification_outbox_tenant_notification_unique
  unique (tenant_id, notification_id);

create table public.push_subscriptions (
  push_subscription_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  rider_profile_id uuid,
  driver_profile_id uuid,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  disabled_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_rider_fk foreign key (tenant_id, rider_profile_id)
    references public.rider_profiles (tenant_id, rider_profile_id) on delete restrict,
  constraint push_subscriptions_driver_fk foreign key (tenant_id, driver_profile_id)
    references public.driver_profiles (tenant_id, driver_profile_id) on delete restrict,
  constraint push_subscriptions_profile_check check (
    (rider_profile_id is not null and driver_profile_id is null)
    or (rider_profile_id is null and driver_profile_id is not null)
  ),
  constraint push_subscriptions_status_check check (status in ('active', 'disabled', 'expired')),
  constraint push_subscriptions_tenant_subscription_unique unique (tenant_id, push_subscription_id),
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create table public.push_delivery_attempts (
  push_delivery_attempt_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  notification_id uuid not null,
  push_subscription_id uuid not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  response_status integer,
  failure_message text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_delivery_attempts_status_check check (status in ('pending', 'delivered', 'failed', 'expired')),
  constraint push_delivery_attempts_count_check check (attempt_count between 0 and 10),
  constraint push_delivery_attempts_notification_fk foreign key (tenant_id, notification_id)
    references public.notification_outbox (tenant_id, notification_id) on delete restrict,
  constraint push_delivery_attempts_subscription_fk foreign key (tenant_id, push_subscription_id)
    references public.push_subscriptions (tenant_id, push_subscription_id) on delete restrict,
  constraint push_delivery_attempts_unique unique (notification_id, push_subscription_id)
);

create index push_subscriptions_rider_active_idx on public.push_subscriptions (tenant_id, rider_profile_id)
  where status = 'active';
create index push_subscriptions_driver_active_idx on public.push_subscriptions (tenant_id, driver_profile_id)
  where status = 'active';
create index push_delivery_attempts_status_idx on public.push_delivery_attempts (tenant_id, status, created_at);

alter table public.push_subscriptions enable row level security;
alter table public.push_delivery_attempts enable row level security;
grant all on public.push_subscriptions, public.push_delivery_attempts to service_role;

create or replace function public.register_my_rider_push_subscription(
  target_tenant_slug text, endpoint_value text, p256dh_key_value text, auth_key_value text,
  user_agent_value text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_tenant_id uuid; rider public.rider_profiles; subscription_id uuid;
begin
  select tenant_id into target_tenant_id from public.tenant_configurations
    where tenant_slug = lower(btrim(target_tenant_slug));
  select * into rider from public.rider_profiles
    where rider_profile_id = public.current_rider_profile_id(target_tenant_id);
  if rider.rider_profile_id is null then raise exception 'Rider access is required'; end if;
  if nullif(btrim(endpoint_value), '') is null or nullif(btrim(p256dh_key_value), '') is null
    or nullif(btrim(auth_key_value), '') is null then raise exception 'Complete push subscription is required'; end if;
  insert into public.push_subscriptions (tenant_id, person_id, rider_profile_id, endpoint,
    p256dh_key, auth_key, user_agent)
  values (target_tenant_id, rider.person_id, rider.rider_profile_id, btrim(endpoint_value),
    btrim(p256dh_key_value), btrim(auth_key_value), left(user_agent_value, 500))
  on conflict (endpoint) do update set tenant_id = excluded.tenant_id, person_id = excluded.person_id,
    rider_profile_id = excluded.rider_profile_id, driver_profile_id = null,
    p256dh_key = excluded.p256dh_key, auth_key = excluded.auth_key,
    user_agent = excluded.user_agent, status = 'active', disabled_at = null, updated_at = now()
  returning push_subscription_id into subscription_id;
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_person_id,
    actor_platform_roles, reason, correlation_id, resource_type, resource_id, metadata)
  values (target_tenant_id, 'rider.push_subscription_enabled', 'person', rider.person_id, '{}',
    'Rider enabled browser push notifications.', gen_random_uuid(), 'push_subscription',
    subscription_id::text, '{}'::jsonb);
  return subscription_id;
end;
$$;

create or replace function public.register_my_driver_push_subscription(
  endpoint_value text, p256dh_key_value text, auth_key_value text, user_agent_value text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare driver public.driver_profiles; subscription_id uuid;
begin
  select * into driver from public.driver_profiles where driver_profile_id = public.current_driver_profile_id();
  if driver.driver_profile_id is null then raise exception 'Driver access is required'; end if;
  if nullif(btrim(endpoint_value), '') is null or nullif(btrim(p256dh_key_value), '') is null
    or nullif(btrim(auth_key_value), '') is null then raise exception 'Complete push subscription is required'; end if;
  insert into public.push_subscriptions (tenant_id, person_id, driver_profile_id, endpoint,
    p256dh_key, auth_key, user_agent)
  values (driver.tenant_id, driver.person_id, driver.driver_profile_id, btrim(endpoint_value),
    btrim(p256dh_key_value), btrim(auth_key_value), left(user_agent_value, 500))
  on conflict (endpoint) do update set tenant_id = excluded.tenant_id, person_id = excluded.person_id,
    driver_profile_id = excluded.driver_profile_id, rider_profile_id = null,
    p256dh_key = excluded.p256dh_key, auth_key = excluded.auth_key,
    user_agent = excluded.user_agent, status = 'active', disabled_at = null, updated_at = now()
  returning push_subscription_id into subscription_id;
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_person_id,
    actor_platform_roles, reason, correlation_id, resource_type, resource_id, metadata)
  values (driver.tenant_id, 'driver.push_subscription_enabled', 'person', driver.person_id, '{}',
    'Driver enabled browser push notifications.', gen_random_uuid(), 'push_subscription',
    subscription_id::text, '{}'::jsonb);
  return subscription_id;
end;
$$;

create or replace function public.disable_my_push_subscription(endpoint_value text)
returns boolean language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); changed boolean;
begin
  update public.push_subscriptions set status = 'disabled', disabled_at = now(), updated_at = now()
  where endpoint = endpoint_value and person_id = actor_id and status = 'active';
  changed := found;
  return changed;
end;
$$;

revoke all on function public.register_my_rider_push_subscription(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.register_my_driver_push_subscription(text, text, text, text) from public, anon, authenticated;
revoke all on function public.disable_my_push_subscription(text) from public, anon, authenticated;
grant execute on function public.register_my_rider_push_subscription(text, text, text, text, text) to authenticated;
grant execute on function public.register_my_driver_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.disable_my_push_subscription(text) to authenticated;
