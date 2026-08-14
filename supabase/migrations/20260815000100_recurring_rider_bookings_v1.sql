-- Recurring Rider schedule templates with individually priced and paid occurrences.

create table public.rider_booking_series (
  rider_booking_series_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  rider_profile_id uuid not null,
  service_area_id uuid not null,
  pickup_address text not null,
  destination_address text not null,
  pickup_latitude double precision not null,
  pickup_longitude double precision not null,
  destination_latitude double precision not null,
  destination_longitude double precision not null,
  time_zone text not null,
  local_pickup_time time not null,
  weekdays smallint[] not null,
  start_date date not null,
  end_date date not null,
  booking_notes text,
  status text not null default 'active',
  created_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint rider_booking_series_rider_fk foreign key (tenant_id, rider_profile_id)
    references public.rider_profiles (tenant_id, rider_profile_id) on delete restrict,
  constraint rider_booking_series_area_fk foreign key (tenant_id, service_area_id)
    references public.service_areas (tenant_id, service_area_id) on delete restrict,
  constraint rider_booking_series_status_check check (status in ('active', 'completed', 'cancelled')),
  constraint rider_booking_series_date_check check (end_date >= start_date),
  constraint rider_booking_series_tenant_series_unique unique (tenant_id, rider_booking_series_id),
  constraint rider_booking_series_weekdays_check check (
    cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
  )
);

create table public.rider_booking_series_occurrences (
  rider_booking_series_occurrence_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  rider_booking_series_id uuid not null,
  rider_profile_id uuid not null,
  scheduled_pickup_at timestamptz not null,
  status text not null default 'awaiting_payment',
  quote_id uuid,
  booking_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint rider_series_occurrence_series_fk foreign key (tenant_id, rider_booking_series_id)
    references public.rider_booking_series (tenant_id, rider_booking_series_id) on delete restrict,
  constraint rider_series_occurrence_rider_fk foreign key (tenant_id, rider_profile_id)
    references public.rider_profiles (tenant_id, rider_profile_id) on delete restrict,
  constraint rider_series_occurrence_quote_fk foreign key (tenant_id, quote_id)
    references public.trip_price_quotes (tenant_id, quote_id) on delete restrict,
  constraint rider_series_occurrence_booking_fk foreign key (tenant_id, booking_id)
    references public.dispatch_bookings (tenant_id, booking_id) on delete restrict,
  constraint rider_series_occurrence_status_check check (status in ('awaiting_payment', 'payment_pending', 'booked', 'cancelled')),
  constraint rider_series_occurrence_unique unique (rider_booking_series_id, scheduled_pickup_at),
  constraint rider_series_occurrence_booking_unique unique (booking_id)
);

create index rider_booking_series_rider_idx on public.rider_booking_series (tenant_id, rider_profile_id, created_at desc);
create index rider_series_occurrences_due_idx on public.rider_booking_series_occurrences
  (tenant_id, rider_profile_id, scheduled_pickup_at) where status in ('awaiting_payment', 'payment_pending');

alter table public.rider_booking_series enable row level security;
alter table public.rider_booking_series_occurrences enable row level security;
create policy rider_booking_series_rider_select on public.rider_booking_series for select to authenticated
  using (rider_profile_id = public.current_rider_profile_id(tenant_id));
create policy rider_booking_series_manager_select on public.rider_booking_series for select to authenticated
  using (public.can_manage_dispatch(tenant_id));
create policy rider_series_occurrences_rider_select on public.rider_booking_series_occurrences for select to authenticated
  using (rider_profile_id = public.current_rider_profile_id(tenant_id));
create policy rider_series_occurrences_manager_select on public.rider_booking_series_occurrences for select to authenticated
  using (public.can_manage_dispatch(tenant_id));
grant select on public.rider_booking_series, public.rider_booking_series_occurrences to authenticated;
grant all on public.rider_booking_series, public.rider_booking_series_occurrences to service_role;

