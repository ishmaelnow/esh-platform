-- Preserve existing email choices; device consent remains per-installation.
alter table public.rider_notification_preferences
  add column trip_email_enabled boolean not null default true,
  add column payment_email_enabled boolean not null default true;
alter table public.driver_notification_preferences
  add column expiration_email_enabled boolean not null default true,
  add column earnings_email_enabled boolean not null default true,
  add column trip_email_enabled boolean not null default true;
update public.rider_notification_preferences set trip_email_enabled=trip_updates_enabled,
  payment_email_enabled=payment_updates_enabled;
update public.driver_notification_preferences set expiration_email_enabled=expiration_reminders_enabled,
  earnings_email_enabled=earnings_updates_enabled;

-- Existing fields are internal event gates: email OR opted-in device.
create function public.has_device_notification_channel(tenant_value uuid,rider_value uuid,driver_value uuid)
returns boolean language sql volatile security definer set search_path=public as $$
  select exists(select 1 from public.native_push_registrations r
    where r.tenant_id=tenant_value and r.status='active'
      and ((rider_value is not null and r.product='rider' and r.rider_profile_id=rider_value)
        or (rider_value is null and driver_value is not null and r.product='driver' and r.driver_profile_id=driver_value)))
    or exists(select 1 from public.push_subscriptions r
      where r.tenant_id=tenant_value and r.status='active'
        and ((rider_value is not null and r.rider_profile_id=rider_value)
          or (rider_value is null and driver_value is not null and r.driver_profile_id=driver_value)));
$$;
create function public.derive_notification_event_preferences()
returns trigger language plpgsql security definer set search_path=public as $$
declare device_enabled boolean;
begin
  if tg_table_name='rider_notification_preferences' then
    device_enabled := public.has_device_notification_channel(new.tenant_id,new.rider_profile_id,null);
    new.trip_updates_enabled := new.trip_email_enabled or device_enabled;
    new.payment_updates_enabled := new.payment_email_enabled or device_enabled;
  else
    device_enabled := public.has_device_notification_channel(new.tenant_id,null,new.driver_profile_id);
    new.expiration_reminders_enabled := new.expiration_email_enabled or device_enabled;
    new.earnings_updates_enabled := new.earnings_email_enabled or device_enabled;
  end if;
  return new;
end; $$;
create trigger rider_notification_event_preferences before insert or update on public.rider_notification_preferences
  for each row execute function public.derive_notification_event_preferences();
create trigger driver_notification_event_preferences before insert or update on public.driver_notification_preferences
  for each row execute function public.derive_notification_event_preferences();

create function public.refresh_device_notification_event_preferences()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- Token refresh does not change channel eligibility.
  if tg_op='UPDATE' and (old.status,old.tenant_id,old.rider_profile_id,old.driver_profile_id)
    is not distinct from (new.status,new.tenant_id,new.rider_profile_id,new.driver_profile_id) then return new; end if;
  if tg_op<>'INSERT' then
    update public.rider_notification_preferences set trip_email_enabled=trip_email_enabled
      where tenant_id=old.tenant_id and rider_profile_id=old.rider_profile_id;
    update public.driver_notification_preferences set earnings_email_enabled=earnings_email_enabled
      where tenant_id=old.tenant_id and driver_profile_id=old.driver_profile_id;
  end if;
  if tg_op<>'DELETE' then
    update public.rider_notification_preferences set trip_email_enabled=trip_email_enabled
      where tenant_id=new.tenant_id and rider_profile_id=new.rider_profile_id;
    update public.driver_notification_preferences set earnings_email_enabled=earnings_email_enabled
      where tenant_id=new.tenant_id and driver_profile_id=new.driver_profile_id;
    return new;
  end if;
  return old;
end; $$;
create trigger native_push_channel_preferences after insert or update or delete on public.native_push_registrations
  for each row execute function public.refresh_device_notification_event_preferences();
