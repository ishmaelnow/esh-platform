-- Route-based tenant trip pricing, trusted Rider quotes, locked fares, and ledger posting.

alter table public.tenant_capabilities drop constraint tenant_capabilities_key_check;
alter table public.tenant_capabilities add constraint tenant_capabilities_key_check check (
  capability_key in (
    'tenant.memberships', 'tenant.roles', 'tenant.audit', 'app.admin', 'app.rider', 'app.driver',
    'driver.management', 'vehicle.management', 'finance.ledger', 'pricing.management'
  )
);

create table public.tenant_pricing_settings (
  tenant_id uuid primary key references public.tenants (tenant_id) on delete restrict,
  currency_code text not null references public.currency_codes (currency_code) on delete restrict,
  pricing_enabled boolean not null default false,
  base_fare_minor bigint not null default 0,
  per_mile_minor bigint not null default 0,
  per_minute_minor bigint not null default 0,
  minimum_fare_minor bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  constraint tenant_pricing_amounts_check check (
    base_fare_minor between 0 and 10000000 and per_mile_minor between 0 and 10000000
    and per_minute_minor between 0 and 10000000 and minimum_fare_minor between 0 and 10000000
  )
);

create table public.trip_price_quotes (
  quote_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  rider_profile_id uuid not null,
  service_area_id uuid not null,
  booking_id uuid,
  pickup_address text not null,
  destination_address text not null,
  pickup_latitude double precision not null,
  pickup_longitude double precision not null,
  destination_latitude double precision not null,
  destination_longitude double precision not null,
  route_distance_meters integer not null,
  route_duration_seconds integer not null,
  currency_code text not null references public.currency_codes (currency_code) on delete restrict,
  fare_amount_minor bigint not null,
  pricing_snapshot jsonb not null,
  status text not null default 'quoted',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint trip_price_quotes_rider_fk foreign key (tenant_id, rider_profile_id)
    references public.rider_profiles (tenant_id, rider_profile_id) on delete restrict,
  constraint trip_price_quotes_area_fk foreign key (tenant_id, service_area_id)
    references public.service_areas (tenant_id, service_area_id) on delete restrict,
  constraint trip_price_quotes_booking_fk foreign key (tenant_id, booking_id)
    references public.dispatch_bookings (tenant_id, booking_id) on delete restrict,
  constraint trip_price_quotes_coordinates_check check (
    pickup_latitude between -90 and 90 and destination_latitude between -90 and 90
    and pickup_longitude between -180 and 180 and destination_longitude between -180 and 180
  ),
  constraint trip_price_quotes_route_check check (
    route_distance_meters between 1 and 1000000 and route_duration_seconds between 1 and 172800
  ),
  constraint trip_price_quotes_fare_check check (fare_amount_minor > 0),
  constraint trip_price_quotes_status_check check (status in ('quoted', 'booked', 'expired')),
  constraint trip_price_quotes_status_booking_check check (
    (status = 'quoted' and booking_id is null) or (status = 'booked' and booking_id is not null)
    or status = 'expired'
  ),
  constraint trip_price_quotes_tenant_quote_unique unique (tenant_id, quote_id)
);

alter table public.dispatch_bookings
  add column price_quote_id uuid,
  add column fare_currency_code text references public.currency_codes (currency_code) on delete restrict,
  add column estimated_fare_minor bigint,
  add column final_fare_minor bigint,
  add column route_distance_meters integer,
  add column route_duration_seconds integer,
  add constraint dispatch_bookings_price_quote_fk foreign key (tenant_id, price_quote_id)
    references public.trip_price_quotes (tenant_id, quote_id) on delete restrict,
  add constraint dispatch_bookings_fare_payload_check check (
    (price_quote_id is null and fare_currency_code is null and estimated_fare_minor is null
      and final_fare_minor is null and route_distance_meters is null and route_duration_seconds is null)
    or (price_quote_id is not null and fare_currency_code is not null and estimated_fare_minor > 0
      and final_fare_minor = estimated_fare_minor and route_distance_meters > 0 and route_duration_seconds > 0)
  );

create index trip_price_quotes_rider_created_idx
  on public.trip_price_quotes (rider_profile_id, created_at desc);