create or replace function public.create_my_rider_booking_series(
  target_quote_id uuid, start_date_value date, end_date_value date,
  local_pickup_time_value time, weekdays_value smallint[], scheduled_pickup_at_values timestamptz[],
  booking_notes_value text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare quote public.trip_price_quotes; rider_id uuid; rider_person_id uuid; settings public.tenant_scheduling_settings;
  zone_value text; series_id uuid; occurrence_value timestamptz; occurrence_count integer;
begin
  select * into quote from public.trip_price_quotes where quote_id = target_quote_id for update;
  if quote.quote_id is null or quote.status <> 'quoted' or quote.expires_at <= now() then raise exception 'active verified route quote is required'; end if;
  rider_id := public.current_rider_profile_id(quote.tenant_id);
  if rider_id is null or rider_id <> quote.rider_profile_id then raise exception 'Rider quote access is required'; end if;
  select person_id into rider_person_id from public.rider_profiles where rider_profile_id = rider_id for update;
  select * into settings from public.tenant_scheduling_settings where tenant_id = quote.tenant_id;
  select default_time_zone into zone_value from public.tenant_configurations where tenant_id = quote.tenant_id;
  occurrence_count := coalesce(cardinality(scheduled_pickup_at_values), 0);
  if occurrence_count not between 2 and 50 then raise exception 'recurring schedule must contain between 2 and 50 trips'; end if;
  if end_date_value < start_date_value then raise exception 'recurring end date must be on or after start date'; end if;
  if cardinality(weekdays_value) not between 1 and 7 or not (weekdays_value <@ array[1,2,3,4,5,6,7]::smallint[])
    then raise exception 'choose at least one valid weekday'; end if;
  if (select count(distinct value) from unnest(scheduled_pickup_at_values) value) <> occurrence_count
    then raise exception 'recurring trips must be unique'; end if;
  foreach occurrence_value in array scheduled_pickup_at_values loop
    if occurrence_value < now() + make_interval(mins => settings.minimum_notice_minutes)
      then raise exception 'a recurring trip does not meet the minimum notice period'; end if;
    if occurrence_value > now() + make_interval(days => settings.maximum_advance_days)
      then raise exception 'a recurring trip exceeds the maximum advance window'; end if;
    if (occurrence_value at time zone zone_value)::date not between start_date_value and end_date_value
      then raise exception 'a recurring trip falls outside the series dates'; end if;
    if extract(isodow from occurrence_value at time zone zone_value)::smallint <> all(weekdays_value)
      then raise exception 'a recurring trip does not match the selected weekdays'; end if;
    if (occurrence_value at time zone zone_value)::time(0) <> local_pickup_time_value::time(0)
      then raise exception 'a recurring trip does not match the selected pickup time'; end if;
  end loop;
  insert into public.rider_booking_series (tenant_id, rider_profile_id, service_area_id,
    pickup_address, destination_address, pickup_latitude, pickup_longitude,
    destination_latitude, destination_longitude, time_zone, local_pickup_time, weekdays,
    start_date, end_date, booking_notes, created_by_person_id)
  values (quote.tenant_id, rider_id, quote.service_area_id, quote.pickup_address, quote.destination_address,
    quote.pickup_latitude, quote.pickup_longitude, quote.destination_latitude, quote.destination_longitude,
    zone_value, local_pickup_time_value, (select array_agg(distinct day order by day) from unnest(weekdays_value) day),
    start_date_value, end_date_value, nullif(btrim(booking_notes_value), ''), rider_person_id)
  returning rider_booking_series_id into series_id;
  insert into public.rider_booking_series_occurrences
    (tenant_id, rider_booking_series_id, rider_profile_id, scheduled_pickup_at)
  select quote.tenant_id, series_id, rider_id, value from unnest(scheduled_pickup_at_values) value order by value;
  update public.trip_price_quotes set status = 'expired' where quote_id = quote.quote_id;
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_person_id,
    actor_platform_roles, reason, correlation_id, resource_type, resource_id, metadata)
  values (quote.tenant_id, 'rider.booking_series_created', 'person', rider_person_id, '{}',
    'Verified Rider created a recurring trip schedule.', gen_random_uuid(), 'rider_booking_series',
    series_id::text, jsonb_build_object('occurrence_count', occurrence_count,
      'start_date', start_date_value, 'end_date', end_date_value, 'weekdays', weekdays_value));
  return series_id;
