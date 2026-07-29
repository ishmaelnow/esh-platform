-- Vehicle compliance: tenant requirements, private evidence, driver self-service, review, and reminders.

create table public.vehicle_evidence_requirements (
  tenant_id uuid not null references public.tenants (tenant_id) on delete cascade,
  evidence_type text not null,
  required_for_service boolean not null default true,
  expiration_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  primary key (tenant_id, evidence_type),
  constraint vehicle_evidence_requirements_type_check check (
    evidence_type in ('registration', 'insurance', 'inspection', 'operating_permit')
  )
);

create table public.vehicle_evidence (
  evidence_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  vehicle_id uuid not null,
  evidence_type text not null,
  storage_bucket text not null default 'driver-application-files',
  storage_path text not null,
  original_file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  review_status text not null default 'pending',
  review_notes text,
  expires_on date,
  submitted_at timestamptz not null default now(),
  submitted_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  reviewed_at timestamptz,
  reviewed_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_evidence_vehicle_fk foreign key (tenant_id, vehicle_id)
    references public.vehicles (tenant_id, vehicle_id) on delete restrict,
  constraint vehicle_evidence_type_check check (
    evidence_type in ('registration', 'insurance', 'inspection', 'operating_permit')
  ),
  constraint vehicle_evidence_review_status_check check (
    review_status in ('pending', 'approved', 'rejected')
  ),
  constraint vehicle_evidence_file_name_not_blank check (length(btrim(original_file_name)) > 0),
  constraint vehicle_evidence_mime_type_check check (
    mime_type in ('image/jpeg', 'image/png', 'application/pdf')
  ),
  constraint vehicle_evidence_size_check check (size_bytes between 1 and 5000000),
  constraint vehicle_evidence_review_fields_check check (
    (review_status = 'pending' and reviewed_at is null and reviewed_by_person_id is null)
    or
    (review_status in ('approved', 'rejected') and reviewed_at is not null
      and reviewed_by_person_id is not null)
  ),
  constraint vehicle_evidence_rejection_notes_check check (
    review_status <> 'rejected' or length(btrim(review_notes)) > 0
  ),
  unique (storage_bucket, storage_path)
);

create index vehicle_evidence_tenant_review_idx
  on public.vehicle_evidence (tenant_id, review_status, submitted_at desc);
create index vehicle_evidence_vehicle_type_idx
  on public.vehicle_evidence (vehicle_id, evidence_type, submitted_at desc);

create trigger vehicle_evidence_requirements_set_updated_at
  before update on public.vehicle_evidence_requirements
  for each row execute function public.set_updated_at();
create trigger vehicle_evidence_set_updated_at
  before update on public.vehicle_evidence
  for each row execute function public.set_updated_at();

alter table public.vehicle_evidence_requirements enable row level security;
alter table public.vehicle_evidence enable row level security;
create policy vehicle_evidence_requirements_select
  on public.vehicle_evidence_requirements for select to authenticated
  using (public.can_read_vehicle_management(tenant_id));
create policy vehicle_evidence_requirements_manage
  on public.vehicle_evidence_requirements for all to authenticated
  using (public.can_manage_vehicle_management(tenant_id))
  with check (public.can_manage_vehicle_management(tenant_id));
create policy vehicle_evidence_select
  on public.vehicle_evidence for select to authenticated
  using (public.can_read_vehicle_management(tenant_id));
create policy vehicle_evidence_manage
  on public.vehicle_evidence for update to authenticated
  using (public.can_manage_vehicle_management(tenant_id))
  with check (public.can_manage_vehicle_management(tenant_id));

grant select, insert, update, delete on public.vehicle_evidence_requirements to authenticated;
grant select, update on public.vehicle_evidence to authenticated;
grant all on public.vehicle_evidence_requirements, public.vehicle_evidence to service_role;

insert into public.vehicle_evidence_requirements (
  tenant_id, evidence_type, required_for_service, expiration_required
)
select tenant_id, evidence_type, required_for_service, true
from public.tenants
cross join (values
  ('registration', true),
  ('insurance', true),
  ('inspection', true),
  ('operating_permit', false)
) defaults(evidence_type, required_for_service)
on conflict do nothing;

create or replace function public.seed_vehicle_evidence_requirements()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.vehicle_evidence_requirements (
    tenant_id, evidence_type, required_for_service, expiration_required
  ) values
    (new.tenant_id, 'registration', true, true),
    (new.tenant_id, 'insurance', true, true),
    (new.tenant_id, 'inspection', true, true),
    (new.tenant_id, 'operating_permit', false, true)
  on conflict do nothing;
  return new;
end;
$$;
create trigger tenants_seed_vehicle_evidence_requirements
  after insert on public.tenants for each row
  execute function public.seed_vehicle_evidence_requirements();

