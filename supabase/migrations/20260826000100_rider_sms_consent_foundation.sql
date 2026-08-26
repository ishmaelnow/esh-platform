-- FAIR FARE COMPANY LLC / ESH Rider operational SMS consent foundation.
-- Consent is independent from phone possession, Rider access, email authentication, and verification.

alter table public.sms_notification_subscriptions
  alter column consented_at drop not null,
  alter column verified_at drop not null,
  add column consent_source text,
  add column disclosure_version text;

alter table public.sms_notification_subscriptions
  drop constraint sms_subscriptions_status_check,
  add constraint sms_subscriptions_status_check check (
    status in ('not_consented', 'consented_unverified', 'active', 'disabled')
  );

update public.sms_notification_subscriptions set
  consent_source = coalesce(consent_source, 'legacy_verified_sms_flow'),
  disclosure_version = coalesce(disclosure_version, 'esh_transactional_sms_legacy_v1')
where status in ('active', 'disabled');

alter table public.sms_notification_subscriptions
  add constraint sms_subscriptions_consent_state_check check (
    (status = 'not_consented' and consented_at is null and verified_at is null and disabled_at is null)
    or (status = 'consented_unverified' and consented_at is not null and verified_at is null
      and disabled_at is null and consent_source is not null and disclosure_version is not null)
    or (status = 'active' and consented_at is not null and verified_at is not null
      and disabled_at is null and consent_source is not null and disclosure_version is not null)
    or (status = 'disabled' and consented_at is not null and disabled_at is not null
      and consent_source is not null and disclosure_version is not null)
  );

create table public.sms_consent_events (
  sms_consent_event_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  sms_subscription_id uuid not null,
  person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  rider_profile_id uuid not null,
  phone_e164 text not null,
  consent_action text not null,
  consent_source text not null,
  disclosure_version text not null,
  occurred_at timestamptz not null default now(),
  foreign key (tenant_id, sms_subscription_id)
    references public.sms_notification_subscriptions (tenant_id, sms_subscription_id) on delete restrict,
  foreign key (tenant_id, rider_profile_id)
    references public.rider_profiles (tenant_id, rider_profile_id) on delete restrict,
  constraint sms_consent_events_phone_check check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint sms_consent_events_action_check check (
    consent_action in ('phone_saved_without_consent', 'consent_granted', 'consent_withdrawn')
  ),
  constraint sms_consent_events_source_check check (length(btrim(consent_source)) between 3 and 80),
  constraint sms_consent_events_version_check check (length(btrim(disclosure_version)) between 3 and 120)
);
create index sms_consent_events_rider_idx
  on public.sms_consent_events (tenant_id, rider_profile_id, occurred_at desc);

create or replace function public.prevent_sms_consent_event_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'SMS consent history is append-only';
end;
$$;
create trigger sms_consent_events_append_only
  before update or delete on public.sms_consent_events
  for each row execute function public.prevent_sms_consent_event_mutation();

alter table public.sms_consent_events enable row level security;
revoke all on public.sms_consent_events from public, anon, authenticated;
grant all on public.sms_consent_events to service_role;

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
  return coalesce((select jsonb_build_object(
      'enabled', subscription.status = 'active',
      'deliveryEnabled', subscription.status = 'active',
      'consented', subscription.status in ('consented_unverified', 'active'),
      'phoneE164', subscription.phone_e164,
      'maskedPhone', '••••' || right(subscription.phone_e164, 4),
      'status', subscription.status,
      'consentedAt', subscription.consented_at,
      'verifiedAt', subscription.verified_at,
      'disabledAt', subscription.disabled_at,
      'consentSource', subscription.consent_source,
      'disclosureVersion', subscription.disclosure_version)
    from public.sms_notification_subscriptions subscription
    where subscription.tenant_id = target_tenant_id and subscription.rider_profile_id = rider_id),
    jsonb_build_object(
      'enabled', false, 'deliveryEnabled', false, 'consented', false,
      'phoneE164', null, 'maskedPhone', null, 'status', 'not_consented',
      'consentedAt', null, 'verifiedAt', null, 'disabledAt', null,
      'consentSource', null, 'disclosureVersion', null));
