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
      'rider_booking_cancelled', 'rider_booking_scheduled', 'rider_scheduled_reminder',
      'rider_scheduled_dispatch_started', 'rider_payment_succeeded', 'rider_refund_succeeded',
      'rider_recurring_autopay_succeeded', 'rider_recurring_autopay_failed',
      'driver_earnings_recorded', 'driver_transfer_succeeded', 'driver_bank_payout_created',
      'driver_bank_payout_paid', 'driver_bank_payout_failed', 'community_membership_approved'
    )
  );

create or replace function public.review_community_join_request(target_request_id uuid, decision_value text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  request_record public.community_join_requests%rowtype;
begin
  select * into request_record
  from public.community_join_requests
  where request_id = target_request_id
  for update;
  if request_record.tenant_id is null or not public.can_moderate_community(request_record.tenant_id) then
    raise exception 'Community moderation access is required';
  end if;
  if decision_value not in ('approved','rejected') then
    raise exception 'Unsupported membership decision';
  end if;
  update public.community_join_requests
  set status = decision_value, reviewed_at = now()
  where request_id = target_request_id;
  if decision_value = 'approved' then
    insert into public.notification_outbox (
      tenant_id, notification_type, recipient_email, payload, dedupe_key
    ) values (
      request_record.tenant_id,
      'community_membership_approved',
      lower(btrim(request_record.email)),
      jsonb_build_object('display_name', request_record.display_name, 'request_id', request_record.request_id),
      'community_join_request:' || request_record.request_id::text || ':approved'
    ) on conflict (dedupe_key) do nothing;
  end if;
  return true;
end $$;