create or replace function public.vehicle_compliance_satisfied(target_vehicle_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1
    from public.vehicles vehicle
    join public.vehicle_evidence_requirements requirement
      on requirement.tenant_id = vehicle.tenant_id
      and requirement.required_for_service
    left join lateral (
      select submitted.*
      from public.vehicle_evidence submitted
      where submitted.tenant_id = vehicle.tenant_id
        and submitted.vehicle_id = vehicle.vehicle_id
        and submitted.evidence_type = requirement.evidence_type
      order by submitted.submitted_at desc, submitted.created_at desc
      limit 1
    ) evidence on true
    where vehicle.vehicle_id = target_vehicle_id
      and (
        evidence.evidence_id is null
        or evidence.review_status <> 'approved'
        or (requirement.expiration_required and evidence.expires_on is null)
        or (evidence.expires_on is not null and evidence.expires_on <= current_date)
      )
  );
$$;
grant execute on function public.vehicle_compliance_satisfied(uuid) to authenticated;

create or replace function public.enforce_vehicle_evidence_expiration()
returns trigger language plpgsql set search_path = public as $$
declare expiration_managed boolean;
begin
  select requirement.expiration_required into expiration_managed
  from public.vehicle_evidence_requirements requirement
  where requirement.tenant_id = new.tenant_id
    and requirement.evidence_type = new.evidence_type;
  if new.review_status = 'approved' and coalesce(expiration_managed, false)
    and (new.expires_on is null or new.expires_on <= current_date)
  then raise exception 'approved vehicle evidence requires a future expiration date'; end if;
  if new.review_status = 'approved' and new.expires_on is not null
    and new.expires_on <= current_date
  then raise exception 'vehicle evidence expiration must be a future date'; end if;
  return new;
end;
$$;
create trigger vehicle_evidence_enforce_expiration
  before insert or update on public.vehicle_evidence for each row
  execute function public.enforce_vehicle_evidence_expiration();

drop policy if exists driver_assigned_vehicle_compliance_upload on storage.objects;
create policy driver_assigned_vehicle_compliance_upload
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'driver-application-files'
    and (storage.foldername(name))[1] = 'vehicle-compliance'
    and (storage.foldername(name))[2] = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'pdf')
    and exists (
      select 1
      from public.driver_vehicle_assignments assignment
      join public.driver_profiles driver
        on driver.driver_profile_id = assignment.driver_profile_id
      join public.person_profiles person on person.person_id = driver.person_id
      where assignment.vehicle_id::text = (storage.foldername(name))[3]
        and assignment.ended_at is null
        and person.auth_user_id = auth.uid()
    )
  );

drop policy if exists driver_assigned_vehicle_compliance_read on storage.objects;
create policy driver_assigned_vehicle_compliance_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'driver-application-files'
    and exists (
      select 1
      from public.vehicle_evidence evidence
      join public.driver_vehicle_assignments assignment
        on assignment.tenant_id = evidence.tenant_id
        and assignment.vehicle_id = evidence.vehicle_id
        and assignment.ended_at is null
      join public.driver_profiles driver
        on driver.driver_profile_id = assignment.driver_profile_id
      join public.person_profiles person on person.person_id = driver.person_id
      where evidence.storage_bucket = bucket_id
        and evidence.storage_path = name
        and person.auth_user_id = auth.uid()
    )
  );

