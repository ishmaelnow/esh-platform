-- Tenant-selectable fare contracts: guaranteed upfront, metered actual, or protected flexible.
-- The contract is snapshotted on every quote; route choice remains operationally flexible.

alter table public.tenant_pricing_settings
  add column fare_policy text not null default 'guaranteed_upfront',
  add column protected_cap_mode text not null default 'percentage',
  add column protected_cap_value bigint not null default 2000,
  add constraint tenant_pricing_fare_policy_check
    check (fare_policy in ('guaranteed_upfront', 'metered_actual', 'protected_flexible')),
  add constraint tenant_pricing_protected_cap_check check (
    protected_cap_mode in ('percentage', 'fixed')
    and ((protected_cap_mode = 'percentage' and protected_cap_value between 0 and 10000)
      or (protected_cap_mode = 'fixed' and protected_cap_value between 0 and 10000000))
  );

alter table public.trip_price_quotes
  add column fare_policy text not null default 'guaranteed_upfront',
  add column maximum_fare_minor bigint,
  add constraint trip_price_quotes_fare_policy_check
    check (fare_policy in ('guaranteed_upfront', 'metered_actual', 'protected_flexible')),
  add constraint trip_price_quotes_maximum_fare_check check (
    (fare_policy = 'protected_flexible' and maximum_fare_minor >= fare_amount_minor)
    or (fare_policy <> 'protected_flexible' and maximum_fare_minor is null)
  );

alter table public.trip_fare_reconciliations
  add column fare_policy text,
  add column raw_calculated_fare_minor bigint,
  add column maximum_fare_minor bigint;
update public.trip_fare_reconciliations set fare_policy = 'legacy_comparison'
  where fare_policy is null;
alter table public.trip_fare_reconciliations
  alter column fare_policy set default 'guaranteed_upfront',
  alter column fare_policy set not null,
  add constraint trip_fare_reconciliations_fare_policy_check
    check (fare_policy in ('legacy_comparison', 'guaranteed_upfront', 'metered_actual', 'protected_flexible')),
  add constraint trip_fare_reconciliations_raw_fare_check
    check (raw_calculated_fare_minor is null or raw_calculated_fare_minor > 0);

alter table public.dispatch_bookings
  drop constraint if exists dispatch_bookings_fare_payload_check;
alter table public.dispatch_bookings
  add constraint dispatch_bookings_fare_payload_check check (
    (price_quote_id is null and fare_currency_code is null and estimated_fare_minor is null
      and final_fare_minor is null and route_distance_meters is null and route_duration_seconds is null)
    or (price_quote_id is not null and fare_currency_code is not null and estimated_fare_minor > 0
      and final_fare_minor > 0 and route_distance_meters > 0 and route_duration_seconds > 0)
  );

