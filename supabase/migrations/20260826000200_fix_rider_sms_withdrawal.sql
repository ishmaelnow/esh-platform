-- Fix withdrawal upsert validation: the proposed disabled row must satisfy the
-- consent-state constraint before PostgreSQL evaluates the conflict update.
create or replace function public.save_my_rider_sms_consent(
  target_tenant_slug text, phone_e164_value text, sms_consent_value boolean
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_tenant_id uuid; rider public.rider_profiles;
  existing public.sms_notification_subscriptions;
  saved public.sms_notification_subscriptions;
  next_status text; next_action text;
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
  if not sms_consent_value and existing.sms_subscription_id is not null
    and existing.status in ('consented_unverified', 'active')
    and existing.phone_e164 <> phone_e164_value then
    raise exception 'Withdraw consent for the current number before saving a different number';
  end if;
  if sms_consent_value then
    next_status := case when existing.sms_subscription_id is not null
      and existing.phone_e164 = phone_e164_value and existing.status = 'active'
      then 'active' else 'consented_unverified' end;
    next_action := 'consent_granted';
  elsif existing.sms_subscription_id is not null and existing.phone_e164 = phone_e164_value
    and existing.status in ('consented_unverified', 'active') then
    next_status := 'disabled'; next_action := 'consent_withdrawn';
  else
    next_status := 'not_consented'; next_action := 'phone_saved_without_consent';
  end if;
  insert into public.sms_notification_subscriptions (
    tenant_id, person_id, rider_profile_id, phone_e164, status, consented_at, verified_at,
    disabled_at, consent_source, disclosure_version
  ) values (
    target_tenant_id, rider.person_id, rider.rider_profile_id, phone_e164_value, next_status,
    case when next_status in ('disabled', 'active') then existing.consented_at
      when sms_consent_value then now() else null end,
    case when next_status in ('active', 'disabled') then existing.verified_at else null end,
    case when next_status = 'disabled' then now() end,
    case when next_status <> 'not_consented' then source_value end,
    case when next_status <> 'not_consented' then version_value end
  ) on conflict (tenant_id, rider_profile_id) where rider_profile_id is not null do update set
    phone_e164 = excluded.phone_e164, status = excluded.status,
    consented_at = case when excluded.status = 'disabled' then sms_notification_subscriptions.consented_at else excluded.consented_at end,
    verified_at = case when excluded.status in ('active', 'disabled') then sms_notification_subscriptions.verified_at else null end,
    disabled_at = excluded.disabled_at,
    consent_source = case when excluded.status = 'disabled' then sms_notification_subscriptions.consent_source else excluded.consent_source end,
    disclosure_version = case when excluded.status = 'disabled' then sms_notification_subscriptions.disclosure_version else excluded.disclosure_version end
  returning * into saved;
  update public.rider_profiles set phone = phone_e164_value, updated_at = now()
  where rider_profile_id = rider.rider_profile_id;
  insert into public.sms_consent_events (
    tenant_id, sms_subscription_id, person_id, rider_profile_id, phone_e164,
    consent_action, consent_source, disclosure_version
  ) values (target_tenant_id, saved.sms_subscription_id, rider.person_id, rider.rider_profile_id,
    phone_e164_value, next_action, source_value, version_value);
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (target_tenant_id,
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
      'delivery_enabled', saved.status = 'active'));
  return jsonb_build_object('enabled', saved.status = 'active', 'deliveryEnabled', saved.status = 'active',
    'consented', saved.status in ('consented_unverified', 'active'), 'phoneE164', saved.phone_e164,
    'maskedPhone', '••••' || right(saved.phone_e164, 4), 'status', saved.status,
    'consentedAt', saved.consented_at, 'verifiedAt', saved.verified_at, 'disabledAt', saved.disabled_at,
    'consentSource', saved.consent_source, 'disclosureVersion', saved.disclosure_version);
end;
$$;
revoke all on function public.save_my_rider_sms_consent(text,text,boolean) from public, anon, authenticated;
grant execute on function public.save_my_rider_sms_consent(text,text,boolean) to authenticated;