create or replace function public.can_manage_pricing(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_tenant_role(target_tenant_id, array['tenant_owner', 'tenant_admin'])
    and public.tenant_capability_enabled(target_tenant_id, 'pricing.management');
$$;

create or replace function public.set_tenant_pricing_settings(
  target_tenant_id uuid,
  pricing_enabled_value boolean,
  base_fare_minor_value bigint,
  per_mile_minor_value bigint,
  per_minute_minor_value bigint,
  minimum_fare_minor_value bigint
)
returns boolean language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); operating_currency_value text;
begin
  if not public.can_manage_pricing(target_tenant_id) then raise exception 'pricing management access is required'; end if;
  select setting.operating_currency into operating_currency_value from public.tenant_financial_settings setting
    where tenant_id = target_tenant_id;
  if operating_currency_value is null then raise exception 'initialize the tenant ledger before configuring pricing'; end if;
  if base_fare_minor_value not between 0 and 10000000 or per_mile_minor_value not between 0 and 10000000
    or per_minute_minor_value not between 0 and 10000000 or minimum_fare_minor_value not between 0 and 10000000
    or (pricing_enabled_value and base_fare_minor_value + per_mile_minor_value + per_minute_minor_value = 0)
  then raise exception 'valid nonnegative pricing amounts are required'; end if;
  insert into public.tenant_pricing_settings
    (tenant_id, currency_code, pricing_enabled, base_fare_minor, per_mile_minor,
     per_minute_minor, minimum_fare_minor, updated_by_person_id)
  values (target_tenant_id, operating_currency_value, pricing_enabled_value, base_fare_minor_value,
    per_mile_minor_value, per_minute_minor_value, minimum_fare_minor_value, actor_id)
  on conflict (tenant_id) do update set pricing_enabled = excluded.pricing_enabled,
    base_fare_minor = excluded.base_fare_minor, per_mile_minor = excluded.per_mile_minor,
    per_minute_minor = excluded.per_minute_minor, minimum_fare_minor = excluded.minimum_fare_minor,
    updated_at = now(), updated_by_person_id = excluded.updated_by_person_id;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (target_tenant_id, 'pricing.settings_updated', 'person', actor_id, '{}',
    'Tenant trip pricing settings updated.', gen_random_uuid(), 'tenant_pricing_settings', target_tenant_id::text,
    jsonb_build_object('pricing_enabled', pricing_enabled_value, 'currency_code', operating_currency_value,
      'base_fare_minor', base_fare_minor_value, 'per_mile_minor', per_mile_minor_value,
      'per_minute_minor', per_minute_minor_value, 'minimum_fare_minor', minimum_fare_minor_value));
  return true;
end;
$$;

