-- Explicit, verified SMS subscriptions and delivery attempts for Rider and Driver notifications.

create table public.sms_notification_subscriptions (
  sms_subscription_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  rider_profile_id uuid,
  driver_profile_id uuid,
  phone_e164 text not null,
  status text not null default 'active',
  consented_at timestamptz not null default now(),
  verified_at timestamptz not null default now(),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sms_subscriptions_audience_check check (
    (rider_profile_id is not null and driver_profile_id is null) or
    (rider_profile_id is null and driver_profile_id is not null)
  ),
  constraint sms_subscriptions_phone_check check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint sms_subscriptions_status_check check (status in ('active', 'disabled')),
  constraint sms_subscriptions_rider_fk foreign key (tenant_id, rider_profile_id)
    references public.rider_profiles (tenant_id, rider_profile_id) on delete restrict,
  constraint sms_subscriptions_driver_fk foreign key (tenant_id, driver_profile_id)
    references public.driver_profiles (tenant_id, driver_profile_id) on delete restrict,
  constraint sms_subscriptions_tenant_id_unique unique (tenant_id, sms_subscription_id)
);

create unique index sms_subscriptions_rider_unique
  on public.sms_notification_subscriptions (tenant_id, rider_profile_id)
  where rider_profile_id is not null;
create unique index sms_subscriptions_driver_unique
  on public.sms_notification_subscriptions (tenant_id, driver_profile_id)
  where driver_profile_id is not null;
create index sms_subscriptions_active_idx
  on public.sms_notification_subscriptions (tenant_id, status, updated_at desc);

create trigger sms_notification_subscriptions_set_updated_at
  before update on public.sms_notification_subscriptions
  for each row execute function public.set_updated_at();

create table public.sms_delivery_attempts (
  sms_delivery_attempt_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  notification_id uuid not null,
  sms_subscription_id uuid not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  provider_message_id text,
  provider_status text,
  failure_message text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sms_delivery_status_check check (status in ('pending', 'accepted', 'failed')),
  constraint sms_delivery_count_check check (attempt_count between 0 and 10),
  constraint sms_delivery_notification_fk foreign key (tenant_id, notification_id)
    references public.notification_outbox (tenant_id, notification_id) on delete restrict,
  constraint sms_delivery_subscription_fk foreign key (tenant_id, sms_subscription_id)
    references public.sms_notification_subscriptions (tenant_id, sms_subscription_id) on delete restrict,
  constraint sms_delivery_notification_subscription_unique unique (notification_id, sms_subscription_id)
);

create trigger sms_delivery_attempts_set_updated_at before update on public.sms_delivery_attempts
  for each row execute function public.set_updated_at();
create index sms_delivery_attempts_status_idx
  on public.sms_delivery_attempts (tenant_id, status, created_at desc);

alter table public.sms_notification_subscriptions enable row level security;
alter table public.sms_delivery_attempts enable row level security;
grant all on public.sms_notification_subscriptions, public.sms_delivery_attempts to service_role;