end;
$$;

create or replace function public.save_my_rider_sms_consent(
  target_tenant_slug text,
  phone_e164_value text,
  sms_consent_value boolean
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_tenant_id uuid;
  rider public.rider_profiles;
  existing public.sms_notification_subscriptions;
  saved public.sms_notification_subscriptions;
  next_status text;
  next_action text;
  source_value constant text := 'rider_account_settings';
  version_value constant text := 'fair_fare_esh_operational_sms_v1';
begin
  if phone_e164_value !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Enter a valid mobile number in international format';
  end if;
  select config.tenant_id into target_tenant_id from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  where config.tenant_slug = lower(btrim(target_tenant_slug)) and tenant.status = 'active';
  if target_tenant_id is null then raise exception 'booking tenant is unavailable'; end if;
  select profile.* into rider from public.rider_profiles profile
  where profile.tenant_id = target_tenant_id
    and profile.rider_profile_id = public.current_rider_profile_id(target_tenant_id)
    and profile.status = 'active';
  if rider.rider_profile_id is null then raise exception 'active rider profile is required'; end if;

  select * into existing from public.sms_notification_subscriptions subscription
  where subscription.tenant_id = target_tenant_id
    and subscription.rider_profile_id = rider.rider_profile_id for update;

  if not sms_consent_value
    and existing.sms_subscription_id is not null
    and existing.status in ('consented_unverified', 'active')
    and existing.phone_e164 <> phone_e164_value then
    raise exception 'Withdraw consent for the current number before saving a different number';
  end if;

  if sms_consent_value then
    next_status := case when existing.sms_subscription_id is not null
      and existing.phone_e164 = phone_e164_value and existing.status = 'active'
      then 'active' else 'consented_unverified' end;
    next_action := 'consent_granted';
  elsif existing.sms_subscription_id is not null
    and existing.phone_e164 = phone_e164_value
    and existing.status in ('consented_unverified', 'active') then
    next_status := 'disabled';
    next_action := 'consent_withdrawn';
  else
    next_status := 'not_consented';
    next_action := 'phone_saved_without_consent';
  end if;

  insert into public.sms_notification_subscriptions (
    tenant_id, person_id, rider_profile_id, phone_e164, status, consented_at, verified_at,
    disabled_at, consent_source, disclosure_version
  ) values (
    target_tenant_id, rider.person_id, rider.rider_profile_id, phone_e164_value, next_status,
    case when sms_consent_value then now() end,
    case when next_status = 'active' then existing.verified_at end,
    case when next_status = 'disabled' then now() end,
    case when next_status <> 'not_consented' then source_value end,
    case when next_status <> 'not_consented' then version_value end
  )
  on conflict (tenant_id, rider_profile_id) where rider_profile_id is not null do update set
    phone_e164 = excluded.phone_e164,
    status = excluded.status,
    consented_at = case when excluded.status = 'disabled' then sms_notification_subscriptions.consented_at
      else excluded.consented_at end,
    verified_at = case when excluded.status in ('active', 'disabled')
      then sms_notification_subscriptions.verified_at else null end,
    disabled_at = excluded.disabled_at,
    consent_source = case when excluded.status = 'disabled' then sms_notification_subscriptions.consent_source
      else excluded.consent_source end,
    disclosure_version = case when excluded.status = 'disabled' then sms_notification_subscriptions.disclosure_version
      else excluded.disclosure_version end
  returning * into saved;

  update public.rider_profiles set phone = phone_e164_value, updated_at = now()
  where rider_profile_id = rider.rider_profile_id;

  insert into public.sms_consent_events (
    tenant_id, sms_subscription_id, person_id, rider_profile_id, phone_e164,
    consent_action, consent_source, disclosure_version
  ) values (
    target_tenant_id, saved.sms_subscription_id, rider.person_id, rider.rider_profile_id,
    phone_e164_value, next_action, source_value, version_value
  );
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    target_tenant_id,
    case next_action when 'consent_granted' then 'rider.sms_consent_granted'
      when 'consent_withdrawn' then 'rider.sms_consent_withdrawn'
      else 'rider.sms_phone_saved_without_consent' end,
    'person', rider.person_id, '{}',
    case next_action when 'consent_granted' then 'Rider explicitly consented to operational SMS.'
      when 'consent_withdrawn' then 'Rider withdrew operational SMS consent.'
      else 'Rider saved a mobile number without SMS consent.' end,
    gen_random_uuid(), 'sms_notification_subscription', saved.sms_subscription_id::text,
    jsonb_build_object('phone_last4', right(phone_e164_value, 4), 'consent_action', next_action,
      'consent_source', source_value, 'disclosure_version', version_value,
      'delivery_enabled', saved.status = 'active')
  );
  return jsonb_build_object(
    'enabled', saved.status = 'active', 'deliveryEnabled', saved.status = 'active',
    'consented', saved.status in ('consented_unverified', 'active'),
    'phoneE164', saved.phone_e164, 'maskedPhone', '••••' || right(saved.phone_e164, 4),
    'status', saved.status, 'consentedAt', saved.consented_at, 'verifiedAt', saved.verified_at,
    'disabledAt', saved.disabled_at, 'consentSource', saved.consent_source,
    'disclosureVersion', saved.disclosure_version);
