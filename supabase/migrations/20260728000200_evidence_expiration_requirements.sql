-- Configure expiration by evidence requirement and enforce it during approval.

alter table public.driver_evidence_requirements
  add column expiration_required boolean not null default false;

update public.driver_evidence_requirements
set expiration_required = true
where evidence_type = 'reference_document';

create or replace function public.enforce_driver_evidence_expiration()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.review_status = 'approved'
    and exists (
      select 1
      from public.driver_evidence_requirements requirement
      where requirement.tenant_id = new.tenant_id
        and requirement.evidence_type = new.evidence_type
        and requirement.expiration_required
    )
    and (new.expires_on is null or new.expires_on <= current_date)
  then
    raise exception 'a future expiration date is required for this evidence type';
  end if;
  return new;
end;
$$;

create trigger driver_evidence_enforce_expiration
  before insert or update on public.driver_evidence
  for each row execute function public.enforce_driver_evidence_expiration();

create or replace function public.driver_compliance_satisfied(target_driver_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.driver_profiles driver
    join public.driver_evidence_requirements requirement
      on requirement.tenant_id = driver.tenant_id
      and requirement.required_for_activation
    left join lateral (
      select evidence.review_status, evidence.expires_on
      from public.driver_evidence evidence
      where evidence.tenant_id = driver.tenant_id
        and evidence.driver_profile_id = driver.driver_profile_id
        and evidence.evidence_type = requirement.evidence_type
      order by evidence.submitted_at desc, evidence.created_at desc
      limit 1
    ) latest on true
    where driver.driver_profile_id = target_driver_profile_id
      and (
        latest.review_status is distinct from 'approved'
        or (latest.expires_on is not null and latest.expires_on < current_date)
        or (
          requirement.expiration_required
          and (latest.expires_on is null or latest.expires_on <= current_date)
        )
      )
  );
$$;

update public.driver_onboarding_checklists checklist
set documents_reviewed = public.driver_compliance_satisfied(checklist.driver_profile_id);

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
      and requirement.expiration_required
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
          'expirationRequired', requirement.expiration_required,
          'reviewStatus', case
            when evidence.evidence_id is null then 'missing'
            when evidence.review_status = 'approved'
              and requirement.expiration_required
              and evidence.expires_on is null then 'expiration_missing'
            when evidence.review_status = 'approved'
              and requirement.expiration_required
              and evidence.expires_on <= current_date then 'expired'
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