create or replace function public.set_tenant_pricing_and_fare_policy(
  target_tenant_id uuid,
  operating_currency_value text,
  pricing_enabled_value boolean,
  base_fare_minor_value bigint,
  per_mile_minor_value bigint,
  per_minute_minor_value bigint,
  minimum_fare_minor_value bigint,
  service_type_surcharges_value jsonb,
  fare_policy_value text,
  protected_cap_mode_value text,
  protected_cap_value_value bigint
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  item record;
  normalized_surcharges jsonb := '{}'::jsonb;
  normalized_policy text := lower(btrim(fare_policy_value));
  normalized_cap_mode text := lower(btrim(protected_cap_mode_value));
  financial_currency text;
begin
  if actor_id is null or not public.can_manage_pricing(target_tenant_id) then
    raise exception 'pricing management permission is required';
  end if;
  select operating_currency into financial_currency from public.tenant_financial_settings
    where tenant_id = target_tenant_id;
  if financial_currency is null or operating_currency_value is distinct from financial_currency
    or not exists (
    select 1 from public.currency_codes where currency_code = operating_currency_value
  ) then raise exception 'valid operating currency is required'; end if;
  if base_fare_minor_value not between 0 and 10000000
    or per_mile_minor_value not between 0 and 10000000
    or per_minute_minor_value not between 0 and 10000000
    or minimum_fare_minor_value not between 0 and 10000000
    or (pricing_enabled_value and base_fare_minor_value + per_mile_minor_value + per_minute_minor_value = 0)
  then raise exception 'valid nonnegative pricing amounts are required'; end if;
  if normalized_policy is null
    or normalized_policy not in ('guaranteed_upfront', 'metered_actual', 'protected_flexible') then
    raise exception 'supported fare policy is required';
  end if;
  if normalized_cap_mode is null or protected_cap_value_value is null
    or normalized_cap_mode not in ('percentage', 'fixed')
    or (normalized_cap_mode = 'percentage' and protected_cap_value_value not between 0 and 10000)
    or (normalized_cap_mode = 'fixed' and protected_cap_value_value not between 0 and 10000000)
  then raise exception 'valid protected fare cap is required'; end if;
  if service_type_surcharges_value is null or jsonb_typeof(service_type_surcharges_value) <> 'object' then
    raise exception 'service type adjustments must be an object';
  end if;
  for item in select * from jsonb_each(service_type_surcharges_value) loop
    if item.key not in ('standard', 'larger', 'premium', 'accessible')
      or jsonb_typeof(item.value) <> 'number'
      or (item.value)::text::bigint not between -10000000 and 10000000
    then raise exception 'invalid service type adjustment'; end if;
    normalized_surcharges := normalized_surcharges || jsonb_build_object(item.key, (item.value)::text::bigint);
  end loop;
  if not (normalized_surcharges ?& array['standard', 'larger', 'premium', 'accessible']) then
    raise exception 'all service type adjustments are required';
  end if;

  insert into public.tenant_pricing_settings (
    tenant_id, currency_code, pricing_enabled, base_fare_minor, per_mile_minor,
    per_minute_minor, minimum_fare_minor, service_type_surcharges, fare_policy,
    protected_cap_mode, protected_cap_value, updated_by_person_id
  ) values (
    target_tenant_id, operating_currency_value, pricing_enabled_value, base_fare_minor_value,
    per_mile_minor_value, per_minute_minor_value, minimum_fare_minor_value,
    normalized_surcharges, normalized_policy, normalized_cap_mode,
    protected_cap_value_value, actor_id
  ) on conflict (tenant_id) do update set
    currency_code = excluded.currency_code, pricing_enabled = excluded.pricing_enabled,
    base_fare_minor = excluded.base_fare_minor, per_mile_minor = excluded.per_mile_minor,
    per_minute_minor = excluded.per_minute_minor, minimum_fare_minor = excluded.minimum_fare_minor,
    service_type_surcharges = excluded.service_type_surcharges,
    fare_policy = excluded.fare_policy, protected_cap_mode = excluded.protected_cap_mode,
    protected_cap_value = excluded.protected_cap_value, updated_at = now(),
    updated_by_person_id = excluded.updated_by_person_id;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    target_tenant_id, 'pricing.settings_updated', 'person', actor_id, '{}',
    'Tenant pricing and fare contract policy updated.', gen_random_uuid(),
    'tenant_pricing_settings', target_tenant_id::text,
    jsonb_build_object('pricingEnabled', pricing_enabled_value, 'currencyCode', operating_currency_value,
      'farePolicy', normalized_policy, 'protectedCapMode', normalized_cap_mode,
      'protectedCapValue', protected_cap_value_value)
  );
  return true;
end;
$$;

revoke all on function public.set_tenant_pricing_and_fare_policy(
  uuid, text, boolean, bigint, bigint, bigint, bigint, jsonb, text, text, bigint
) from public, anon, authenticated;
grant execute on function public.set_tenant_pricing_and_fare_policy(
  uuid, text, boolean, bigint, bigint, bigint, bigint, jsonb, text, text, bigint
) to authenticated;

