-- In-progress trips must use the audited Admin completion action, not pre-trip cancellation.

create or replace function public.cancel_dispatch_booking(target_booking_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  target_booking public.dispatch_bookings;
begin
  select * into target_booking from public.dispatch_bookings
  where booking_id = target_booking_id for update;
  if target_booking.booking_id is null or actor_id is null
    or not public.can_manage_dispatch(target_booking.tenant_id) then
    raise exception 'dispatch management permission is required';
  end if;
  if target_booking.status = 'in_progress' then
    raise exception 'in-progress trips must be ended by Admin with a completion reason';
  end if;
  if target_booking.status in ('completed', 'cancelled') then
    raise exception 'booking cannot be cancelled';
  end if;
  update public.dispatch_offers set
    status = 'cancelled', responded_at = now(), response_notes = 'Booking cancelled.'
  where booking_id = target_booking_id and status = 'pending';
  update public.dispatch_bookings set status = 'cancelled', cancelled_at = now()
  where booking_id = target_booking_id;
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    target_booking.tenant_id, 'dispatch.booking_cancelled', 'person', actor_id, '{}',
    'Dispatch booking cancelled.', gen_random_uuid(), 'dispatch_booking',
    target_booking_id::text, '{}'::jsonb
  );
  return true;
end;
$$;