create trigger web_push_channel_preferences after insert or update or delete on public.push_subscriptions
  for each row execute function public.refresh_device_notification_event_preferences();

create function public.notification_email_channel_enabled(tenant_value uuid,rider_value uuid,driver_value uuid,type_value text)
returns boolean language sql stable security definer set search_path=public as $$
  select case
    when rider_value is not null and type_value in ('rider_payment_succeeded','rider_refund_succeeded',
      'rider_recurring_autopay_failed','rider_recurring_autopay_succeeded') then
      coalesce((select payment_email_enabled from public.rider_notification_preferences
        where tenant_id=tenant_value and rider_profile_id=rider_value),true)
    when rider_value is not null and type_value like 'rider_%' then
      coalesce((select trip_email_enabled from public.rider_notification_preferences
        where tenant_id=tenant_value and rider_profile_id=rider_value),true)
    when driver_value is not null and type_value='dispatch_offer_created' then
      coalesce((select trip_email_enabled from public.driver_notification_preferences
        where tenant_id=tenant_value and driver_profile_id=driver_value),true)
    when driver_value is not null and type_value in ('driver_earnings_recorded','driver_transfer_succeeded',
      'driver_bank_payout_created','driver_bank_payout_paid','driver_bank_payout_failed') then
      coalesce((select earnings_email_enabled from public.driver_notification_preferences
        where tenant_id=tenant_value and driver_profile_id=driver_value),true)
    when driver_value is not null and type_value in ('driver_evidence_expiring_30d','driver_evidence_expiring_7d',
      'driver_evidence_expired','vehicle_evidence_expiring_30d','vehicle_evidence_expiring_7d','vehicle_evidence_expired') then
      coalesce((select expiration_email_enabled from public.driver_notification_preferences
        where tenant_id=tenant_value and driver_profile_id=driver_value),true)
    else true end;
$$;
alter table public.notification_outbox add column email_delivery_enabled boolean not null default true;
alter table public.notification_outbox drop constraint notification_outbox_status_check;
alter table public.notification_outbox add constraint notification_outbox_status_check
  check(delivery_status in ('queued','sending','sent','delivered','failed','canceled','email_disabled'));

create function public.mask_notification_email_channel()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.email_delivery_enabled := new.email_delivery_enabled and
    public.notification_email_channel_enabled(new.tenant_id,new.rider_profile_id,new.driver_profile_id,new.notification_type);
  return new;
end; $$;
create trigger notification_email_channel before insert or update on public.notification_outbox
  for each row execute function public.mask_notification_email_channel();
create function public.disable_queued_notification_emails()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name='rider_notification_preferences' then
    update public.notification_outbox set email_delivery_enabled=false
      where tenant_id=new.tenant_id and rider_profile_id=new.rider_profile_id
        and delivery_status in ('queued','failed','sending')
        and not public.notification_email_channel_enabled(tenant_id,rider_profile_id,driver_profile_id,notification_type);
  else
    update public.notification_outbox set email_delivery_enabled=false
      where tenant_id=new.tenant_id and driver_profile_id=new.driver_profile_id
        and delivery_status in ('queued','failed','sending')
        and not public.notification_email_channel_enabled(tenant_id,rider_profile_id,driver_profile_id,notification_type);
  end if;
  return new;
end; $$;
create trigger rider_disable_queued_emails after insert or update on public.rider_notification_preferences
  for each row execute function public.disable_queued_notification_emails();
create trigger driver_disable_queued_emails after insert or update on public.driver_notification_preferences
  for each row execute function public.disable_queued_notification_emails();

