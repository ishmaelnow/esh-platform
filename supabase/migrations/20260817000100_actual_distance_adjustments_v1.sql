-- Capture Driver-reported completed-trip distance for review. No automatic fare movement.
create table public.trip_distance_adjustments (
  adjustment_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  booking_id uuid not null unique,
  reported_by_driver_profile_id uuid not null references public.driver_profiles (driver_profile_id) on delete restrict,
  quoted_distance_meters integer not null check (quoted_distance_meters > 0),
  actual_distance_meters integer not null check (actual_distance_meters > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  constraint trip_distance_adjustments_booking_fk foreign key (tenant_id, booking_id)
    references public.dispatch_bookings (tenant_id, booking_id) on delete restrict,
  constraint trip_distance_adjustments_review_check check (
    (status = 'pending' and reviewed_by_person_id is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by_person_id is not null and reviewed_at is not null)
  )
);
alter table public.trip_distance_adjustments enable row level security;
create policy trip_distance_adjustments_manager_select on public.trip_distance_adjustments
  for select to authenticated using (public.can_manage_dispatch(tenant_id));
create policy trip_distance_adjustments_driver_select on public.trip_distance_adjustments
  for select to authenticated using (reported_by_driver_profile_id = public.current_driver_profile_id());
grant select on public.trip_distance_adjustments to authenticated;
grant all on public.trip_distance_adjustments to service_role;

create or replace function public.submit_my_trip_distance_adjustment(
  target_booking_id uuid,
  actual_distance_meters_value integer
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  driver_id uuid := public.current_driver_profile_id();
  booking public.dispatch_bookings;
  adjustment public.trip_distance_adjustments;
begin
  if actual_distance_meters_value is null or actual_distance_meters_value not between 1 and 1000000
    then raise exception 'valid actual distance is required'; end if;
  select * into booking from public.dispatch_bookings where booking_id = target_booking_id;
  if booking.booking_id is null or booking.current_driver_profile_id is distinct from driver_id
    or booking.status <> 'completed' then raise exception 'completed trip is unavailable'; end if;
  if booking.route_distance_meters is null or booking.route_distance_meters <= 0
    then raise exception 'quoted trip distance is unavailable'; end if;
  insert into public.trip_distance_adjustments (
    tenant_id, booking_id, reported_by_driver_profile_id,
    quoted_distance_meters, actual_distance_meters
  ) values (
    booking.tenant_id, booking.booking_id, driver_id,
    booking.route_distance_meters, actual_distance_meters_value
  ) on conflict (booking_id) do update set
    actual_distance_meters = excluded.actual_distance_meters,
    status = 'pending', reviewed_by_person_id = null, reviewed_at = null, review_note = null;
  select * into adjustment from public.trip_distance_adjustments where booking_id = target_booking_id;
  return jsonb_build_object(
    'adjustmentId', adjustment.adjustment_id,
    'quotedDistanceMeters', adjustment.quoted_distance_meters,
    'actualDistanceMeters', adjustment.actual_distance_meters,
    'status', adjustment.status
  );
end;
$$;
revoke all on function public.submit_my_trip_distance_adjustment(uuid, integer) from public, anon;
grant execute on function public.submit_my_trip_distance_adjustment(uuid, integer) to authenticated;