create or replace function public.create_rider_price_quote_with_service_type(
  target_rider_profile_id uuid, target_service_area_id uuid, pickup_address_value text, destination_address_value text,
  pickup_latitude_value double precision, pickup_longitude_value double precision, destination_latitude_value double precision,
  destination_longitude_value double precision, route_distance_meters_value integer, route_duration_seconds_value integer,
  toll_amount_minor_value integer, toll_snapshot_value jsonb, service_type_value text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  base_quote jsonb;
  quote_id_value uuid;
  settings public.tenant_pricing_settings;
  normalized text := lower(btrim(coalesce(service_type_value, 'standard')));
  surcharge bigint;
  quoted_fare bigint;
  maximum_fare bigint;
begin
  if normalized not in ('standard', 'larger', 'premium', 'accessible') then
    raise exception 'unsupported vehicle service type';
  end if;
  base_quote := public.create_rider_price_quote_internal(
    target_rider_profile_id, target_service_area_id, pickup_address_value, destination_address_value,
    pickup_latitude_value, pickup_longitude_value, destination_latitude_value, destination_longitude_value,
    route_distance_meters_value, route_duration_seconds_value, toll_amount_minor_value, toll_snapshot_value
  );
  quote_id_value := (base_quote->>'quoteId')::uuid;
  select pricing.* into settings from public.tenant_pricing_settings pricing
    where pricing.tenant_id = (select profile.tenant_id from public.rider_profiles profile
      where profile.rider_profile_id = target_rider_profile_id);
  surcharge := coalesce((settings.service_type_surcharges ->> normalized)::bigint, 0);
  quoted_fare := greatest(1, (base_quote->>'fareAmountMinor')::bigint + surcharge);
  maximum_fare := case when settings.fare_policy = 'protected_flexible' then
    quoted_fare + case when settings.protected_cap_mode = 'percentage'
      then round(quoted_fare::numeric * settings.protected_cap_value / 10000)::bigint
      else settings.protected_cap_value end
    else null end;
  update public.trip_price_quotes set
    service_type = normalized, fare_amount_minor = quoted_fare,
    fare_policy = settings.fare_policy, maximum_fare_minor = maximum_fare,
    pricing_snapshot = pricing_snapshot || jsonb_build_object(
      'schemaVersion', 3, 'serviceType', normalized, 'serviceTypeSurchargeMinor', surcharge,
      'farePolicy', settings.fare_policy, 'protectedCapMode', settings.protected_cap_mode,
      'protectedCapValue', settings.protected_cap_value, 'maximumFareMinor', maximum_fare
    ) where quote_id = quote_id_value;
  return base_quote || jsonb_build_object(
    'fareAmountMinor', quoted_fare, 'serviceType', normalized,
    'serviceTypeSurchargeMinor', surcharge, 'farePolicy', settings.fare_policy,
    'maximumFareMinor', maximum_fare
  );
end;
$$;

create or replace function public.capture_completed_trip_fare_reconciliation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  booking public.dispatch_bookings;
  quote public.trip_price_quotes;
  snapshot jsonb;
  raw_fare bigint;
  contract_fare bigint;
  adjustment bigint;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  select * into booking from public.dispatch_bookings where booking_id = new.booking_id;
  if booking.actual_route_distance_meters is null or booking.actual_route_distance_meters <= 0
    or booking.actual_route_duration_seconds is null or booking.actual_route_duration_seconds <= 0
    or booking.route_distance_meters is null or booking.route_duration_seconds is null
    or booking.final_fare_minor is null or booking.price_quote_id is null then return new; end if;
  select * into quote from public.trip_price_quotes where quote_id = booking.price_quote_id;
  snapshot := quote.pricing_snapshot;
  if snapshot is null then return new; end if;
  raw_fare := greatest(1,
    greatest(coalesce((snapshot->>'minimumFareMinor')::bigint, 0),
      coalesce((snapshot->>'baseFareMinor')::bigint, 0)
      + round(booking.actual_route_distance_meters::numeric * coalesce((snapshot->>'perMileMinor')::bigint, 0) / 1609.344)::bigint
      + round(booking.actual_route_duration_seconds::numeric * coalesce((snapshot->>'perMinuteMinor')::bigint, 0) / 60)::bigint)
    + coalesce((snapshot->>'tollAmountMinor')::bigint, 0)
    + coalesce((snapshot->>'serviceTypeSurchargeMinor')::bigint, 0));
  contract_fare := case quote.fare_policy
    when 'guaranteed_upfront' then booking.final_fare_minor
    when 'protected_flexible' then case when raw_fare < booking.final_fare_minor then raw_fare
      else least(raw_fare, quote.maximum_fare_minor) end
    else raw_fare end;
  adjustment := contract_fare - booking.final_fare_minor;

  insert into public.trip_fare_reconciliations (
    tenant_id, booking_id, quoted_distance_meters, actual_distance_meters,
    quoted_duration_seconds, actual_duration_seconds, quoted_fare_minor,
    calculated_fare_minor, raw_calculated_fare_minor, adjustment_minor, currency_code,
    source, status, fare_policy, maximum_fare_minor
  ) values (
    booking.tenant_id, booking.booking_id, booking.route_distance_meters,
    booking.actual_route_distance_meters, booking.route_duration_seconds,
    booking.actual_route_duration_seconds, booking.final_fare_minor, contract_fare,
    raw_fare, adjustment, booking.fare_currency_code,
    coalesce(booking.route_metrics_source, 'unknown'),
    case when adjustment = 0 then 'no_change' else 'pending_review' end,
    quote.fare_policy, quote.maximum_fare_minor
  ) on conflict (booking_id) do nothing;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles,
    reason, correlation_id, resource_type, resource_id, metadata
  ) values (
    booking.tenant_id, 'pricing.trip_fare_reconciliation_created', 'platform_system', null, '{}',
    'Trusted route metrics were evaluated under the Rider fare contract.', gen_random_uuid(),
    'dispatch_booking', booking.booking_id::text,
    jsonb_build_object('farePolicy', quote.fare_policy, 'quotedFareMinor', booking.final_fare_minor,
      'rawCalculatedFareMinor', raw_fare, 'contractFareMinor', contract_fare,
      'maximumFareMinor', quote.maximum_fare_minor, 'adjustmentMinor', adjustment,
      'source', coalesce(booking.route_metrics_source, 'unknown'))
  );
  return new;
