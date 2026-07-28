-- Durable, tenant-scoped driver notification outbox.

create table public.notification_outbox (
  notification_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete cascade,
  driver_profile_id uuid references public.driver_profiles (driver_profile_id) on delete cascade,
  person_id uuid references public.person_profiles (person_id) on delete set null,
  notification_type text not null,
  recipient_email text not null,
  payload jsonb not null default '{}'::jsonb,
  delivery_status text not null default 'queued',
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  last_attempted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  provider_message_id text,
  delivery_error text,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_outbox_type_check check (
    notification_type in (
      'driver_account_ready',
      'driver_evidence_approved',
      'driver_evidence_rejected',
      'driver_activated'
    )
  ),
  constraint notification_outbox_status_check check (
    delivery_status in ('queued', 'sending', 'sent', 'delivered', 'failed')
  ),
  constraint notification_outbox_email_check check (
    recipient_email = lower(btrim(recipient_email)) and length(recipient_email) > 3
  ),
  constraint notification_outbox_attempt_count_check check (attempt_count >= 0)
);

create index notification_outbox_tenant_status_idx
  on public.notification_outbox (tenant_id, delivery_status, available_at, created_at);

create trigger notification_outbox_set_updated_at
  before update on public.notification_outbox
  for each row execute function public.set_updated_at();

alter table public.notification_outbox enable row level security;

create policy notification_outbox_select
  on public.notification_outbox for select to authenticated
  using (public.can_read_driver_management(tenant_id));

grant select on public.notification_outbox to authenticated;
grant all on public.notification_outbox to service_role;

create or replace function public.queue_driver_application_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.application_status = 'approved'
    and old.application_status is distinct from 'approved'
    and new.driver_profile_id is not null
  then
    insert into public.notification_outbox (
      tenant_id, driver_profile_id, notification_type, recipient_email, payload, dedupe_key
    ) values (
      new.tenant_id,
      new.driver_profile_id,
      'driver_account_ready',
      lower(btrim(new.email)),
      jsonb_build_object(
        'driver_name', new.full_name,
        'driver_profile_id', new.driver_profile_id
      ),
      'driver_application:' || new.driver_application_id::text || ':approved'
    )
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

create trigger driver_applications_queue_notification
  after update on public.driver_applications
  for each row execute function public.queue_driver_application_notification();

create or replace function public.queue_driver_evidence_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient text;
  target_person_id uuid;
  driver_name text;
begin
  if new.driver_profile_id is null
    or new.review_status not in ('approved', 'rejected')
    or new.review_status is not distinct from old.review_status
  then
    return new;
  end if;

  select
    lower(btrim(coalesce(person.primary_email, driver.email))),
    person.person_id,
    driver.display_name
  into recipient, target_person_id, driver_name
  from public.driver_profiles driver
  left join public.person_profiles person on person.person_id = driver.person_id
  where driver.driver_profile_id = new.driver_profile_id;

  if recipient is null or recipient = '' then return new; end if;

  insert into public.notification_outbox (
    tenant_id, driver_profile_id, person_id, notification_type,
    recipient_email, payload, dedupe_key
  ) values (
    new.tenant_id,
    new.driver_profile_id,
    target_person_id,
    case
      when new.review_status = 'approved' then 'driver_evidence_approved'
      else 'driver_evidence_rejected'
    end,
    recipient,
    jsonb_build_object(
      'driver_name', driver_name,
      'evidence_type', new.evidence_type,
      'review_notes', new.review_notes,
      'expires_on', new.expires_on,
      'evidence_id', new.evidence_id
    ),
    'driver_evidence:' || new.evidence_id::text || ':' || new.review_status
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

create trigger driver_evidence_queue_notification
  after update on public.driver_evidence
  for each row execute function public.queue_driver_evidence_notification();

create or replace function public.queue_driver_activation_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient text;
  target_person_id uuid;
begin
  if new.status is distinct from 'active' or old.status = 'active' then return new; end if;

  select lower(btrim(coalesce(person.primary_email, new.email))), person.person_id
  into recipient, target_person_id
  from public.person_profiles person
  where person.person_id = new.person_id;

  recipient := coalesce(recipient, lower(btrim(new.email)));
  if recipient is null or recipient = '' then return new; end if;

  insert into public.notification_outbox (
    tenant_id, driver_profile_id, person_id, notification_type,
    recipient_email, payload, dedupe_key
  ) values (
    new.tenant_id,
    new.driver_profile_id,
    target_person_id,
    'driver_activated',
    recipient,
    jsonb_build_object(
      'driver_name', new.display_name,
      'driver_number', new.driver_number,
      'driver_profile_id', new.driver_profile_id
    ),
    'driver:' || new.driver_profile_id::text || ':activated:' || new.updated_at::text
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

create trigger driver_profiles_queue_activation_notification
  after update on public.driver_profiles
  for each row execute function public.queue_driver_activation_notification();
