-- Tenant-governed scheduled Rider bookings with delayed dispatch activation and reminders.

alter table public.dispatch_bookings
  add column scheduled_pickup_at timestamptz,
  add column dispatch_ready_at timestamptz,
  drop constraint dispatch_bookings_status_check,
  add constraint dispatch_bookings_status_check check (
    status in ('scheduled', 'requested', 'offered', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled')
  ),
  add constraint dispatch_bookings_schedule_check check (
    (status = 'scheduled' and scheduled_pickup_at is not null and dispatch_ready_at is not null)
    or status <> 'scheduled'
  ),
  add constraint dispatch_bookings_schedule_order_check check (
    scheduled_pickup_at is null or dispatch_ready_at <= scheduled_pickup_at
  );

create index dispatch_bookings_scheduled_ready_idx
  on public.dispatch_bookings (dispatch_ready_at)
  where status = 'scheduled';

create table public.tenant_scheduling_settings (
  tenant_id uuid primary key references public.tenants (tenant_id) on delete cascade,
  minimum_notice_minutes integer not null default 60,
  maximum_advance_days integer not null default 90,
  dispatch_lead_minutes integer not null default 30,
  reminder_lead_hours integer not null default 24,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_scheduling_minimum_check check (minimum_notice_minutes between 15 and 10080),
  constraint tenant_scheduling_maximum_check check (maximum_advance_days between 1 and 365),
  constraint tenant_scheduling_dispatch_lead_check check (dispatch_lead_minutes between 5 and 1440),
  constraint tenant_scheduling_reminder_check check (reminder_lead_hours between 1 and 168)
);

create trigger tenant_scheduling_settings_set_updated_at
  before update on public.tenant_scheduling_settings
  for each row execute function public.set_updated_at();

insert into public.tenant_scheduling_settings (tenant_id)
select tenant_id from public.tenants on conflict (tenant_id) do nothing;

create or replace function public.seed_tenant_scheduling_settings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tenant_scheduling_settings (tenant_id) values (new.tenant_id)
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;
create trigger tenants_seed_scheduling_settings
  after insert on public.tenants for each row execute function public.seed_tenant_scheduling_settings();

-- Forward declaration; the authorized implementation is installed below.
create or replace function public.activate_due_scheduled_bookings(target_tenant_id uuid)
returns integer language sql security definer set search_path = public as $$ select 0; $$;

alter table public.tenant_scheduling_settings enable row level security;
create policy tenant_scheduling_settings_manager_select
  on public.tenant_scheduling_settings for select to authenticated
  using (public.can_manage_dispatch(tenant_id));
grant select on public.tenant_scheduling_settings to authenticated;
grant all on public.tenant_scheduling_settings to service_role;

create or replace function public.set_tenant_scheduling_settings(
  target_tenant_id uuid,
  minimum_notice_minutes_value integer,
  maximum_advance_days_value integer,
  dispatch_lead_minutes_value integer,
  reminder_lead_hours_value integer
)
returns boolean language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id();
begin
  if actor_id is null or not public.can_manage_dispatch(target_tenant_id) then
    raise exception 'dispatch management permission is required';
  end if;
  insert into public.tenant_scheduling_settings (
    tenant_id, minimum_notice_minutes, maximum_advance_days,
    dispatch_lead_minutes, reminder_lead_hours
  ) values (
    target_tenant_id, minimum_notice_minutes_value, maximum_advance_days_value,
    dispatch_lead_minutes_value, reminder_lead_hours_value
  ) on conflict (tenant_id) do update set
    minimum_notice_minutes = excluded.minimum_notice_minutes,
    maximum_advance_days = excluded.maximum_advance_days,
    dispatch_lead_minutes = excluded.dispatch_lead_minutes,
    reminder_lead_hours = excluded.reminder_lead_hours;
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    target_tenant_id, 'dispatch.scheduling_settings_updated', 'person', actor_id, '{}',
    'Tenant scheduling limits were updated.', gen_random_uuid(), 'tenant_scheduling_settings',
    target_tenant_id::text, jsonb_build_object(
      'minimum_notice_minutes', minimum_notice_minutes_value,
      'maximum_advance_days', maximum_advance_days_value,
      'dispatch_lead_minutes', dispatch_lead_minutes_value,
      'reminder_lead_hours', reminder_lead_hours_value
    )
  );
  return true;