end;
$$;

revoke all on function public.capture_completed_trip_fare_reconciliation() from public, anon, authenticated;
grant execute on function public.capture_completed_trip_fare_reconciliation() to service_role;

create or replace function public.apply_succeeded_trip_fare_contract()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reconciliation public.trip_fare_reconciliations;
  booking public.dispatch_bookings;
  earnings_minor bigint;
begin
  if new.status <> 'succeeded' or old.status = 'succeeded' then return new; end if;
  select * into reconciliation from public.trip_fare_reconciliations
    where reconciliation_id = new.reconciliation_id;
  select * into booking from public.dispatch_bookings where booking_id = new.booking_id for update;
  earnings_minor := round(reconciliation.calculated_fare_minor::numeric
    * coalesce(booking.earnings_share_basis_points, 0) / 10000)::bigint;
  update public.dispatch_bookings set
    final_fare_minor = reconciliation.calculated_fare_minor,
    driver_earnings_minor = case when booking.driver_earnings_minor is null then null else earnings_minor end,
    platform_fee_minor = case when booking.platform_fee_minor is null then null
      else reconciliation.calculated_fare_minor - earnings_minor end
  where booking_id = booking.booking_id;
  return new;
end;
$$;

create trigger trip_fare_settlements_apply_contract
after update of status on public.trip_fare_settlements
for each row execute function public.apply_succeeded_trip_fare_contract();