create or replace function public.submit_my_vehicle_evidence(
  target_vehicle_id uuid,
  target_evidence_type text,
  target_storage_path text,
  target_original_file_name text,
  target_mime_type text,
  target_size_bytes bigint
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  auth_user uuid := auth.uid();
  target_tenant_id uuid;
  actor_person_id uuid;
  storage_object storage.objects;
  new_evidence_id uuid;
begin
  if auth_user is null then raise exception 'authentication is required'; end if;
  if target_evidence_type not in ('registration', 'insurance', 'inspection', 'operating_permit')
  then raise exception 'unsupported vehicle evidence type'; end if;
  if target_mime_type not in ('image/jpeg', 'image/png', 'application/pdf')
    or target_size_bytes not between 1 and 5000000
    or length(btrim(target_original_file_name)) = 0
  then raise exception 'files must be JPEG, PNG, or PDF and 5MB or smaller'; end if;

  select assignment.tenant_id, person.person_id
  into target_tenant_id, actor_person_id
  from public.driver_vehicle_assignments assignment
  join public.driver_profiles driver on driver.driver_profile_id = assignment.driver_profile_id
  join public.person_profiles person on person.person_id = driver.person_id
  where assignment.vehicle_id = target_vehicle_id
    and assignment.ended_at is null
    and person.auth_user_id = auth_user;
  if target_tenant_id is null then raise exception 'an assigned vehicle is required'; end if;
  if not exists (
    select 1 from public.vehicle_evidence_requirements requirement
    where requirement.tenant_id = target_tenant_id
      and requirement.evidence_type = target_evidence_type
  ) then raise exception 'vehicle evidence type is not configured'; end if;
  if target_storage_path not like
    'vehicle-compliance/' || auth_user::text || '/' || target_vehicle_id::text || '/%'
  then raise exception 'invalid vehicle evidence path'; end if;

  select object.* into storage_object from storage.objects object
  where object.bucket_id = 'driver-application-files' and object.name = target_storage_path;
  if storage_object.id is null then raise exception 'uploaded vehicle evidence was not found'; end if;
  if coalesce((storage_object.metadata ->> 'size')::bigint, 0) <> target_size_bytes
    or coalesce(storage_object.metadata ->> 'mimetype', '') <> target_mime_type
  then raise exception 'uploaded vehicle evidence metadata does not match'; end if;

  insert into public.vehicle_evidence (
    tenant_id, vehicle_id, evidence_type, storage_path, original_file_name,
    mime_type, size_bytes, submitted_by_person_id
  ) values (
    target_tenant_id, target_vehicle_id, target_evidence_type, target_storage_path,
    btrim(target_original_file_name), target_mime_type, target_size_bytes, actor_person_id
  ) returning evidence_id into new_evidence_id;
  return new_evidence_id;
end;
$$;
grant execute on function public.submit_my_vehicle_evidence(uuid, text, text, text, text, bigint)
  to authenticated;

create or replace function public.my_assigned_vehicle_compliance()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'vehicleId', vehicle.vehicle_id,
    'compliant', public.vehicle_compliance_satisfied(vehicle.vehicle_id),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'evidenceType', requirement.evidence_type,
        'requiredForService', requirement.required_for_service,
        'expirationRequired', requirement.expiration_required,
        'reviewStatus', case
          when evidence.evidence_id is null then 'missing'
          when evidence.review_status = 'approved' and requirement.expiration_required
            and evidence.expires_on is null then 'expiration_missing'
          when evidence.review_status = 'approved' and evidence.expires_on is not null
            and evidence.expires_on <= current_date then 'expired'
          else evidence.review_status end,
        'reviewNotes', evidence.review_notes,
        'expiresOn', evidence.expires_on,
        'submittedAt', evidence.submitted_at,
        'originalFileName', evidence.original_file_name
      ) order by requirement.evidence_type)
      from public.vehicle_evidence_requirements requirement
      left join lateral (
        select submitted.* from public.vehicle_evidence submitted
        where submitted.tenant_id = vehicle.tenant_id
          and submitted.vehicle_id = vehicle.vehicle_id
          and submitted.evidence_type = requirement.evidence_type
        order by submitted.submitted_at desc, submitted.created_at desc limit 1
      ) evidence on true
      where requirement.tenant_id = vehicle.tenant_id
    ), '[]'::jsonb)
  )
  from public.driver_vehicle_assignments assignment
  join public.driver_profiles driver on driver.driver_profile_id = assignment.driver_profile_id
  join public.person_profiles person on person.person_id = driver.person_id
  join public.vehicles vehicle on vehicle.vehicle_id = assignment.vehicle_id
  where assignment.ended_at is null and person.auth_user_id = auth.uid()
  limit 1;
$$;
grant execute on function public.my_assigned_vehicle_compliance() to authenticated;

alter table public.notification_outbox drop constraint notification_outbox_type_check;
alter table public.notification_outbox add constraint notification_outbox_type_check check (
  notification_type in (
    'driver_account_ready', 'driver_evidence_approved', 'driver_evidence_rejected',
    'driver_evidence_expiring_30d', 'driver_evidence_expiring_7d', 'driver_evidence_expired',
    'driver_activated', 'vehicle_evidence_approved', 'vehicle_evidence_rejected',
    'vehicle_evidence_expiring_30d', 'vehicle_evidence_expiring_7d', 'vehicle_evidence_expired'
  )
);

create or replace function public.audit_and_notify_vehicle_evidence_review()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  assigned_driver public.driver_profiles;
  recipient text;