create or replace function public.set_my_rider_notification_preferences(
  target_tenant_slug text, trip_updates_enabled_value boolean
)
returns boolean language plpgsql security definer set search_path = public as $$
declare target_tenant_id uuid; target_rider_profile_id uuid;
begin
  select config.tenant_id into target_tenant_id from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  where config.tenant_slug = lower(btrim(target_tenant_slug)) and tenant.status = 'active';
  if target_tenant_id is null then raise exception 'booking tenant is unavailable'; end if;
  target_rider_profile_id := public.current_rider_profile_id(target_tenant_id);
  if target_rider_profile_id is null then raise exception 'active rider profile is required'; end if;
  insert into public.rider_notification_preferences (rider_profile_id, tenant_id, trip_email_enabled)
  values (target_rider_profile_id, target_tenant_id, trip_updates_enabled_value)
  on conflict (rider_profile_id) do update set trip_email_enabled = excluded.trip_email_enabled;

  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  select target_tenant_id, 'rider.notification_preferences_updated', 'person', rider.person_id,
    '{}', 'Rider updated trip email preferences.', gen_random_uuid(), 'rider_profile',
    target_rider_profile_id::text, jsonb_build_object('trip_email_enabled', trip_updates_enabled_value)
  from public.rider_profiles rider where rider.rider_profile_id = target_rider_profile_id;
  return trip_updates_enabled_value;
end;
$$;

create or replace function public.set_my_driver_notification_preferences(
  expiration_reminders_enabled_value boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_driver_profile_id uuid;
  target_tenant_id uuid;
begin
  select driver.driver_profile_id, driver.tenant_id
  into target_driver_profile_id, target_tenant_id
  from public.driver_profiles driver
  join public.person_profiles person on person.person_id = driver.person_id
  where person.auth_user_id = auth.uid()
  order by driver.created_at
  limit 1;

  if target_driver_profile_id is null then raise exception 'driver profile is unavailable'; end if;

  insert into public.driver_notification_preferences (
    driver_profile_id, tenant_id, expiration_email_enabled
  ) values (
    target_driver_profile_id, target_tenant_id, expiration_reminders_enabled_value
  )
  on conflict (driver_profile_id) do update
  set expiration_email_enabled = excluded.expiration_email_enabled;



  insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,
    reason,correlation_id,resource_type,resource_id,metadata)
    select target_tenant_id,'driver.expiration_email_preferences_updated','person',person_id,'{}',
      'Driver updated evidence email preferences.',gen_random_uuid(),'driver_profile',
      target_driver_profile_id::text,jsonb_build_object('enabled',expiration_reminders_enabled_value)
      from public.driver_profiles where driver_profile_id=target_driver_profile_id;
  return expiration_reminders_enabled_value;
end;
$$;