create or replace function public.create_rider_price_quote_internal(
  target_rider_profile_id uuid,
  target_service_area_id uuid,
  pickup_address_value text,
  destination_address_value text,
  pickup_latitude_value double precision,
  pickup_longitude_value double precision,
  destination_latitude_value double precision,
  destination_longitude_value double precision,
  route_distance_meters_value integer,
  route_duration_seconds_value integer
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rider public.rider_profiles; settings public.tenant_pricing_settings; new_quote_id uuid; fare_minor bigint;
begin
  select * into rider from public.rider_profiles where rider_profile_id = target_rider_profile_id and status = 'active';
  if rider.rider_profile_id is null then raise exception 'active Rider profile is required'; end if;
  select * into settings from public.tenant_pricing_settings where tenant_id = rider.tenant_id and pricing_enabled;
  if settings.tenant_id is null then raise exception 'trip pricing is unavailable for this provider'; end if;
  if not exists (select 1 from public.service_areas where tenant_id = rider.tenant_id
    and service_area_id = target_service_area_id and status = 'active') then raise exception 'active service area is required'; end if;
  if route_distance_meters_value not between 1 and 1000000 or route_duration_seconds_value not between 1 and 172800
    then raise exception 'valid route distance and duration are required'; end if;
  fare_minor := greatest(settings.minimum_fare_minor,
    settings.base_fare_minor
    + round(route_distance_meters_value::numeric * settings.per_mile_minor / 1609.344)::bigint
    + round(route_duration_seconds_value::numeric * settings.per_minute_minor / 60)::bigint);
  if fare_minor <= 0 then raise exception 'calculated fare must be positive'; end if;
  insert into public.trip_price_quotes (
    tenant_id, rider_profile_id, service_area_id, pickup_address, destination_address,
    pickup_latitude, pickup_longitude, destination_latitude, destination_longitude,
    route_distance_meters, route_duration_seconds, currency_code, fare_amount_minor,
    pricing_snapshot, expires_at
  ) values (
    rider.tenant_id, rider.rider_profile_id, target_service_area_id, btrim(pickup_address_value),
    btrim(destination_address_value), pickup_latitude_value, pickup_longitude_value,
    destination_latitude_value, destination_longitude_value, route_distance_meters_value,
    route_duration_seconds_value, settings.currency_code, fare_minor,
    jsonb_build_object('baseFareMinor', settings.base_fare_minor, 'perMileMinor', settings.per_mile_minor,
      'perMinuteMinor', settings.per_minute_minor, 'minimumFareMinor', settings.minimum_fare_minor),
    now() + interval '15 minutes'
  ) returning quote_id into new_quote_id;
  return jsonb_build_object('quoteId', new_quote_id, 'fareAmountMinor', fare_minor,
    'currencyCode', settings.currency_code, 'expiresAt', now() + interval '15 minutes',
    'pickupAddress', btrim(pickup_address_value), 'destinationAddress', btrim(destination_address_value),
    'routeDistanceMeters', route_distance_meters_value, 'routeDurationSeconds', route_duration_seconds_value);
end;
$$;

create or replace function public.create_my_rider_priced_booking(
  target_quote_id uuid,
  booking_notes_value text default null,
  scheduled_pickup_at_value timestamptz default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare quote public.trip_price_quotes; rider_id uuid; tenant_slug text; new_booking_id uuid;
begin
  select * into quote from public.trip_price_quotes where quote_id = target_quote_id for update;
  if quote.quote_id is null or quote.status <> 'quoted' or quote.expires_at <= now()
    then raise exception 'price quote has expired; calculate a new fare'; end if;
  rider_id := public.current_rider_profile_id(quote.tenant_id);
  if rider_id is null or rider_id <> quote.rider_profile_id then raise exception 'Rider quote access is required'; end if;
  select tenant_slug into tenant_slug from public.tenant_configurations where tenant_id = quote.tenant_id;
  if scheduled_pickup_at_value is null then
    new_booking_id := public.create_my_rider_geocoded_booking(tenant_slug, quote.service_area_id,
      quote.pickup_address, quote.destination_address, quote.pickup_latitude, quote.pickup_longitude,
      quote.destination_latitude, quote.destination_longitude, 'mapbox-v6', booking_notes_value);
  else
    new_booking_id := public.create_my_rider_geocoded_scheduled_booking(tenant_slug, quote.service_area_id,
      quote.pickup_address, quote.destination_address, scheduled_pickup_at_value,
      quote.pickup_latitude, quote.pickup_longitude, quote.destination_latitude,
      quote.destination_longitude, 'mapbox-v6', booking_notes_value);
  end if;
  update public.dispatch_bookings set price_quote_id = quote.quote_id,
    fare_currency_code = quote.currency_code, estimated_fare_minor = quote.fare_amount_minor,
    final_fare_minor = quote.fare_amount_minor, route_distance_meters = quote.route_distance_meters,
    route_duration_seconds = quote.route_duration_seconds where booking_id = new_booking_id;
  update public.trip_price_quotes set status = 'booked', booking_id = new_booking_id where quote_id = quote.quote_id;
  return new_booking_id;
end;
$$;

create or replace function public.post_completed_trip_fare_to_ledger()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); transaction_id_value uuid; receivable_id uuid; revenue_id uuid; fingerprint text;
begin
  if new.status <> 'completed' or old.status = 'completed' or new.final_fare_minor is null then return new; end if;
  select account_id into receivable_id from public.ledger_accounts where tenant_id = new.tenant_id and account_code = 'rider_receivables';
  select account_id into revenue_id from public.ledger_accounts where tenant_id = new.tenant_id and account_code = 'platform_fees';
  if receivable_id is null or revenue_id is null then raise exception 'tenant ledger accounts are required before completing a priced trip'; end if;
  fingerprint := md5(jsonb_build_object('bookingId', new.booking_id, 'fareMinor', new.final_fare_minor,
    'currency', new.fare_currency_code)::text);
  insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint, description,
    effective_at, booking_id, created_by_person_id)
  values (new.tenant_id, 'trip_fare:' || new.booking_id::text, fingerprint,
    'Completed trip fare', coalesce(new.completed_at, now()), new.booking_id, actor_id)
  on conflict (tenant_id, external_key) do nothing returning transaction_id into transaction_id_value;
  if transaction_id_value is null then return new; end if;
  insert into public.ledger_entries (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
  values (new.tenant_id, transaction_id_value, receivable_id, 1, new.final_fare_minor, 0),
    (new.tenant_id, transaction_id_value, revenue_id, 2, 0, new.final_fare_minor);
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (new.tenant_id, 'pricing.trip_fare_posted', 'person', actor_id, '{}',
    'Completed trip fare posted to the ledger.', gen_random_uuid(), 'dispatch_booking', new.booking_id::text,
    jsonb_build_object('fare_amount_minor', new.final_fare_minor, 'currency_code', new.fare_currency_code,
      'ledger_transaction_id', transaction_id_value));
  return new;
end;
$$;

create trigger dispatch_bookings_post_completed_fare
after update of status on public.dispatch_bookings for each row execute function public.post_completed_trip_fare_to_ledger();

create or replace function public.my_driver_dispatch()
returns jsonb language plpgsql security definer set search_path = public as $$
declare driver_id uuid := public.current_driver_profile_id(); driver_tenant_id uuid; result jsonb;
begin
  select tenant_id into driver_tenant_id from public.driver_profiles where driver_profile_id = driver_id;
  if driver_id is null or driver_tenant_id is null then raise exception 'driver profile is unavailable'; end if;
  perform public.expire_dispatch_offers(driver_tenant_id);
  select jsonb_build_object(
    'offers', coalesce((select jsonb_agg(jsonb_build_object(
      'offerId', offer.offer_id, 'bookingId', booking.booking_id,
      'customerName', booking.customer_name, 'customerPhone', booking.customer_phone,
      'pickupAddress', booking.pickup_address, 'destinationAddress', booking.destination_address,
      'notes', booking.booking_notes, 'serviceAreaName', area.name, 'status', offer.status,
      'offeredAt', offer.offered_at, 'expiresAt', offer.expires_at,
      'fareCurrencyCode', booking.fare_currency_code, 'fareAmountMinor', booking.final_fare_minor
    ) order by offer.offered_at desc) from public.dispatch_offers offer
      join public.dispatch_bookings booking on booking.booking_id = offer.booking_id
      join public.service_areas area on area.service_area_id = booking.service_area_id
      where offer.driver_profile_id = driver_id and offer.status = 'pending'), '[]'::jsonb),
    'trips', coalesce((select jsonb_agg(jsonb_build_object(
      'bookingId', booking.booking_id, 'customerName', booking.customer_name,
      'customerPhone', booking.customer_phone, 'pickupAddress', booking.pickup_address,
      'destinationAddress', booking.destination_address, 'notes', booking.booking_notes,
      'serviceAreaName', area.name, 'status', booking.status,
      'pickupLatitude', booking.pickup_latitude, 'pickupLongitude', booking.pickup_longitude,
      'destinationLatitude', booking.destination_latitude, 'destinationLongitude', booking.destination_longitude,
      'fareCurrencyCode', booking.fare_currency_code, 'fareAmountMinor', booking.final_fare_minor
    ) order by booking.updated_at desc) from public.dispatch_bookings booking
      join public.service_areas area on area.service_area_id = booking.service_area_id
      where booking.current_driver_profile_id = driver_id
        and booking.status in ('accepted', 'arrived', 'in_progress')), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

alter table public.tenant_pricing_settings enable row level security;
alter table public.trip_price_quotes enable row level security;
create policy tenant_pricing_settings_manager_select on public.tenant_pricing_settings
  for select to authenticated using (public.can_manage_pricing(tenant_id));
create policy trip_price_quotes_manager_select on public.trip_price_quotes
  for select to authenticated using (public.can_manage_pricing(tenant_id));
create policy trip_price_quotes_rider_select on public.trip_price_quotes
  for select to authenticated using (rider_profile_id = public.current_rider_profile_id(tenant_id));
grant select on public.tenant_pricing_settings, public.trip_price_quotes to authenticated;
grant all on public.tenant_pricing_settings, public.trip_price_quotes to service_role;

insert into public.tenant_capabilities (tenant_id, capability_key, enabled, enabled_at, disabled_at, updated_by_person_id)
select capability.tenant_id, 'pricing.management', capability.enabled,
  case when capability.enabled then now() else null end, case when capability.enabled then null else now() end,
  capability.updated_by_person_id from public.tenant_capabilities capability
where capability.capability_key = 'finance.ledger' on conflict (tenant_id, capability_key) do nothing;

create or replace function public.seed_driver_management_capability()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tenant_capabilities (
    tenant_id, capability_key, enabled, disabled_at, updated_by_person_id
  ) values
    (new.tenant_id, 'driver.management', false, now(), public.current_person_id()),
    (new.tenant_id, 'vehicle.management', false, now(), public.current_person_id()),
    (new.tenant_id, 'finance.ledger', false, now(), public.current_person_id()),
    (new.tenant_id, 'pricing.management', false, now(), public.current_person_id())
  on conflict (tenant_id, capability_key) do nothing;
  return new;
end;
$$;

revoke all on function public.can_manage_pricing(uuid) from public, anon, authenticated;
revoke all on function public.set_tenant_pricing_settings(uuid, boolean, bigint, bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.create_rider_price_quote_internal(uuid, uuid, text, text, double precision, double precision, double precision, double precision, integer, integer) from public, anon, authenticated;
revoke all on function public.create_my_rider_priced_booking(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.can_manage_pricing(uuid) to authenticated;
grant execute on function public.set_tenant_pricing_settings(uuid, boolean, bigint, bigint, bigint, bigint) to authenticated;
grant execute on function public.create_rider_price_quote_internal(uuid, uuid, text, text, double precision, double precision, double precision, double precision, integer, integer) to service_role;
grant execute on function public.create_my_rider_priced_booking(uuid, text, timestamptz) to authenticated;
