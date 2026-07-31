-- Rider trip lifecycle notifications on the shared durable email outbox.

alter table public.notification_outbox
  add column rider_profile_id uuid,
  add constraint notification_outbox_rider_fk
    foreign key (tenant_id, rider_profile_id)
    references public.rider_profiles (tenant_id, rider_profile_id) on delete cascade;

create index notification_outbox_rider_created_idx
  on public.notification_outbox (rider_profile_id, created_at desc)
  where rider_profile_id is not null;

alter table public.notification_outbox
  drop constraint notification_outbox_type_check;
alter table public.notification_outbox
  add constraint notification_outbox_type_check check (
    notification_type in (
      'driver_account_ready', 'driver_evidence_approved', 'driver_evidence_rejected',
      'driver_evidence_expiring_30d', 'driver_evidence_expiring_7d', 'driver_evidence_expired',
      'driver_activated', 'vehicle_evidence_approved', 'vehicle_evidence_rejected',
      'vehicle_evidence_expiring_30d', 'vehicle_evidence_expiring_7d',
      'vehicle_evidence_expired', 'dispatch_offer_created',
      'rider_booking_created', 'rider_dispatch_searching', 'rider_driver_accepted',
      'rider_driver_arrived', 'rider_trip_started', 'rider_trip_completed',
      'rider_booking_cancelled'
    )
  );

create table public.rider_notification_preferences (
  rider_profile_id uuid primary key references public.rider_profiles (rider_profile_id) on delete cascade,
  tenant_id uuid not null references public.tenants (tenant_id) on delete cascade,
  trip_updates_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rider_notification_preferences_tenant_rider_unique
    unique (tenant_id, rider_profile_id),
  constraint rider_notification_preferences_rider_fk
    foreign key (tenant_id, rider_profile_id)
    references public.rider_profiles (tenant_id, rider_profile_id) on delete cascade
);

create trigger rider_notification_preferences_set_updated_at
  before update on public.rider_notification_preferences
  for each row execute function public.set_updated_at();

alter table public.rider_notification_preferences enable row level security;

create policy rider_notification_preferences_self_select
  on public.rider_notification_preferences for select to authenticated
  using (rider_profile_id = public.current_rider_profile_id(tenant_id));
create policy rider_notification_preferences_manager_select
  on public.rider_notification_preferences for select to authenticated
  using (public.can_manage_dispatch(tenant_id));

grant select on public.rider_notification_preferences to authenticated;
grant all on public.rider_notification_preferences to service_role;

insert into public.rider_notification_preferences (rider_profile_id, tenant_id)
select rider_profile_id, tenant_id from public.rider_profiles
on conflict (rider_profile_id) do nothing;

create or replace function public.seed_rider_notification_preferences()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.rider_notification_preferences (rider_profile_id, tenant_id)
  values (new.rider_profile_id, new.tenant_id)
  on conflict (rider_profile_id) do nothing;
  return new;
end;
$$;

create trigger rider_profiles_seed_notification_preferences
  after insert on public.rider_profiles
  for each row execute function public.seed_rider_notification_preferences();