create or replace function public.my_driver_portal_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'driverProfileId', driver.driver_profile_id,
    'driverNumber', driver.driver_number,
    'displayName', driver.display_name,
    'email', driver.email,
    'phone', driver.phone,
    'status', driver.status,
    'onboardingStatus', checklist.review_status,
    'documentCompliance', checklist.documents_reviewed,
    'notificationPreferences', jsonb_build_object(
      'expirationRemindersEnabled', coalesce(preferences.expiration_email_enabled, true)
    ),
    'vehicle', (
      select jsonb_build_object(
        'vehicleId', vehicle.vehicle_id, 'vehicleNumber', vehicle.vehicle_number,
        'make', vehicle.make, 'model', vehicle.model, 'modelYear', vehicle.model_year,
        'color', vehicle.color, 'licensePlate', vehicle.license_plate,
        'status', vehicle.status, 'hasPhoto', vehicle.photo_storage_path is not null,
        'photoStorageBucket', vehicle.photo_storage_bucket,
        'photoStoragePath', vehicle.photo_storage_path
      )
      from public.driver_vehicle_assignments assignment
      join public.vehicles vehicle on vehicle.vehicle_id = assignment.vehicle_id
      where assignment.driver_profile_id = driver.driver_profile_id and assignment.ended_at is null
      limit 1
    ),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'evidenceType', requirement.evidence_type,
        'requiredForActivation', requirement.required_for_activation,
        'expirationRequired', requirement.expiration_required,
        'reviewStatus', case
          when evidence.evidence_id is null then 'missing'
          when evidence.review_status = 'approved' and requirement.expiration_required
            and evidence.expires_on is null then 'expiration_missing'
          when evidence.review_status = 'approved' and requirement.expiration_required
            and evidence.expires_on <= current_date then 'expired'
          when evidence.review_status = 'approved' and evidence.expires_on is not null
            and evidence.expires_on < current_date then 'expired'
          else evidence.review_status end,
        'reviewNotes', evidence.review_notes, 'expiresOn', evidence.expires_on,
        'submittedAt', evidence.submitted_at, 'originalFileName', evidence.original_file_name
      ) order by requirement.evidence_type)
      from public.driver_evidence_requirements requirement
      left join lateral (
        select submitted.* from public.driver_evidence submitted
        where submitted.tenant_id = driver.tenant_id
          and submitted.driver_profile_id = driver.driver_profile_id
          and submitted.evidence_type = requirement.evidence_type
        order by submitted.submitted_at desc, submitted.created_at desc limit 1
      ) evidence on true where requirement.tenant_id = driver.tenant_id
    ), '[]'::jsonb)
  )
  from public.driver_profiles driver
  join public.person_profiles person on person.person_id = driver.person_id
  left join public.driver_onboarding_checklists checklist
    on checklist.driver_profile_id = driver.driver_profile_id
  left join public.driver_notification_preferences preferences
    on preferences.driver_profile_id = driver.driver_profile_id
  where person.auth_user_id = auth.uid()
  order by driver.created_at limit 1;
$$;

create or replace function public.my_driver_earnings_notification_preferences()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('earningsUpdatesEnabled', coalesce(preference.earnings_email_enabled, true))
  from public.driver_profiles driver
  join public.person_profiles person on person.person_id = driver.person_id
  left join public.driver_notification_preferences preference on preference.driver_profile_id = driver.driver_profile_id
  where person.auth_user_id = auth.uid() order by driver.created_at limit 1;
$$;

create or replace function public.set_my_driver_earnings_notification_preferences(
  earnings_updates_enabled_value boolean
)
returns boolean language plpgsql security definer set search_path = public as $$
declare driver_id uuid := public.current_driver_profile_id(); target_tenant_id uuid; actor_id uuid;
begin
  if driver_id is null then raise exception 'active Driver profile is required'; end if;
  select tenant_id, person_id into target_tenant_id, actor_id from public.driver_profiles
    where driver_profile_id = driver_id;
  insert into public.driver_notification_preferences (driver_profile_id, tenant_id, earnings_email_enabled)
  values (driver_id, target_tenant_id, earnings_updates_enabled_value)
  on conflict (driver_profile_id) do update set earnings_email_enabled = excluded.earnings_email_enabled;

  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (target_tenant_id, 'driver.earnings_notification_preferences_updated', 'person', actor_id,
    '{}', 'Driver updated earnings email preferences.', gen_random_uuid(), 'driver_profile',
    driver_id::text, jsonb_build_object('earnings_email_enabled', earnings_updates_enabled_value));
  return earnings_updates_enabled_value;
end;
$$;

