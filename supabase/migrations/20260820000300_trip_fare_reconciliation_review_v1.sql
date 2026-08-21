-- Add an explicit, audited Admin review decision for a trusted fare comparison.
-- This migration does not move Stripe funds or alter the locked fare.

alter table public.trip_fare_reconciliations
  drop constraint if exists trip_fare_reconciliations_status_check;
alter table public.trip_fare_reconciliations
  add constraint trip_fare_reconciliations_status_check check (
    status in ('no_change', 'pending_review', 'approved', 'rejected')
  );

create or replace function public.review_trip_fare_reconciliation(
  target_reconciliation_id uuid,
  decision_value text,
  review_note_value text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  reconciliation public.trip_fare_reconciliations;
  normalized_decision text := lower(btrim(decision_value));
  normalized_note text := nullif(btrim(review_note_value), '');
begin
  if actor_id is null then raise exception 'an active person profile is required'; end if;
  if normalized_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected';
  end if;
  if normalized_note is null or length(normalized_note) < 3 or length(normalized_note) > 500 then
    raise exception 'a review note between 3 and 500 characters is required';
  end if;
  select * into reconciliation from public.trip_fare_reconciliations
    where reconciliation_id = target_reconciliation_id for update;
  if reconciliation.reconciliation_id is null then raise exception 'fare reconciliation is unavailable'; end if;
  if not public.can_manage_ledger(reconciliation.tenant_id) then
    raise exception 'ledger management permission is required';
  end if;
  if reconciliation.status <> 'pending_review' then
    raise exception 'fare reconciliation has already been reviewed';
  end if;

  update public.trip_fare_reconciliations set status = normalized_decision,
    reviewed_at = now(), reviewed_by_person_id = actor_id, review_note = normalized_note
  where reconciliation_id = reconciliation.reconciliation_id;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles,
    reason, correlation_id, resource_type, resource_id, metadata
  ) values (
    reconciliation.tenant_id, 'pricing.trip_fare_reconciliation_reviewed', 'person', actor_id, '{}',
    normalized_note, gen_random_uuid(), 'trip_fare_reconciliation',
    reconciliation.reconciliation_id::text,
    jsonb_build_object('bookingId', reconciliation.booking_id, 'decision', normalized_decision,
      'adjustmentMinor', reconciliation.adjustment_minor, 'settlementPending', true)
  );
  return jsonb_build_object('reconciliationId', reconciliation.reconciliation_id,
    'bookingId', reconciliation.booking_id, 'status', normalized_decision,
    'adjustmentMinor', reconciliation.adjustment_minor, 'settlementPending', true);
end;
$$;

revoke all on function public.review_trip_fare_reconciliation(uuid, text, text) from public, anon;
grant execute on function public.review_trip_fare_reconciliation(uuid, text, text) to authenticated;