create or replace function public.my_rider_notification_preferences(target_tenant_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  target_tenant_id uuid;
  target_rider_profile_id uuid;
begin
  select config.tenant_id into target_tenant_id
  from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  where config.tenant_slug = lower(btrim(target_tenant_slug))
    and tenant.status = 'active';
  if target_tenant_id is null then raise exception 'booking tenant is unavailable'; end if;

  target_rider_profile_id := public.current_rider_profile_id(target_tenant_id);
  if target_rider_profile_id is null then raise exception 'active rider profile is required'; end if;

  return jsonb_build_object(
    'tripUpdatesEnabled',
    coalesce((
      select preference.trip_updates_enabled
      from public.rider_notification_preferences preference
      where preference.rider_profile_id = target_rider_profile_id
    ), true)
  );
end;
$$;

create or replace function public.set_my_rider_notification_preferences(
  target_tenant_slug text,
  trip_updates_enabled_value boolean
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  target_tenant_id uuid;
  target_rider_profile_id uuid;
begin
  select config.tenant_id into target_tenant_id
  from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  where config.tenant_slug = lower(btrim(target_tenant_slug))
    and tenant.status = 'active';
  if target_tenant_id is null then raise exception 'booking tenant is unavailable'; end if;

  target_rider_profile_id := public.current_rider_profile_id(target_tenant_id);
  if target_rider_profile_id is null then raise exception 'active rider profile is required'; end if;

  insert into public.rider_notification_preferences (
    rider_profile_id, tenant_id, trip_updates_enabled
  ) values (
    target_rider_profile_id, target_tenant_id, trip_updates_enabled_value
  )
  on conflict (rider_profile_id) do update
  set trip_updates_enabled = excluded.trip_updates_enabled;

  if not trip_updates_enabled_value then
    update public.notification_outbox set
      delivery_status = 'canceled',
      delivery_error = 'Rider disabled trip update emails.'
    where rider_profile_id = target_rider_profile_id
      and notification_type like 'rider_%'
      and delivery_status in ('queued', 'failed');
  end if;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  )
  select
    target_tenant_id, 'rider.notification_preferences_updated', 'person',
    rider.person_id, '{}', 'Rider updated trip email preferences.',
    gen_random_uuid(), 'rider_profile', target_rider_profile_id::text,
    jsonb_build_object('trip_updates_enabled', trip_updates_enabled_value)
  from public.rider_profiles rider
  where rider.rider_profile_id = target_rider_profile_id;

  return trip_updates_enabled_value;
end;
$$;

create or replace function public.queue_rider_booking_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rider public.rider_profiles;
  area_name text;
  driver_name text;
  driver_number text;
  vehicle_description text;
  event_type text;
  event_key text;
begin
  if new.rider_profile_id is null then return new; end if;
  if tg_op = 'INSERT' then
    event_type := 'rider_booking_created';
    event_key := 'created';
  elsif new.status is not distinct from old.status then
    return new;
  else
    event_type := case
      when new.status = 'requested' and old.status = 'offered' then 'rider_dispatch_searching'
      when new.status = 'accepted' then 'rider_driver_accepted'
      when new.status = 'arrived' then 'rider_driver_arrived'
      when new.status = 'in_progress' then 'rider_trip_started'
      when new.status = 'completed' then 'rider_trip_completed'
      when new.status = 'cancelled' then 'rider_booking_cancelled'
      else null
    end;
    event_key := case
      when event_type = 'rider_dispatch_searching' then
        'searching:' || coalesce(new.updated_at::text, now()::text)
      else new.status
    end;
  end if;
  if event_type is null then return new; end if;

  select * into rider from public.rider_profiles
  where rider_profile_id = new.rider_profile_id;
  if rider.rider_profile_id is null or rider.email = '' then return new; end if;
  if not coalesce((
    select preference.trip_updates_enabled
    from public.rider_notification_preferences preference
    where preference.rider_profile_id = rider.rider_profile_id
  ), true) then return new; end if;

  select name into area_name from public.service_areas
  where service_area_id = new.service_area_id;
  select driver.display_name, driver.driver_number
  into driver_name, driver_number
  from public.driver_profiles driver
  where driver.driver_profile_id = new.current_driver_profile_id;
  select concat_ws(' ', vehicle.color, vehicle.model_year::text, vehicle.make, vehicle.model)
    || case when vehicle.license_plate is not null then ' · ' || vehicle.license_plate else '' end
  into vehicle_description
  from public.vehicles vehicle where vehicle.vehicle_id = new.current_vehicle_id;

  insert into public.notification_outbox (
    tenant_id, rider_profile_id, person_id, notification_type,
    recipient_email, payload, dedupe_key
  ) values (
    new.tenant_id, rider.rider_profile_id, rider.person_id, event_type, rider.email,
    jsonb_strip_nulls(jsonb_build_object(
      'rider_name', rider.display_name,
      'booking_id', new.booking_id,
      'tenant_slug', (
        select config.tenant_slug from public.tenant_configurations config
        where config.tenant_id = new.tenant_id
      ),
      'service_area_name', area_name,
      'pickup_address', new.pickup_address,
      'destination_address', new.destination_address,
      'booking_status', new.status,
      'driver_name', driver_name,
      'driver_number', driver_number,
      'vehicle_description', vehicle_description
    )),
    'rider_booking:' || new.booking_id::text || ':' || event_key
  ) on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

create trigger dispatch_bookings_queue_rider_notification
  after insert or update of status on public.dispatch_bookings
  for each row execute function public.queue_rider_booking_notification();

revoke all on function public.seed_rider_notification_preferences()
  from public, anon, authenticated;
revoke all on function public.queue_rider_booking_notification()
  from public, anon, authenticated;
revoke all on function public.my_rider_notification_preferences(text)
  from public, anon, authenticated;
revoke all on function public.set_my_rider_notification_preferences(text, boolean)
  from public, anon, authenticated;
grant execute on function public.my_rider_notification_preferences(text) to authenticated;
grant execute on function public.set_my_rider_notification_preferences(text, boolean)
  to authenticated;