end;
$$;

create or replace function public.confirm_rider_sms_subscription_internal(
  target_auth_user_id uuid, target_tenant_slug text, phone_e164_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare target_tenant_id uuid; rider public.rider_profiles; subscription public.sms_notification_subscriptions;
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
  select * into subscription from public.sms_notification_subscriptions existing
  where existing.tenant_id = target_tenant_id and existing.rider_profile_id = rider.rider_profile_id
    and existing.phone_e164 = phone_e164_value and existing.status = 'consented_unverified' for update;
  if subscription.sms_subscription_id is null then
    raise exception 'Explicit SMS consent for this phone is required before verification';
  end if;
  update public.sms_notification_subscriptions set status = 'active', verified_at = now(), disabled_at = null
  where sms_subscription_id = subscription.sms_subscription_id;
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (target_tenant_id, 'rider.sms_notifications_enabled', 'person', rider.person_id, '{}',
    'Rider verified a previously consented mobile number.', gen_random_uuid(),
    'rider_profile', rider.rider_profile_id::text,
    jsonb_build_object('phone_last4', right(phone_e164_value, 4),
      'disclosure_version', subscription.disclosure_version));
  return true;
end;
$$;

-- Preserve the existing Driver verification path while satisfying the shared subscription constraints.
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
    (tenant_id, person_id, driver_profile_id, phone_e164, status, consented_at, verified_at,
      disabled_at, consent_source, disclosure_version)
  values (driver.tenant_id, driver.person_id, driver.driver_profile_id, phone_e164_value,
    'active', now(), now(), null, 'driver_verified_sms_flow', 'esh_driver_transactional_sms_v1')
  on conflict (tenant_id, driver_profile_id) where driver_profile_id is not null do update set
    phone_e164 = excluded.phone_e164, status = 'active', consented_at = now(),
    verified_at = now(), disabled_at = null, consent_source = excluded.consent_source,
    disclosure_version = excluded.disclosure_version;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (driver.tenant_id, 'driver.sms_notifications_enabled', 'person', driver.person_id, '{}',
    'Driver verified a phone and consented to transactional SMS.', gen_random_uuid(),
    'driver_profile', driver.driver_profile_id::text,
    jsonb_build_object('phone_last4', right(phone_e164_value, 4),
      'disclosure_version', 'esh_driver_transactional_sms_v1'));
  return true;
end;
$$;

revoke all on function public.save_my_rider_sms_consent(text,text,boolean) from public, anon, authenticated;
grant execute on function public.save_my_rider_sms_consent(text,text,boolean) to authenticated;

comment on function public.save_my_rider_sms_consent(text,text,boolean) is
  'Stores Rider mobile contact and explicit FAIR FARE COMPANY LLC operational SMS consent independently from verification or delivery.';
