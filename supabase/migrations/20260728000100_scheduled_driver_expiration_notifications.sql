-- Driver-controlled expiration reminders and idempotent daily reminder generation.

alter table public.notification_outbox
  drop constraint notification_outbox_type_check;

alter table public.notification_outbox
  add constraint notification_outbox_type_check check (
    notification_type in (
      'driver_account_ready',
      'driver_evidence_approved',
      'driver_evidence_rejected',
      'driver_evidence_expiring_30d',
      'driver_evidence_expiring_7d',
      'driver_evidence_expired',
      'driver_activated'
    )
  );

alter table public.notification_outbox
  drop constraint notification_outbox_status_check;

alter table public.notification_outbox
  add constraint notification_outbox_status_check check (
    delivery_status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'canceled')
  );

create table public.driver_notification_preferences (
  driver_profile_id uuid primary key references public.driver_profiles (driver_profile_id) on delete cascade,
  tenant_id uuid not null references public.tenants (tenant_id) on delete cascade,
  expiration_reminders_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, driver_profile_id)
);

create trigger driver_notification_preferences_set_updated_at
  before update on public.driver_notification_preferences
  for each row execute function public.set_updated_at();

alter table public.driver_notification_preferences enable row level security;

create policy driver_notification_preferences_admin_select
  on public.driver_notification_preferences for select to authenticated
  using (public.can_read_driver_management(tenant_id));

grant select on public.driver_notification_preferences to authenticated;
grant all on public.driver_notification_preferences to service_role;

insert into public.driver_notification_preferences (driver_profile_id, tenant_id)
select driver_profile_id, tenant_id
from public.driver_profiles
on conflict (driver_profile_id) do nothing;

create or replace function public.seed_driver_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.driver_notification_preferences (driver_profile_id, tenant_id)
  values (new.driver_profile_id, new.tenant_id)
  on conflict (driver_profile_id) do nothing;
  return new;
end;
$$;

create trigger driver_profiles_seed_notification_preferences
  after insert on public.driver_profiles
  for each row execute function public.seed_driver_notification_preferences();

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
    driver_profile_id, tenant_id, expiration_reminders_enabled
  ) values (
    target_driver_profile_id, target_tenant_id, expiration_reminders_enabled_value
  )
  on conflict (driver_profile_id) do update
  set expiration_reminders_enabled = excluded.expiration_reminders_enabled;

  if not expiration_reminders_enabled_value then
    update public.notification_outbox
    set
      delivery_status = 'canceled',
      delivery_error = 'Driver disabled expiration reminders.'
    where driver_profile_id = target_driver_profile_id
      and notification_type in (
        'driver_evidence_expiring_30d',
        'driver_evidence_expiring_7d',
        'driver_evidence_expired'
      )
      and delivery_status in ('queued', 'failed');
  end if;

  return expiration_reminders_enabled_value;
end;
$$;

grant execute on function public.set_my_driver_notification_preferences(boolean) to authenticated;

create or replace function public.queue_driver_expiration_notifications(
  target_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  with latest_required_evidence as (
    select
      driver.tenant_id,
      driver.driver_profile_id,
      driver.person_id,
      driver.display_name,
      lower(btrim(coalesce(person.primary_email, driver.email))) as recipient_email,
      evidence.evidence_id,
      evidence.evidence_type,
      evidence.expires_on,
      case
        when evidence.expires_on < target_date then 'driver_evidence_expired'
        when evidence.expires_on <= target_date + 7 then 'driver_evidence_expiring_7d'
        when evidence.expires_on <= target_date + 30 then 'driver_evidence_expiring_30d'
      end as notification_type
    from public.driver_profiles driver
    left join public.person_profiles person on person.person_id = driver.person_id
    join public.driver_evidence_requirements requirement
      on requirement.tenant_id = driver.tenant_id
      and requirement.required_for_activation
    join lateral (
      select submitted.*
      from public.driver_evidence submitted
      where submitted.tenant_id = driver.tenant_id
        and submitted.driver_profile_id = driver.driver_profile_id
        and submitted.evidence_type = requirement.evidence_type
      order by submitted.submitted_at desc, submitted.created_at desc
      limit 1
    ) evidence on true
    left join public.driver_notification_preferences preferences
      on preferences.driver_profile_id = driver.driver_profile_id
    where evidence.review_status = 'approved'
      and evidence.expires_on is not null
      and evidence.expires_on <= target_date + 30
      and coalesce(preferences.expiration_reminders_enabled, true)
      and coalesce(person.primary_email, driver.email) is not null
  )
  insert into public.notification_outbox (
    tenant_id, driver_profile_id, person_id, notification_type,
    recipient_email, payload, dedupe_key
  )
  select
    tenant_id,
    driver_profile_id,
    person_id,
    notification_type,
    recipient_email,
    jsonb_build_object(
      'driver_name', display_name,
      'evidence_id', evidence_id,
      'evidence_type', evidence_type,
      'expires_on', expires_on
    ),
    'driver_evidence:' || evidence_id::text || ':' || notification_type
  from latest_required_evidence
  where notification_type is not null
  on conflict (dedupe_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.queue_driver_expiration_notifications(date) from public, anon, authenticated;
grant execute on function public.queue_driver_expiration_notifications(date) to service_role;

create or replace function public.my_driver_portal_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
      'expirationRemindersEnabled',
      coalesce(preferences.expiration_reminders_enabled, true)
    ),
    'documents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'evidenceType', requirement.evidence_type,
          'requiredForActivation', requirement.required_for_activation,
          'reviewStatus', case
            when evidence.evidence_id is null then 'missing'
            when evidence.review_status = 'approved'
              and evidence.expires_on is not null
              and evidence.expires_on < current_date then 'expired'
            else evidence.review_status
          end,
          'reviewNotes', evidence.review_notes,
          'expiresOn', evidence.expires_on,
          'submittedAt', evidence.submitted_at,
          'originalFileName', evidence.original_file_name
        )
        order by requirement.evidence_type
      )
      from public.driver_evidence_requirements requirement
      left join lateral (
        select submitted.*
        from public.driver_evidence submitted
        where submitted.tenant_id = driver.tenant_id
          and submitted.driver_profile_id = driver.driver_profile_id
          and submitted.evidence_type = requirement.evidence_type
        order by submitted.submitted_at desc, submitted.created_at desc
        limit 1
      ) evidence on true
      where requirement.tenant_id = driver.tenant_id
    ), '[]'::jsonb)
  )
  from public.driver_profiles driver
  join public.person_profiles person on person.person_id = driver.person_id
  left join public.driver_onboarding_checklists checklist
    on checklist.driver_profile_id = driver.driver_profile_id
  left join public.driver_notification_preferences preferences
    on preferences.driver_profile_id = driver.driver_profile_id
  where person.auth_user_id = auth.uid()
  order by driver.created_at
  limit 1;
$$;

grant execute on function public.my_driver_portal_summary() to authenticated;
