-- Explainable automatic matching with sequential offers and manual fallback.

alter table public.dispatch_offers alter column offered_by_person_id drop not null;
alter table public.dispatch_offers add column offer_source text not null default 'manual';
alter table public.dispatch_offers add constraint dispatch_offers_source_check
  check (offer_source in ('manual', 'automatic'));

create table public.tenant_matching_settings (
  tenant_id uuid primary key references public.tenants (tenant_id) on delete cascade,
  automatic_matching_enabled boolean not null default false,
  offer_duration_seconds integer not null default 90,
  maximum_attempts integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_matching_offer_duration_check check (offer_duration_seconds between 30 and 300),
  constraint tenant_matching_attempts_check check (maximum_attempts between 1 and 10)
);

create trigger tenant_matching_settings_set_updated_at before update on public.tenant_matching_settings
  for each row execute function public.set_updated_at();
insert into public.tenant_matching_settings (tenant_id)
select tenant_id from public.tenants on conflict (tenant_id) do nothing;

create or replace function public.seed_tenant_matching_settings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tenant_matching_settings (tenant_id) values (new.tenant_id)
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;
create trigger tenants_seed_matching_settings after insert on public.tenants
  for each row execute function public.seed_tenant_matching_settings();

alter table public.tenant_matching_settings enable row level security;
create policy tenant_matching_settings_manager_select on public.tenant_matching_settings
  for select to authenticated using (public.can_manage_dispatch(tenant_id));
grant select on public.tenant_matching_settings to authenticated;
grant all on public.tenant_matching_settings to service_role;

create or replace function public.set_tenant_matching_settings(
  target_tenant_id uuid,
  automatic_matching_enabled_value boolean,
  offer_duration_seconds_value integer,
  maximum_attempts_value integer
)
returns boolean language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id();
begin
  if actor_id is null or not public.can_manage_dispatch(target_tenant_id) then
    raise exception 'dispatch management permission is required';
  end if;
  insert into public.tenant_matching_settings (
    tenant_id, automatic_matching_enabled, offer_duration_seconds, maximum_attempts
  ) values (
    target_tenant_id, automatic_matching_enabled_value, offer_duration_seconds_value, maximum_attempts_value
  ) on conflict (tenant_id) do update set
    automatic_matching_enabled = excluded.automatic_matching_enabled,
    offer_duration_seconds = excluded.offer_duration_seconds,
    maximum_attempts = excluded.maximum_attempts;
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    target_tenant_id, 'dispatch.matching_settings_updated', 'person', actor_id, '{}',
    'Automatic matching settings were updated.', gen_random_uuid(), 'tenant_matching_settings',
    target_tenant_id::text, jsonb_build_object(
      'automatic_matching_enabled', automatic_matching_enabled_value,
      'offer_duration_seconds', offer_duration_seconds_value,
      'maximum_attempts', maximum_attempts_value
    )
  );
  return true;
end;
$$;

create or replace function public.match_dispatch_booking(target_booking_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  booking public.dispatch_bookings;
  settings public.tenant_matching_settings;
  selected_driver_id uuid;
  selected_vehicle_id uuid;
  new_offer_id uuid;
  attempt_count integer;
begin
  select * into booking from public.dispatch_bookings where booking_id = target_booking_id for update;
  if booking.booking_id is null or booking.status <> 'requested' then return null; end if;
  select * into settings from public.tenant_matching_settings where tenant_id = booking.tenant_id;
  if not coalesce(settings.automatic_matching_enabled, false) then return null; end if;
  select count(*) into attempt_count from public.dispatch_offers
  where booking_id = target_booking_id and offer_source = 'automatic';
  if attempt_count >= settings.maximum_attempts then
    insert into public.tenant_audit_events (
      tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
      correlation_id, resource_type, resource_id, metadata
    ) values (
      booking.tenant_id, 'dispatch.automatic_matching_exhausted', 'platform_system', null, '{}',
      'Automatic matching reached the configured attempt limit.', gen_random_uuid(),
      'dispatch_booking', booking.booking_id::text, jsonb_build_object('attempts', attempt_count)
    );
    return null;
  end if;

  select driver.driver_profile_id, assignment.vehicle_id
  into selected_driver_id, selected_vehicle_id
  from public.driver_profiles driver
  join public.driver_availability availability
    on availability.driver_profile_id = driver.driver_profile_id
  join public.driver_vehicle_assignments assignment
    on assignment.driver_profile_id = driver.driver_profile_id and assignment.ended_at is null
  where driver.tenant_id = booking.tenant_id
    and driver.status = 'active'
    and availability.requested_status = 'online'
    and availability.selected_service_area_id = booking.service_area_id
    and cardinality(public.driver_service_blockers(driver.driver_profile_id)) = 0
    and not exists (
      select 1 from public.dispatch_bookings active_trip
      where active_trip.current_driver_profile_id = driver.driver_profile_id
        and active_trip.status in ('accepted', 'arrived', 'in_progress')
    )
    and not exists (
      select 1 from public.dispatch_offers attempted
      where attempted.booking_id = booking.booking_id
        and attempted.driver_profile_id = driver.driver_profile_id
    )
  order by greatest(
    (select max(completed.completed_at) from public.dispatch_bookings completed
      where completed.current_driver_profile_id = driver.driver_profile_id),
    (select max(accepted.responded_at) from public.dispatch_offers accepted
      where accepted.driver_profile_id = driver.driver_profile_id
        and accepted.status = 'accepted')
  ) asc nulls first, driver.driver_number asc
  limit 1;

  if selected_driver_id is null then
    insert into public.tenant_audit_events (
      tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
      correlation_id, resource_type, resource_id, metadata
    ) values (
      booking.tenant_id, 'dispatch.automatic_matching_no_candidate', 'platform_system', null, '{}',
      'No eligible untried online Driver was available; booking remains for manual dispatch.',
      gen_random_uuid(), 'dispatch_booking', booking.booking_id::text,
      jsonb_build_object('attempts', attempt_count)
    );
    return null;
  end if;

  insert into public.dispatch_offers (
    tenant_id, booking_id, driver_profile_id, vehicle_id, offered_by_person_id,
    offer_source, expires_at
  ) values (
    booking.tenant_id, booking.booking_id, selected_driver_id, selected_vehicle_id, null,
    'automatic', now() + make_interval(secs => settings.offer_duration_seconds)
  ) returning offer_id into new_offer_id;
  update public.dispatch_bookings set status = 'offered' where booking_id = booking.booking_id;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    booking.tenant_id, 'dispatch.automatic_offer_created', 'platform_system', null, '{}',
    'Automatic matching offered the booking to the highest-ranked eligible Driver.',
    gen_random_uuid(), 'dispatch_offer', new_offer_id::text,
    jsonb_build_object('booking_id', booking.booking_id, 'driver_profile_id', selected_driver_id,
      'attempt_number', attempt_count + 1)
  );
  return new_offer_id;