create or replace function public.my_rider_notification_preferences(target_tenant_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare target_tenant_id uuid; target_rider_profile_id uuid;
begin
  select config.tenant_id into target_tenant_id from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  where config.tenant_slug = lower(btrim(target_tenant_slug)) and tenant.status = 'active';
  if target_tenant_id is null then raise exception 'booking tenant is unavailable'; end if;
  target_rider_profile_id := public.current_rider_profile_id(target_tenant_id);
  if target_rider_profile_id is null then raise exception 'active rider profile is required'; end if;
  return (select jsonb_build_object(
    'tripUpdatesEnabled', coalesce(preference.trip_email_enabled, true),
    'paymentUpdatesEnabled', coalesce(preference.payment_email_enabled, true))
    from (select target_rider_profile_id) context
    left join public.rider_notification_preferences preference
      on preference.rider_profile_id = context.target_rider_profile_id);
end;
$$;

create or replace function public.set_my_rider_payment_notification_preferences(
  target_tenant_slug text, payment_updates_enabled_value boolean
)
returns boolean language plpgsql security definer set search_path = public as $$
declare target_tenant_id uuid; target_rider_profile_id uuid;
begin
  select config.tenant_id into target_tenant_id from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  where config.tenant_slug = lower(btrim(target_tenant_slug)) and tenant.status = 'active';
  if target_tenant_id is null then raise exception 'booking tenant is unavailable'; end if;
  target_rider_profile_id := public.current_rider_profile_id(target_tenant_id);
  if target_rider_profile_id is null then raise exception 'active rider profile is required'; end if;
  insert into public.rider_notification_preferences (rider_profile_id, tenant_id, payment_email_enabled)
  values (target_rider_profile_id, target_tenant_id, payment_updates_enabled_value)
  on conflict (rider_profile_id) do update set payment_email_enabled = excluded.payment_email_enabled;

  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  select target_tenant_id, 'rider.payment_notification_preferences_updated', 'person', rider.person_id,
    '{}', 'Rider updated payment email preferences.', gen_random_uuid(), 'rider_profile',
    target_rider_profile_id::text, jsonb_build_object('payment_email_enabled', payment_updates_enabled_value)
  from public.rider_profiles rider where rider.rider_profile_id = target_rider_profile_id;
  return payment_updates_enabled_value;
end;
$$;

create function public.my_driver_trip_email_preferences()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select trip_email_enabled from public.driver_notification_preferences
    where driver_profile_id=public.current_driver_profile_id()),true);
$$;
create function public.set_my_driver_trip_email_preferences(enabled_value boolean)
returns boolean language plpgsql security definer set search_path=public as $$
declare driver_id uuid:=public.current_driver_profile_id(); driver public.driver_profiles;
begin
  if driver_id is null or enabled_value is null then raise exception 'Driver access and a preference are required'; end if;
  select * into driver from public.driver_profiles where driver_profile_id=driver_id;
  insert into public.driver_notification_preferences(driver_profile_id,tenant_id,trip_email_enabled)
    values(driver_id,driver.tenant_id,enabled_value)
    on conflict(driver_profile_id) do update set trip_email_enabled=excluded.trip_email_enabled;
  insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,
    reason,correlation_id,resource_type,resource_id,metadata)
    values(driver.tenant_id,'driver.trip_email_preferences_updated','person',driver.person_id,'{}',
      'Driver updated trip email preferences.',gen_random_uuid(),'driver_profile',driver_id::text,
      jsonb_build_object('enabled',enabled_value));
  return enabled_value;
end; $$;

-- Recompute future event eligibility without replaying old business events.
update public.rider_notification_preferences set trip_email_enabled=trip_email_enabled;
update public.driver_notification_preferences set earnings_email_enabled=earnings_email_enabled;
update public.notification_outbox set email_delivery_enabled=false
  where delivery_status in ('queued','failed','sending') and
    not public.notification_email_channel_enabled(tenant_id,rider_profile_id,driver_profile_id,notification_type);

revoke all on function public.has_device_notification_channel(uuid,uuid,uuid),
  public.derive_notification_event_preferences(),public.refresh_device_notification_event_preferences(),
  public.notification_email_channel_enabled(uuid,uuid,uuid,text),public.mask_notification_email_channel(),
  public.disable_queued_notification_emails(),public.my_driver_trip_email_preferences(),
  public.set_my_driver_trip_email_preferences(boolean) from public,anon,authenticated;
grant execute on function public.my_driver_trip_email_preferences(),public.set_my_driver_trip_email_preferences(boolean) to authenticated;
-- SQL helpers are private; email masking runs only inside privileged triggers.

