-- Allow an authorized tenant administrator to close a trip that is still in progress.
-- The completion reason and actor are retained on the booking and in the audit trail.

alter table public.dispatch_bookings
  add column if not exists completed_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  add column if not exists completion_reason text;

alter table public.dispatch_bookings
  add constraint dispatch_bookings_completion_reason_check
  check (completion_reason is null or length(btrim(completion_reason)) between 3 and 500);

create or replace function public.admin_complete_in_progress_trip(
  target_booking_id uuid,
  completion_reason_value text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  booking public.dispatch_bookings;
  reason_value text := nullif(btrim(completion_reason_value), '');
begin
  if actor_id is null then raise exception 'an active person profile is required'; end if;
  select * into booking from public.dispatch_bookings
  where booking_id = target_booking_id for update;
  if booking.booking_id is null or not public.can_manage_dispatch(booking.tenant_id) then
    raise exception 'dispatch management permission is required';
  end if;
  if booking.status <> 'in_progress' then
    raise exception 'only an in-progress trip can be ended by Admin';
  end if;
  if reason_value is null or length(reason_value) < 3 or length(reason_value) > 500 then
    raise exception 'a completion reason between 3 and 500 characters is required';
  end if;

  update public.dispatch_bookings set
    status = 'completed',
    completed_at = now(),
    completed_by_person_id = actor_id,
    completion_reason = reason_value
  where booking_id = booking.booking_id;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    booking.tenant_id, 'trip.completed_by_admin', 'person', actor_id, '{}', reason_value,
    gen_random_uuid(), 'dispatch_booking', booking.booking_id::text,
    jsonb_build_object('previousStatus', 'in_progress', 'status', 'completed', 'completionReason', reason_value)
  );

  return jsonb_build_object(
    'bookingId', booking.booking_id,
    'status', 'completed',
    'completedAt', now(),
    'completedByPersonId', actor_id,
    'completionReason', reason_value
  );
end;
$$;

revoke all on function public.admin_complete_in_progress_trip(uuid, text) from public, anon;
grant execute on function public.admin_complete_in_progress_trip(uuid, text) to authenticated;