end;
$$;

create or replace function public.trigger_automatic_matching()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'requested' then
    perform public.match_dispatch_booking(new.booking_id);
  elsif tg_op = 'UPDATE' and new.status = 'requested' and old.status is distinct from 'requested' then
    perform public.match_dispatch_booking(new.booking_id);
  end if;
  return new;
end;
$$;
create trigger dispatch_bookings_automatic_matching
  after insert or update of status on public.dispatch_bookings
  for each row execute function public.trigger_automatic_matching();

-- Enabling automation immediately considers existing requested bookings.
create or replace function public.start_tenant_automatic_matching(target_tenant_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare booking record; matched integer := 0;
begin
  if not public.can_manage_dispatch(target_tenant_id) then raise exception 'dispatch management permission is required'; end if;
  for booking in select booking_id from public.dispatch_bookings
    where tenant_id = target_tenant_id and status = 'requested' order by created_at
  loop
    if public.match_dispatch_booking(booking.booking_id) is not null then matched := matched + 1; end if;
  end loop;
  return matched;
end;
$$;

revoke all on function public.seed_tenant_matching_settings() from public, anon, authenticated;
revoke all on function public.match_dispatch_booking(uuid) from public, anon, authenticated, service_role;
revoke all on function public.trigger_automatic_matching() from public, anon, authenticated;
revoke all on function public.set_tenant_matching_settings(uuid, boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.start_tenant_automatic_matching(uuid) from public, anon, authenticated;
grant execute on function public.set_tenant_matching_settings(uuid, boolean, integer, integer) to authenticated;
grant execute on function public.start_tenant_automatic_matching(uuid) to authenticated;

-- Advance expired offers even when no Admin or Driver browser is open. Updating the booking back
-- to requested invokes the matching trigger and tries the next eligible Driver.
create or replace function public.process_expired_dispatch_offers()
returns integer language plpgsql security definer set search_path = public as $$
declare
  expired_offer record;
  expired_count integer := 0;
begin
  for expired_offer in
    update public.dispatch_offers offer
    set status = 'expired', responded_at = now(), response_notes = 'Offer expired.'
    where offer.status = 'pending' and offer.expires_at <= now()
    returning offer.offer_id, offer.tenant_id, offer.booking_id, offer.driver_profile_id
  loop
    update public.dispatch_bookings booking
    set status = 'requested'
    where booking.booking_id = expired_offer.booking_id
      and booking.status = 'offered'
      and not exists (
        select 1 from public.dispatch_offers pending
        where pending.booking_id = expired_offer.booking_id and pending.status = 'pending'
      );
    insert into public.tenant_audit_events (
      tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
      correlation_id, resource_type, resource_id, metadata
    ) values (
      expired_offer.tenant_id, 'dispatch.offer_expired', 'platform_system', null, '{}',
      'Dispatch offer expired before driver acceptance.', gen_random_uuid(),
      'dispatch_offer', expired_offer.offer_id::text,
      jsonb_build_object('booking_id', expired_offer.booking_id,
        'driver_profile_id', expired_offer.driver_profile_id)
    );
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end;
$$;
revoke all on function public.process_expired_dispatch_offers()
  from public, anon, authenticated, service_role;

create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid)
from cron.job where jobname = 'process-expired-dispatch-offers';
select cron.schedule(
  'process-expired-dispatch-offers',
  '* * * * *',
  'select public.process_expired_dispatch_offers()'
);