revoke all on function public.apply_succeeded_trip_fare_contract() from public, anon, authenticated;
grant execute on function public.apply_succeeded_trip_fare_contract() to service_role;

-- The lifecycle proximity contract is 250 feet (76.2 m), not the former 250 m.
-- GPS uncertainty is considered only for reasonably precise readings; poor readings must retry.
create or replace function public.advance_my_trip(target_booking_id uuid, target_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  driver_id uuid := public.current_driver_profile_id();
  target_booking public.dispatch_bookings;
  current_location public.driver_locations;
  next_status text;
  target_latitude double precision;
  target_longitude double precision;
  distance_meters double precision;
  allowed_radius_meters double precision;
begin
  select * into target_booking from public.dispatch_bookings
    where booking_id = target_booking_id for update;
  if driver_id is null or target_booking.booking_id is null
    or target_booking.current_driver_profile_id is distinct from driver_id then
    raise exception 'active trip is unavailable';
  end if;
  next_status := case
    when target_action = 'arrive' and target_booking.status = 'accepted' then 'arrived'
    when target_action = 'start' and target_booking.status = 'arrived' then 'in_progress'
    when target_action = 'complete' and target_booking.status = 'in_progress' then 'completed'
    else null end;
  if next_status is null then raise exception 'trip action is not valid from the current state'; end if;
  if target_action in ('arrive', 'complete') then
    select * into current_location from public.driver_locations
      where driver_profile_id = driver_id and sharing_enabled;
    if current_location.driver_profile_id is null or current_location.latitude is null
      or current_location.longitude is null or current_location.recorded_at is null
      or current_location.recorded_at < now() - interval '2 minutes' then
      raise exception 'fresh live location is required before marking this trip';
    end if;
    if current_location.accuracy_meters is null or current_location.accuracy_meters > 75 then
      raise exception 'a more precise GPS reading is required before marking this trip';
    end if;
    if target_action = 'arrive' then
      target_latitude := target_booking.pickup_latitude;
      target_longitude := target_booking.pickup_longitude;
    else
      target_latitude := target_booking.destination_latitude;
      target_longitude := target_booking.destination_longitude;
    end if;
    if target_latitude is null or target_longitude is null then
      raise exception 'trip location coordinates are unavailable';
    end if;
    distance_meters := 6371000 * 2 * asin(least(1, sqrt(
      power(sin(radians(current_location.latitude - target_latitude) / 2), 2)
      + cos(radians(target_latitude)) * cos(radians(current_location.latitude))
      * power(sin(radians(current_location.longitude - target_longitude) / 2), 2)
    )));
    allowed_radius_meters := 76.2 + current_location.accuracy_meters;
    if distance_meters > allowed_radius_meters then
      raise exception '% location must be within 250 feet of the %.',
        case when target_action = 'arrive' then 'Pickup' else 'Destination' end,
        case when target_action = 'arrive' then 'pickup' else 'destination' end;
    end if;
  end if;
  update public.dispatch_bookings set status = next_status,
    completed_at = case when next_status = 'completed' then now() else completed_at end
    where booking_id = target_booking_id;
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) select target_booking.tenant_id, 'trip.' || next_status, 'person', driver.person_id, '{}',
    'Driver advanced the trip lifecycle.', gen_random_uuid(), 'dispatch_booking',
    target_booking_id::text, jsonb_build_object('status', next_status,
      'proximityDistanceMeters', distance_meters, 'gpsAccuracyMeters', current_location.accuracy_meters,
      'nominalProximityFeet', 250)
    from public.driver_profiles driver where driver.driver_profile_id = driver_id;
  return public.my_driver_dispatch();
end;
$$;
