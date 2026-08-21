-- Record a trusted post-trip fare comparison without mutating the locked fare.
-- Payment/refund movement is deliberately deferred to an explicit reconciliation action.

create table public.trip_fare_reconciliations (
  reconciliation_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  booking_id uuid not null unique,
  quoted_distance_meters integer not null,
  actual_distance_meters integer not null,
  quoted_duration_seconds integer not null,
  actual_duration_seconds integer not null,
  quoted_fare_minor bigint not null,
  calculated_fare_minor bigint not null,
  adjustment_minor bigint not null,
  currency_code text not null references public.currency_codes (currency_code) on delete restrict,
  source text not null,
  status text not null default 'pending_review',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  review_note text,
  constraint trip_fare_reconciliations_booking_fk foreign key (tenant_id, booking_id)
    references public.dispatch_bookings (tenant_id, booking_id) on delete restrict,
  constraint trip_fare_reconciliations_distance_check check (
    quoted_distance_meters > 0 and actual_distance_meters > 0
  ),
  constraint trip_fare_reconciliations_duration_check check (
    quoted_duration_seconds > 0 and actual_duration_seconds > 0
  ),
  constraint trip_fare_reconciliations_fare_check check (
    quoted_fare_minor > 0 and calculated_fare_minor > 0
  ),
  constraint trip_fare_reconciliations_status_check check (
    status in ('no_change', 'pending_review', 'approved', 'rejected')
  ),
  constraint trip_fare_reconciliations_review_check check (
    (status in ('no_change', 'pending_review') and reviewed_at is null and reviewed_by_person_id is null)
    or (status in ('approved', 'rejected') and reviewed_at is not null and reviewed_by_person_id is not null)
  )
);

alter table public.trip_fare_reconciliations enable row level security;
create policy trip_fare_reconciliations_manager_select on public.trip_fare_reconciliations
  for select to authenticated using (public.can_manage_dispatch(tenant_id));
create policy trip_fare_reconciliations_rider_select on public.trip_fare_reconciliations
  for select to authenticated using (
    exists (
      select 1 from public.dispatch_bookings booking
      where booking.tenant_id = trip_fare_reconciliations.tenant_id
        and booking.booking_id = trip_fare_reconciliations.booking_id
        and booking.rider_profile_id = public.current_rider_profile_id(trip_fare_reconciliations.tenant_id)
    )
  );
create policy trip_fare_reconciliations_driver_select on public.trip_fare_reconciliations
  for select to authenticated using (
    exists (
      select 1 from public.dispatch_bookings booking
      where booking.tenant_id = trip_fare_reconciliations.tenant_id
        and booking.booking_id = trip_fare_reconciliations.booking_id
        and booking.current_driver_profile_id = public.current_driver_profile_id()
    )
  );
grant select on public.trip_fare_reconciliations to authenticated;
grant all on public.trip_fare_reconciliations to service_role;

create or replace function public.capture_completed_trip_fare_reconciliation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  booking public.dispatch_bookings;
  snapshot jsonb;
  base_fare_minor bigint;
  per_mile_minor bigint;
  per_minute_minor bigint;
  minimum_fare_minor bigint;
  toll_amount_minor bigint;
  service_type_surcharge_minor bigint;
  calculated_base_minor bigint;
  calculated_fare_minor bigint;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;

  -- The route-metrics trigger runs first and writes these columns before this trigger.
  select * into booking from public.dispatch_bookings where booking_id = new.booking_id;
  if booking.actual_route_distance_meters is null
    or booking.actual_route_distance_meters <= 0
    or booking.actual_route_duration_seconds is null
    or booking.actual_route_duration_seconds <= 0
    or booking.route_distance_meters is null
    or booking.route_duration_seconds is null
    or booking.final_fare_minor is null
    or booking.price_quote_id is null then
    return new;
  end if;

  select quote.pricing_snapshot into snapshot
  from public.trip_price_quotes quote
  where quote.quote_id = booking.price_quote_id;
  if snapshot is null then return new; end if;

  base_fare_minor := coalesce((snapshot->>'baseFareMinor')::bigint, 0);
  per_mile_minor := coalesce((snapshot->>'perMileMinor')::bigint, 0);
  per_minute_minor := coalesce((snapshot->>'perMinuteMinor')::bigint, 0);
  minimum_fare_minor := coalesce((snapshot->>'minimumFareMinor')::bigint, 0);
  toll_amount_minor := coalesce((snapshot->>'tollAmountMinor')::bigint, 0);
  service_type_surcharge_minor := coalesce((snapshot->>'serviceTypeSurchargeMinor')::bigint, 0);
  calculated_base_minor := greatest(minimum_fare_minor,
    base_fare_minor
      + round(booking.actual_route_distance_meters::numeric * per_mile_minor / 1609.344)::bigint
      + round(booking.actual_route_duration_seconds::numeric * per_minute_minor / 60)::bigint);
  calculated_fare_minor := greatest(1, calculated_base_minor + toll_amount_minor + service_type_surcharge_minor);

  insert into public.trip_fare_reconciliations (
    tenant_id, booking_id, quoted_distance_meters, actual_distance_meters,
    quoted_duration_seconds, actual_duration_seconds, quoted_fare_minor,
    calculated_fare_minor, adjustment_minor, currency_code, source, status
  ) values (
    booking.tenant_id, booking.booking_id, booking.route_distance_meters,
    booking.actual_route_distance_meters, booking.route_duration_seconds,
    booking.actual_route_duration_seconds, booking.final_fare_minor,
    calculated_fare_minor, calculated_fare_minor - booking.final_fare_minor,
    booking.fare_currency_code, coalesce(booking.route_metrics_source, 'unknown'),
    case when calculated_fare_minor = booking.final_fare_minor then 'no_change' else 'pending_review' end
  ) on conflict (booking_id) do nothing;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles,
    reason, correlation_id, resource_type, resource_id, metadata
  ) values (
    booking.tenant_id, 'pricing.trip_fare_reconciliation_created', 'platform_system', null, '{}',
    'Trusted route metrics were compared with the locked fare.', gen_random_uuid(),
    'dispatch_booking', booking.booking_id::text,
    jsonb_build_object(
      'quotedDistanceMeters', booking.route_distance_meters,
      'actualDistanceMeters', booking.actual_route_distance_meters,
      'quotedDurationSeconds', booking.route_duration_seconds,
      'actualDurationSeconds', booking.actual_route_duration_seconds,
      'quotedFareMinor', booking.final_fare_minor,
      'calculatedFareMinor', calculated_fare_minor,
      'adjustmentMinor', calculated_fare_minor - booking.final_fare_minor,
      'source', coalesce(booking.route_metrics_source, 'unknown')
    )
  );
  return new;
end;
$$;

drop trigger if exists dispatch_bookings_capture_fare_reconciliation on public.dispatch_bookings;
create trigger dispatch_bookings_capture_fare_reconciliation
after update of status on public.dispatch_bookings
for each row execute function public.capture_completed_trip_fare_reconciliation();

revoke all on function public.capture_completed_trip_fare_reconciliation() from public, anon, authenticated;
grant execute on function public.capture_completed_trip_fare_reconciliation() to service_role;