create or replace function public.my_rider_sms_notification_settings(target_tenant_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare target_tenant_id uuid; rider_id uuid;
begin
  select config.tenant_id into target_tenant_id from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  where config.tenant_slug = lower(btrim(target_tenant_slug)) and tenant.status = 'active';
  if target_tenant_id is null then raise exception 'booking tenant is unavailable'; end if;
  rider_id := public.current_rider_profile_id(target_tenant_id);
  if rider_id is null then raise exception 'active rider profile is required'; end if;
  return coalesce((select jsonb_build_object('enabled', subscription.status = 'active',
      'maskedPhone', '••••' || right(subscription.phone_e164, 4),
      'verifiedAt', subscription.verified_at)
    from public.sms_notification_subscriptions subscription
    where subscription.tenant_id = target_tenant_id and subscription.rider_profile_id = rider_id),
    jsonb_build_object('enabled', false, 'maskedPhone', null, 'verifiedAt', null));
end;
$$;

create or replace function public.my_driver_sms_notification_settings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare driver_id uuid := public.current_driver_profile_id(); target_tenant_id uuid;
begin
  if driver_id is null then raise exception 'active Driver profile is required'; end if;
  select tenant_id into target_tenant_id from public.driver_profiles where driver_profile_id = driver_id;
  return coalesce((select jsonb_build_object('enabled', subscription.status = 'active',
      'maskedPhone', '••••' || right(subscription.phone_e164, 4),
      'verifiedAt', subscription.verified_at)
    from public.sms_notification_subscriptions subscription
    where subscription.tenant_id = target_tenant_id and subscription.driver_profile_id = driver_id),
    jsonb_build_object('enabled', false, 'maskedPhone', null, 'verifiedAt', null));
end;
$$;

create or replace function public.confirm_rider_sms_subscription_internal(
  target_auth_user_id uuid, target_tenant_slug text, phone_e164_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare target_tenant_id uuid; rider public.rider_profiles;
begin
  if auth.role() <> 'service_role' then raise exception 'service role is required'; end if;
  if phone_e164_value !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'verified phone is invalid'; end if;
  select config.tenant_id into target_tenant_id from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  where config.tenant_slug = lower(btrim(target_tenant_slug)) and tenant.status = 'active';
  select profile.* into rider from public.rider_profiles profile
  join public.person_profiles person on person.person_id = profile.person_id
  where profile.tenant_id = target_tenant_id and person.auth_user_id = target_auth_user_id
    and profile.status = 'active';
  if rider.rider_profile_id is null then raise exception 'active rider profile is required'; end if;
  insert into public.sms_notification_subscriptions
    (tenant_id, person_id, rider_profile_id, phone_e164, status, consented_at, verified_at, disabled_at)
  values (target_tenant_id, rider.person_id, rider.rider_profile_id, phone_e164_value,
    'active', now(), now(), null)
  on conflict (tenant_id, rider_profile_id) where rider_profile_id is not null do update set
    phone_e164 = excluded.phone_e164, status = 'active', consented_at = now(),
    verified_at = now(), disabled_at = null;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (target_tenant_id, 'rider.sms_notifications_enabled', 'person', rider.person_id, '{}',
    'Rider verified a phone and consented to transactional SMS.', gen_random_uuid(),
    'rider_profile', rider.rider_profile_id::text, jsonb_build_object('phone_last4', right(phone_e164_value, 4)));
  return true;
end;
$$;

create or replace function public.confirm_driver_sms_subscription_internal(
  target_auth_user_id uuid, phone_e164_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare driver public.driver_profiles;
begin
  if auth.role() <> 'service_role' then raise exception 'service role is required'; end if;
  if phone_e164_value !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'verified phone is invalid'; end if;
  select profile.* into driver from public.driver_profiles profile
  join public.person_profiles person on person.person_id = profile.person_id
  where person.auth_user_id = target_auth_user_id and profile.status = 'active'
  order by profile.created_at limit 1;
  if driver.driver_profile_id is null then raise exception 'active Driver profile is required'; end if;
  insert into public.sms_notification_subscriptions
    (tenant_id, person_id, driver_profile_id, phone_e164, status, consented_at, verified_at, disabled_at)
  values (driver.tenant_id, driver.person_id, driver.driver_profile_id, phone_e164_value,
    'active', now(), now(), null)
  on conflict (tenant_id, driver_profile_id) where driver_profile_id is not null do update set
    phone_e164 = excluded.phone_e164, status = 'active', consented_at = now(),
    verified_at = now(), disabled_at = null;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (driver.tenant_id, 'driver.sms_notifications_enabled', 'person', driver.person_id, '{}',
    'Driver verified a phone and consented to transactional SMS.', gen_random_uuid(),
    'driver_profile', driver.driver_profile_id::text, jsonb_build_object('phone_last4', right(phone_e164_value, 4)));
  return true;
end;
$$;

create or replace function public.disable_my_rider_sms_notifications(target_tenant_slug text)
returns boolean language plpgsql security definer set search_path = public as $$
declare target_tenant_id uuid; rider_id uuid; actor_id uuid;
begin
  select config.tenant_id into target_tenant_id from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  where config.tenant_slug = lower(btrim(target_tenant_slug)) and tenant.status = 'active';
  rider_id := public.current_rider_profile_id(target_tenant_id);
  if rider_id is null then raise exception 'active rider profile is required'; end if;
  update public.sms_notification_subscriptions set status = 'disabled', disabled_at = now()
    where tenant_id = target_tenant_id and rider_profile_id = rider_id;
  select person_id into actor_id from public.rider_profiles where rider_profile_id = rider_id;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (target_tenant_id, 'rider.sms_notifications_disabled', 'person', actor_id, '{}',
    'Rider withdrew transactional SMS consent.', gen_random_uuid(), 'rider_profile', rider_id::text, '{}');
  return false;
end;
$$;

create or replace function public.disable_my_driver_sms_notifications()
returns boolean language plpgsql security definer set search_path = public as $$
declare driver_id uuid := public.current_driver_profile_id(); target_tenant_id uuid; actor_id uuid;
begin
  if driver_id is null then raise exception 'active Driver profile is required'; end if;
  select tenant_id, person_id into target_tenant_id, actor_id from public.driver_profiles where driver_profile_id = driver_id;
  update public.sms_notification_subscriptions set status = 'disabled', disabled_at = now()
    where tenant_id = target_tenant_id and driver_profile_id = driver_id;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (target_tenant_id, 'driver.sms_notifications_disabled', 'person', actor_id, '{}',
    'Driver withdrew transactional SMS consent.', gen_random_uuid(), 'driver_profile', driver_id::text, '{}');
  return false;
end;
$$;

revoke all on function public.my_rider_sms_notification_settings(text) from public;
revoke all on function public.my_driver_sms_notification_settings() from public;
revoke all on function public.confirm_rider_sms_subscription_internal(uuid, text, text) from public;
revoke all on function public.confirm_driver_sms_subscription_internal(uuid, text) from public;
revoke all on function public.disable_my_rider_sms_notifications(text) from public;
revoke all on function public.disable_my_driver_sms_notifications() from public;
grant execute on function public.my_rider_sms_notification_settings(text) to authenticated;
grant execute on function public.my_driver_sms_notification_settings() to authenticated;
grant execute on function public.disable_my_rider_sms_notifications(text) to authenticated;
grant execute on function public.disable_my_driver_sms_notifications() to authenticated;
grant execute on function public.confirm_rider_sms_subscription_internal(uuid, text, text) to service_role;
grant execute on function public.confirm_driver_sms_subscription_internal(uuid, text) to service_role;