end;
$$;

create or replace function public.my_rider_scheduling(target_tenant_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target_tenant_id uuid; rider_id uuid;
begin
  select config.tenant_id into target_tenant_id
  from public.tenant_configurations config join public.tenants tenant using (tenant_id)
  where config.tenant_slug = lower(btrim(target_tenant_slug)) and tenant.status = 'active';
  if target_tenant_id is null then raise exception 'booking tenant is unavailable'; end if;
  rider_id := public.current_rider_profile_id(target_tenant_id);
  if rider_id is null then raise exception 'active rider profile is required'; end if;
  perform public.activate_due_scheduled_bookings(target_tenant_id);
  return jsonb_build_object(
    'timeZone', (select default_time_zone from public.tenant_configurations where tenant_id = target_tenant_id),
    'settings', (select jsonb_build_object(
      'minimumNoticeMinutes', minimum_notice_minutes,
      'maximumAdvanceDays', maximum_advance_days,
      'dispatchLeadMinutes', dispatch_lead_minutes,
      'reminderLeadHours', reminder_lead_hours
    ) from public.tenant_scheduling_settings where tenant_id = target_tenant_id),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object(
      'bookingId', booking_id, 'scheduledPickupAt', scheduled_pickup_at,
      'dispatchReadyAt', dispatch_ready_at
    )) from public.dispatch_bookings where rider_profile_id = rider_id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_my_rider_scheduled_booking(
  target_tenant_slug text, target_service_area_id uuid, pickup_address_value text,
  destination_address_value text, scheduled_pickup_at_value timestamptz,
  booking_notes_value text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_tenant_id uuid; rider public.rider_profiles; settings public.tenant_scheduling_settings; new_id uuid;
begin
  select config.tenant_id into target_tenant_id
  from public.tenant_configurations config join public.tenants tenant using (tenant_id)
  where config.tenant_slug = lower(btrim(target_tenant_slug)) and tenant.status = 'active';
  select * into rider from public.rider_profiles
  where rider_profile_id = public.current_rider_profile_id(target_tenant_id) for update;
  select * into settings from public.tenant_scheduling_settings where tenant_id = target_tenant_id;
  if rider.rider_profile_id is null then raise exception 'active rider profile is required'; end if;
  if nullif(btrim(pickup_address_value), '') is null or nullif(btrim(destination_address_value), '') is null then
    raise exception 'pickup and destination are required';
  end if;
  if scheduled_pickup_at_value < now() + make_interval(mins => settings.minimum_notice_minutes) then
    raise exception 'scheduled pickup does not meet the minimum notice period';
  end if;
  if scheduled_pickup_at_value > now() + make_interval(days => settings.maximum_advance_days) then
    raise exception 'scheduled pickup exceeds the maximum advance window';
  end if;
  if not exists (select 1 from public.service_areas where tenant_id = target_tenant_id and service_area_id = target_service_area_id and status = 'active') then
    raise exception 'active service area is required';
  end if;
  insert into public.dispatch_bookings (
    tenant_id, service_area_id, rider_profile_id, customer_name, customer_phone,
    pickup_address, destination_address, booking_notes, created_by_person_id,
    status, scheduled_pickup_at, dispatch_ready_at
  ) values (
    target_tenant_id, target_service_area_id, rider.rider_profile_id, rider.display_name, rider.phone,
    btrim(pickup_address_value), btrim(destination_address_value), nullif(btrim(booking_notes_value), ''),
    rider.person_id, 'scheduled', scheduled_pickup_at_value,
    scheduled_pickup_at_value - make_interval(mins => settings.dispatch_lead_minutes)
  ) returning booking_id into new_id;
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    target_tenant_id, 'rider.booking_scheduled', 'person', rider.person_id, '{}',
    'Verified rider scheduled a future trip.', gen_random_uuid(), 'dispatch_booking', new_id::text,
    jsonb_build_object('scheduled_pickup_at', scheduled_pickup_at_value)
  );
  return new_id;
end;
$$;

create or replace function public.activate_due_scheduled_bookings(target_tenant_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare activated_count integer;
begin
  if not (auth.role() = 'service_role' or public.can_manage_dispatch(target_tenant_id)
    or public.current_rider_profile_id(target_tenant_id) is not null
    or exists (select 1 from public.driver_profiles where tenant_id = target_tenant_id and driver_profile_id = public.current_driver_profile_id())) then
    raise exception 'dispatch access is required';
  end if;
  update public.dispatch_bookings set status = 'requested'
  where tenant_id = target_tenant_id and status = 'scheduled' and dispatch_ready_at <= now();
  get diagnostics activated_count = row_count;
  return activated_count;
end;
$$;

alter table public.notification_outbox drop constraint notification_outbox_type_check;
alter table public.notification_outbox add constraint notification_outbox_type_check check (
  notification_type in (
    'driver_account_ready', 'driver_evidence_approved', 'driver_evidence_rejected',
    'driver_evidence_expiring_30d', 'driver_evidence_expiring_7d', 'driver_evidence_expired',
    'driver_activated', 'vehicle_evidence_approved', 'vehicle_evidence_rejected',
    'vehicle_evidence_expiring_30d', 'vehicle_evidence_expiring_7d', 'vehicle_evidence_expired',
    'dispatch_offer_created', 'rider_booking_created', 'rider_dispatch_searching',
    'rider_driver_accepted', 'rider_driver_arrived', 'rider_trip_started',
    'rider_trip_completed', 'rider_booking_cancelled', 'rider_booking_scheduled',
    'rider_scheduled_reminder', 'rider_scheduled_dispatch_started'
  )
);

create or replace function public.queue_scheduled_rider_reminders(target_date timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare inserted_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service role is required'; end if;
  insert into public.notification_outbox (
    tenant_id, rider_profile_id, person_id, notification_type, recipient_email, payload, dedupe_key
  )
  select booking.tenant_id, rider.rider_profile_id, rider.person_id, 'rider_scheduled_reminder', rider.email,
    jsonb_build_object('rider_name', rider.display_name, 'booking_id', booking.booking_id,
      'tenant_slug', config.tenant_slug, 'pickup_address', booking.pickup_address,
      'destination_address', booking.destination_address, 'scheduled_pickup_at', booking.scheduled_pickup_at,
      'tenant_time_zone', config.default_time_zone),
    'rider_booking:' || booking.booking_id::text || ':scheduled_reminder'
  from public.dispatch_bookings booking
  join public.rider_profiles rider on rider.rider_profile_id = booking.rider_profile_id
  join public.tenant_configurations config on config.tenant_id = booking.tenant_id
  join public.tenant_scheduling_settings settings on settings.tenant_id = booking.tenant_id
  left join public.rider_notification_preferences preference on preference.rider_profile_id = rider.rider_profile_id
  where booking.status = 'scheduled' and coalesce(preference.trip_updates_enabled, true)
    and booking.scheduled_pickup_at <= target_date + make_interval(hours => settings.reminder_lead_hours)
    and booking.scheduled_pickup_at > target_date
  on conflict (dedupe_key) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

-- Replace lifecycle trigger mapping so scheduled creation and activation receive distinct messages.
create or replace function public.queue_rider_booking_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare rider public.rider_profiles; event_type text; event_key text;
begin
  if new.rider_profile_id is null then return new; end if;
  if tg_op = 'INSERT' then
    event_type := case when new.status = 'scheduled' then 'rider_booking_scheduled' else 'rider_booking_created' end;
    event_key := case when new.status = 'scheduled' then 'scheduled' else 'created' end;
  elsif new.status is not distinct from old.status then return new;
  else
    event_type := case
      when new.status = 'requested' and old.status = 'scheduled' then 'rider_scheduled_dispatch_started'
      when new.status = 'requested' and old.status = 'offered' then 'rider_dispatch_searching'
      when new.status = 'accepted' then 'rider_driver_accepted'
      when new.status = 'arrived' then 'rider_driver_arrived'
      when new.status = 'in_progress' then 'rider_trip_started'
      when new.status = 'completed' then 'rider_trip_completed'
      when new.status = 'cancelled' then 'rider_booking_cancelled' else null end;
    event_key := case when event_type = 'rider_dispatch_searching' then 'searching:' || new.updated_at::text else new.status end;
  end if;
  if event_type is null then return new; end if;
  select * into rider from public.rider_profiles where rider_profile_id = new.rider_profile_id;
  if not coalesce((select trip_updates_enabled from public.rider_notification_preferences where rider_profile_id = rider.rider_profile_id), true) then return new; end if;
  insert into public.notification_outbox (tenant_id, rider_profile_id, person_id, notification_type, recipient_email, payload, dedupe_key)
  values (new.tenant_id, rider.rider_profile_id, rider.person_id, event_type, rider.email,
    jsonb_strip_nulls(jsonb_build_object('rider_name', rider.display_name, 'booking_id', new.booking_id,
      'tenant_slug', (select tenant_slug from public.tenant_configurations where tenant_id = new.tenant_id),
      'pickup_address', new.pickup_address, 'destination_address', new.destination_address,
      'scheduled_pickup_at', new.scheduled_pickup_at,
      'tenant_time_zone', (select default_time_zone from public.tenant_configurations where tenant_id = new.tenant_id),
      'driver_name', (select display_name from public.driver_profiles where driver_profile_id = new.current_driver_profile_id),
      'driver_number', (select driver_number from public.driver_profiles where driver_profile_id = new.current_driver_profile_id),
      'vehicle_description', (select concat_ws(' ', color, model_year::text, make, model) || ' · ' || license_plate from public.vehicles where vehicle_id = new.current_vehicle_id))),
    'rider_booking:' || new.booking_id::text || ':' || event_key)
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

revoke all on function public.seed_tenant_scheduling_settings() from public, anon, authenticated;
revoke all on function public.set_tenant_scheduling_settings(uuid, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.my_rider_scheduling(text) from public, anon, authenticated;
revoke all on function public.create_my_rider_scheduled_booking(text, uuid, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.activate_due_scheduled_bookings(uuid) from public, anon, authenticated;
revoke all on function public.queue_scheduled_rider_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.set_tenant_scheduling_settings(uuid, integer, integer, integer, integer) to authenticated;
grant execute on function public.my_rider_scheduling(text) to authenticated;
grant execute on function public.create_my_rider_scheduled_booking(text, uuid, text, text, timestamptz, text) to authenticated;
grant execute on function public.activate_due_scheduled_bookings(uuid) to authenticated, service_role;
grant execute on function public.queue_scheduled_rider_reminders(timestamptz) to service_role;

-- Database-native activation keeps scheduled dispatch independent of an open browser.
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.activate_all_due_scheduled_bookings()
returns integer language plpgsql security definer set search_path = public as $$
declare activated_count integer;
begin
  update public.dispatch_bookings set status = 'requested'
  where status = 'scheduled' and dispatch_ready_at <= now();
  get diagnostics activated_count = row_count;
  return activated_count;
end;
$$;
revoke all on function public.activate_all_due_scheduled_bookings()
  from public, anon, authenticated, service_role;

select cron.unschedule(jobid)
from cron.job where jobname = 'activate-due-scheduled-bookings';
select cron.schedule(
  'activate-due-scheduled-bookings',
  '* * * * *',
  'select public.activate_all_due_scheduled_bookings()'
);