begin
  if new.review_status is not distinct from old.review_status then return new; end if;
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles,
    reason, correlation_id, resource_type, resource_id, metadata
  ) values (
    new.tenant_id, 'vehicle.evidence_reviewed', 'person', public.current_person_id(), '{}',
    coalesce(new.review_notes, 'Vehicle evidence review status changed.'), gen_random_uuid(),
    'vehicle_evidence', new.evidence_id::text,
    jsonb_build_object('vehicle_id', new.vehicle_id, 'evidence_type', new.evidence_type,
      'status', new.review_status)
  );
  select driver.* into assigned_driver
  from public.driver_vehicle_assignments assignment
  join public.driver_profiles driver on driver.driver_profile_id = assignment.driver_profile_id
  where assignment.vehicle_id = new.vehicle_id and assignment.ended_at is null limit 1;
  if assigned_driver.driver_profile_id is null then return new; end if;
  select lower(btrim(coalesce(person.primary_email, assigned_driver.email)))
    into recipient from public.person_profiles person
    where person.person_id = assigned_driver.person_id;
  recipient := coalesce(recipient, lower(btrim(assigned_driver.email)));
  if recipient is null or recipient = '' then return new; end if;
  insert into public.notification_outbox (
    tenant_id, driver_profile_id, person_id, notification_type,
    recipient_email, payload, dedupe_key
  ) values (
    new.tenant_id, assigned_driver.driver_profile_id, assigned_driver.person_id,
    case when new.review_status = 'approved' then 'vehicle_evidence_approved'
      else 'vehicle_evidence_rejected' end,
    recipient,
    jsonb_build_object('driver_name', assigned_driver.display_name,
      'vehicle_id', new.vehicle_id, 'evidence_id', new.evidence_id,
      'evidence_type', new.evidence_type, 'review_notes', new.review_notes,
      'expires_on', new.expires_on),
    'vehicle_evidence:' || new.evidence_id::text || ':' || new.review_status
  ) on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
create trigger vehicle_evidence_audit_notify_review
  after update on public.vehicle_evidence for each row
  execute function public.audit_and_notify_vehicle_evidence_review();

create or replace function public.queue_vehicle_expiration_notifications(
  target_date date default current_date
)
returns integer language plpgsql security definer set search_path = public as $$
declare inserted_count integer;
begin
  with candidates as (
    select vehicle.tenant_id, vehicle.vehicle_id, driver.driver_profile_id, driver.person_id,
      driver.display_name, lower(btrim(coalesce(person.primary_email, driver.email))) recipient,
      evidence.evidence_id, evidence.evidence_type, evidence.expires_on,
      case when evidence.expires_on < target_date then 'vehicle_evidence_expired'
        when evidence.expires_on <= target_date + 7 then 'vehicle_evidence_expiring_7d'
        when evidence.expires_on <= target_date + 30 then 'vehicle_evidence_expiring_30d' end kind
    from public.vehicles vehicle
    join public.vehicle_evidence_requirements requirement
      on requirement.tenant_id = vehicle.tenant_id and requirement.required_for_service
    join lateral (
      select submitted.* from public.vehicle_evidence submitted
      where submitted.vehicle_id = vehicle.vehicle_id
        and submitted.evidence_type = requirement.evidence_type
      order by submitted.submitted_at desc, submitted.created_at desc limit 1
    ) evidence on true
    join public.driver_vehicle_assignments assignment
      on assignment.vehicle_id = vehicle.vehicle_id and assignment.ended_at is null
    join public.driver_profiles driver on driver.driver_profile_id = assignment.driver_profile_id
    left join public.person_profiles person on person.person_id = driver.person_id
    left join public.driver_notification_preferences preferences
      on preferences.driver_profile_id = driver.driver_profile_id
    where evidence.review_status = 'approved' and evidence.expires_on is not null
      and evidence.expires_on <= target_date + 30
      and coalesce(preferences.expiration_reminders_enabled, true)
      and coalesce(person.primary_email, driver.email) is not null
  )
  insert into public.notification_outbox (
    tenant_id, driver_profile_id, person_id, notification_type,
    recipient_email, payload, dedupe_key
  )
  select tenant_id, driver_profile_id, person_id, kind, recipient,
    jsonb_build_object('driver_name', display_name, 'vehicle_id', vehicle_id,
      'evidence_id', evidence_id, 'evidence_type', evidence_type, 'expires_on', expires_on),
    'vehicle_evidence:' || evidence_id::text || ':' || kind
  from candidates where kind is not null
  on conflict (dedupe_key) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function public.queue_vehicle_expiration_notifications(date)
  from public, anon, authenticated;
grant execute on function public.queue_vehicle_expiration_notifications(date) to service_role;

create or replace function public.cancel_vehicle_reminders_when_disabled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.expiration_reminders_enabled
    and old.expiration_reminders_enabled is distinct from false
  then
    update public.notification_outbox set
      delivery_status = 'canceled',
      delivery_error = 'Driver disabled expiration reminders.'
    where driver_profile_id = new.driver_profile_id
      and notification_type in (
        'vehicle_evidence_expiring_30d',
        'vehicle_evidence_expiring_7d',
        'vehicle_evidence_expired'
      )
      and delivery_status in ('queued', 'failed');
  end if;
  return new;
end;
$$;
create trigger driver_preferences_cancel_vehicle_reminders
  after update of expiration_reminders_enabled on public.driver_notification_preferences
  for each row execute function public.cancel_vehicle_reminders_when_disabled();