end;
$$;

create or replace function public.my_rider_booking_series(target_tenant_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare target_tenant_id uuid; rider_id uuid;
begin
  select tenant_id into target_tenant_id from public.tenant_configurations where tenant_slug = lower(btrim(target_tenant_slug));
  rider_id := public.current_rider_profile_id(target_tenant_id);
  if rider_id is null then raise exception 'Rider access is required'; end if;
  return jsonb_build_object(
    'series', coalesce((select jsonb_agg(jsonb_build_object('seriesId', series.rider_booking_series_id,
      'serviceAreaId', series.service_area_id, 'pickupAddress', series.pickup_address,
      'destinationAddress', series.destination_address, 'timeZone', series.time_zone,
      'localPickupTime', series.local_pickup_time, 'weekdays', series.weekdays,
      'startDate', series.start_date, 'endDate', series.end_date, 'status', series.status,
      'createdAt', series.created_at) order by series.created_at desc)
      from public.rider_booking_series series where series.tenant_id = target_tenant_id
        and series.rider_profile_id = rider_id), '[]'::jsonb),
    'occurrences', coalesce((select jsonb_agg(jsonb_build_object(
      'occurrenceId', occurrence.rider_booking_series_occurrence_id,
      'seriesId', occurrence.rider_booking_series_id,
      'scheduledPickupAt', occurrence.scheduled_pickup_at, 'status', occurrence.status,
      'quoteId', occurrence.quote_id, 'bookingId', occurrence.booking_id) order by occurrence.scheduled_pickup_at)
      from public.rider_booking_series_occurrences occurrence where occurrence.tenant_id = target_tenant_id
        and occurrence.rider_profile_id = rider_id), '[]'::jsonb));
end;
$$;

create or replace function public.cancel_my_rider_series_occurrence(target_occurrence_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare occurrence public.rider_booking_series_occurrences; rider_id uuid; actor_id uuid;
begin
  select * into occurrence from public.rider_booking_series_occurrences
    where rider_booking_series_occurrence_id = target_occurrence_id for update;
  rider_id := public.current_rider_profile_id(occurrence.tenant_id);
  if occurrence.rider_booking_series_occurrence_id is null or rider_id is null or rider_id <> occurrence.rider_profile_id
    then raise exception 'Recurring trip access is required'; end if;
  if occurrence.status = 'booked' then raise exception 'Cancel the paid trip from My trips'; end if;
  if occurrence.status = 'payment_pending' then raise exception 'Payment checkout is active; finish it or wait for it to expire'; end if;
  if occurrence.status = 'cancelled' then return true; end if;
  update public.rider_booking_series_occurrences set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where rider_booking_series_occurrence_id = target_occurrence_id;
  if not exists (select 1 from public.rider_booking_series_occurrences
    where rider_booking_series_id = occurrence.rider_booking_series_id and status in ('awaiting_payment', 'payment_pending')) then
    update public.rider_booking_series set status = 'completed', updated_at = now()
      where rider_booking_series_id = occurrence.rider_booking_series_id and status = 'active';
  end if;
  select person_id into actor_id from public.rider_profiles where rider_profile_id = rider_id;
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_person_id,
    actor_platform_roles, reason, correlation_id, resource_type, resource_id, metadata)
  values (occurrence.tenant_id, 'rider.booking_series_occurrence_cancelled', 'person', actor_id, '{}',
    'Rider cancelled one unpaid recurring occurrence.', gen_random_uuid(),
    'rider_booking_series_occurrence', occurrence.rider_booking_series_occurrence_id::text,
    jsonb_build_object('scheduled_pickup_at', occurrence.scheduled_pickup_at));
  return true;
end;
$$;

create or replace function public.cancel_my_rider_booking_series(target_series_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare series public.rider_booking_series; rider_id uuid; actor_id uuid; cancelled_count integer;
begin
  select * into series from public.rider_booking_series where rider_booking_series_id = target_series_id for update;
  rider_id := public.current_rider_profile_id(series.tenant_id);
  if series.rider_booking_series_id is null or rider_id is null or rider_id <> series.rider_profile_id
    then raise exception 'Recurring schedule access is required'; end if;
  if series.status = 'cancelled' then return 0; end if;
  if exists (select 1 from public.rider_booking_series_occurrences
    where rider_booking_series_id = target_series_id and status = 'payment_pending') then
    raise exception 'Finish or wait for active occurrence payment checkout before cancelling the series';
  end if;
  update public.rider_booking_series set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where rider_booking_series_id = target_series_id;
  update public.rider_booking_series_occurrences set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where rider_booking_series_id = target_series_id and status = 'awaiting_payment';
  get diagnostics cancelled_count = row_count;
  select person_id into actor_id from public.rider_profiles where rider_profile_id = rider_id;
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_person_id,
    actor_platform_roles, reason, correlation_id, resource_type, resource_id, metadata)
  values (series.tenant_id, 'rider.booking_series_cancelled', 'person', actor_id, '{}',
    'Rider cancelled the remaining unpaid recurring schedule.', gen_random_uuid(),
    'rider_booking_series', series.rider_booking_series_id::text,
    jsonb_build_object('cancelled_occurrence_count', cancelled_count));
  return cancelled_count;
end;
$$;

create or replace function public.create_my_rider_recurring_booking(
  target_quote_id uuid, target_occurrence_id uuid, booking_notes_value text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare occurrence public.rider_booking_series_occurrences; series public.rider_booking_series;
  quote public.trip_price_quotes; rider_id uuid; new_booking_id uuid;
begin
  select * into occurrence from public.rider_booking_series_occurrences
    where rider_booking_series_occurrence_id = target_occurrence_id for update;
  if occurrence.rider_booking_series_occurrence_id is null or occurrence.status <> 'payment_pending'
    then raise exception 'recurring occurrence is unavailable'; end if;
  rider_id := public.current_rider_profile_id(occurrence.tenant_id);
  if rider_id is null or rider_id <> occurrence.rider_profile_id then raise exception 'Recurring trip access is required'; end if;
  select * into series from public.rider_booking_series where rider_booking_series_id = occurrence.rider_booking_series_id;
  select * into quote from public.trip_price_quotes where quote_id = target_quote_id;
  if occurrence.quote_id <> target_quote_id or series.status <> 'active'
    or quote.rider_profile_id <> rider_id or quote.service_area_id <> series.service_area_id
    or quote.pickup_address <> series.pickup_address or quote.destination_address <> series.destination_address
    then raise exception 'recurring trip quote does not match the series'; end if;
  new_booking_id := public.create_my_rider_priced_booking(target_quote_id,
    coalesce(booking_notes_value, series.booking_notes), occurrence.scheduled_pickup_at);
  update public.rider_booking_series_occurrences set status = 'booked', quote_id = target_quote_id,
    booking_id = new_booking_id, updated_at = now() where rider_booking_series_occurrence_id = target_occurrence_id;
  if not exists (select 1 from public.rider_booking_series_occurrences
    where rider_booking_series_id = series.rider_booking_series_id and status in ('awaiting_payment', 'payment_pending')) then
    update public.rider_booking_series set status = 'completed', updated_at = now()
      where rider_booking_series_id = series.rider_booking_series_id;
  end if;
  return new_booking_id;
end;
$$;

create or replace function public.claim_recurring_occurrence_checkout_internal(
  target_occurrence_id uuid, target_quote_id uuid
)
returns boolean language plpgsql security definer set search_path = public as $$
declare occurrence public.rider_booking_series_occurrences; series public.rider_booking_series;
  quote public.trip_price_quotes; settings public.tenant_scheduling_settings;
begin
  select * into occurrence from public.rider_booking_series_occurrences
    where rider_booking_series_occurrence_id = target_occurrence_id for update;
  if occurrence.rider_booking_series_occurrence_id is null then raise exception 'Recurring occurrence is unavailable'; end if;
  if occurrence.status = 'payment_pending' and occurrence.quote_id = target_quote_id then return true; end if;
  if occurrence.status <> 'awaiting_payment' then raise exception 'Recurring occurrence already has payment or booking activity'; end if;
  select * into series from public.rider_booking_series where rider_booking_series_id = occurrence.rider_booking_series_id;
  select * into quote from public.trip_price_quotes where quote_id = target_quote_id;
  select * into settings from public.tenant_scheduling_settings where tenant_id = occurrence.tenant_id;
  if series.status <> 'active' or quote.status <> 'quoted' or quote.expires_at <= now()
    or quote.tenant_id <> occurrence.tenant_id or quote.rider_profile_id <> occurrence.rider_profile_id
    or quote.service_area_id <> series.service_area_id or quote.pickup_address <> series.pickup_address
    or quote.destination_address <> series.destination_address then raise exception 'Fare quote does not match this recurring trip'; end if;
  if occurrence.scheduled_pickup_at < now() + make_interval(mins => settings.minimum_notice_minutes)
    then raise exception 'This recurring trip is too close to pickup for payment'; end if;
  update public.rider_booking_series_occurrences set status = 'payment_pending', quote_id = target_quote_id,
    updated_at = now() where rider_booking_series_occurrence_id = target_occurrence_id;
  return true;
end;
$$;

create or replace function public.release_recurring_occurrence_checkout_internal(
  target_occurrence_id uuid, target_quote_id uuid
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.rider_booking_series_occurrences set status = 'awaiting_payment', quote_id = null, updated_at = now()
  where rider_booking_series_occurrence_id = target_occurrence_id and quote_id = target_quote_id
    and status = 'payment_pending' and not exists (
      select 1 from public.rider_payment_attempts payment where payment.quote_id = target_quote_id and payment.status = 'paid');
  return found;
end;
$$;

create or replace function public.release_failed_recurring_checkout()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('failed', 'expired') and old.status is distinct from new.status then
    update public.rider_booking_series_occurrences set status = 'awaiting_payment', quote_id = null, updated_at = now()
      where quote_id = new.quote_id and status = 'payment_pending';
  end if;
  return new;
end;
$$;
create trigger rider_payment_attempts_release_failed_recurring
after update of status on public.rider_payment_attempts for each row execute function public.release_failed_recurring_checkout();

revoke all on function public.create_my_rider_booking_series(uuid, date, date, time, smallint[], timestamptz[], text) from public, anon, authenticated;
revoke all on function public.my_rider_booking_series(text) from public, anon, authenticated;
revoke all on function public.cancel_my_rider_series_occurrence(uuid) from public, anon, authenticated;
revoke all on function public.cancel_my_rider_booking_series(uuid) from public, anon, authenticated;
revoke all on function public.create_my_rider_recurring_booking(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.claim_recurring_occurrence_checkout_internal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_recurring_occurrence_checkout_internal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_my_rider_booking_series(uuid, date, date, time, smallint[], timestamptz[], text) to authenticated;
grant execute on function public.my_rider_booking_series(text) to authenticated;
grant execute on function public.cancel_my_rider_series_occurrence(uuid) to authenticated;
grant execute on function public.cancel_my_rider_booking_series(uuid) to authenticated;
grant execute on function public.create_my_rider_recurring_booking(uuid, uuid, text) to authenticated;
grant execute on function public.claim_recurring_occurrence_checkout_internal(uuid, uuid) to service_role;
grant execute on function public.release_recurring_occurrence_checkout_internal(uuid, uuid) to service_role;
