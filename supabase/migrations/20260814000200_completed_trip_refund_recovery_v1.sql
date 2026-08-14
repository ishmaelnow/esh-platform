-- Coordinated completed-trip refund, Driver earning reversal, and optional Stripe transfer recovery.

alter table public.dispatch_bookings
  add column driver_earnings_reversed_at timestamptz,
  add column driver_earnings_reversal_reason text;

alter table public.rider_payment_refunds
  add column refund_scope text not null default 'pretrip',
  add constraint rider_payment_refunds_scope_check check (refund_scope in ('pretrip', 'completed_trip'));

create table public.completed_trip_refund_recoveries (
  completed_trip_refund_recovery_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  booking_id uuid not null,
  refund_id uuid not null,
  driver_earning_transfer_id uuid,
  provider_transfer_reversal_id text,
  status text not null default 'pending',
  failure_message text,
  requested_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  transfer_reversed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint completed_trip_refund_recoveries_booking_fk foreign key (tenant_id, booking_id)
    references public.dispatch_bookings (tenant_id, booking_id) on delete restrict,
  constraint completed_trip_refund_recoveries_refund_fk foreign key (refund_id)
    references public.rider_payment_refunds (refund_id) on delete restrict,
  constraint completed_trip_refund_recoveries_transfer_fk foreign key (driver_earning_transfer_id)
    references public.driver_earning_transfers (driver_earning_transfer_id) on delete restrict,
  constraint completed_trip_refund_recoveries_booking_unique unique (booking_id),
  constraint completed_trip_refund_recoveries_refund_unique unique (refund_id),
  constraint completed_trip_refund_recoveries_status_check check (
    status in ('pending', 'transfer_reversed', 'succeeded', 'failed')
  )
);

alter table public.completed_trip_refund_recoveries enable row level security;
create policy completed_trip_refund_recoveries_manager_select on public.completed_trip_refund_recoveries
  for select to authenticated using (public.can_manage_ledger(tenant_id));
grant select on public.completed_trip_refund_recoveries to authenticated;
grant all on public.completed_trip_refund_recoveries to service_role;

create or replace function public.prepare_completed_trip_refund(
  target_booking_id uuid, reason_value text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  booking public.dispatch_bookings;
  payment public.rider_payment_attempts;
  refund public.rider_payment_refunds;
  transfer public.driver_earning_transfers;
  recovery public.completed_trip_refund_recoveries;
  normalized_reason text := btrim(reason_value);
begin
  select * into booking from public.dispatch_bookings where booking_id = target_booking_id for update;
  if booking.booking_id is null then raise exception 'Booking is unavailable'; end if;
  if not public.can_manage_ledger(booking.tenant_id) then raise exception 'ledger management access is required'; end if;
  if booking.status <> 'completed' or booking.driver_earnings_minor is null
    then raise exception 'A completed trip with Driver earnings is required'; end if;
  if booking.driver_earnings_reversed_at is not null then
    select * into refund from public.rider_payment_refunds where booking_id = booking.booking_id;
    return jsonb_build_object('alreadyRefunded', true, 'refundId', refund.refund_id); end if;
  if length(normalized_reason) not between 5 and 500 then raise exception 'refund reason must be between 5 and 500 characters'; end if;
  select * into payment from public.rider_payment_attempts
    where booking_id = booking.booking_id and status = 'paid';
  if payment.payment_attempt_id is null or payment.provider_payment_intent_id is null
    then raise exception 'A collected Rider payment is required'; end if;
  select * into transfer from public.driver_earning_transfers
    where booking_id = booking.booking_id and status = 'succeeded';
  if transfer.driver_earning_transfer_id is not null and exists (
    select 1 from public.driver_payout_transfer_allocations allocation
    join public.driver_bank_payouts payout
      on payout.driver_bank_payout_id = allocation.driver_bank_payout_id
    where allocation.driver_earning_transfer_id = transfer.driver_earning_transfer_id
      and payout.status not in ('failed', 'canceled')
  ) then raise exception 'Driver funds are already included in a bank payout and require manual recovery'; end if;
  select * into refund from public.rider_payment_refunds where booking_id = booking.booking_id;
  if refund.status = 'succeeded' then return jsonb_build_object('alreadyRefunded', true, 'refundId', refund.refund_id); end if;
  if refund.refund_id is null then
    insert into public.rider_payment_refunds
      (tenant_id, payment_attempt_id, booking_id, currency_code, amount_minor, reason, refund_scope)
    values (booking.tenant_id, payment.payment_attempt_id, booking.booking_id,
      payment.currency_code, payment.amount_minor, normalized_reason, 'completed_trip')
    returning * into refund;
  else
    update public.rider_payment_refunds set status = 'pending', failure_message = null,
      reason = normalized_reason, refund_scope = 'completed_trip', updated_at = now()
    where refund_id = refund.refund_id returning * into refund;
  end if;
  insert into public.completed_trip_refund_recoveries
    (tenant_id, booking_id, refund_id, driver_earning_transfer_id, requested_by_person_id)
  values (booking.tenant_id, booking.booking_id, refund.refund_id,
    transfer.driver_earning_transfer_id, actor_id)
  on conflict (booking_id) do update set
    status = case when public.completed_trip_refund_recoveries.provider_transfer_reversal_id is null
      then 'pending' else 'transfer_reversed' end,
    failure_message = null, updated_at = now()
  returning * into recovery;
  return jsonb_build_object('alreadyRefunded', false, 'refundId', refund.refund_id,
    'recoveryId', recovery.completed_trip_refund_recovery_id,
    'paymentIntentId', payment.provider_payment_intent_id, 'amountMinor', refund.amount_minor,
    'transferId', transfer.provider_transfer_id, 'transferAmountMinor', transfer.amount_minor,
    'transferAlreadyReversed', recovery.provider_transfer_reversal_id is not null);
end;
$$;

create or replace function public.record_completed_trip_transfer_reversal_internal(
  target_recovery_id uuid, provider_transfer_reversal_id_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.completed_trip_refund_recoveries set
    provider_transfer_reversal_id = provider_transfer_reversal_id_value,
    status = 'transfer_reversed', transfer_reversed_at = coalesce(transfer_reversed_at, now()),
    failure_message = null, updated_at = now()
  where completed_trip_refund_recovery_id = target_recovery_id;
  return found;
end;
$$;

create or replace function public.complete_completed_trip_refund_internal(
  target_recovery_id uuid, provider_refund_id_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  recovery public.completed_trip_refund_recoveries;
  refund public.rider_payment_refunds;
  booking public.dispatch_bookings;
  transfer public.driver_earning_transfers;
  cash_id uuid; revenue_id uuid; payable_id uuid; transaction_id_value uuid;
begin
  select * into recovery from public.completed_trip_refund_recoveries
    where completed_trip_refund_recovery_id = target_recovery_id for update;
  if recovery.completed_trip_refund_recovery_id is null then raise exception 'Refund recovery is unavailable'; end if;
  if recovery.status = 'succeeded' then return true; end if;
  select * into refund from public.rider_payment_refunds where refund_id = recovery.refund_id;
  select * into booking from public.dispatch_bookings where booking_id = recovery.booking_id for update;
  if recovery.driver_earning_transfer_id is not null then
    select * into transfer from public.driver_earning_transfers
      where driver_earning_transfer_id = recovery.driver_earning_transfer_id;
    if recovery.provider_transfer_reversal_id is null then raise exception 'Stripe transfer reversal is required'; end if;
  end if;
  select account_id into cash_id from public.ledger_accounts
    where tenant_id = recovery.tenant_id and account_code = 'cash_clearing';
  select account_id into revenue_id from public.ledger_accounts
    where tenant_id = recovery.tenant_id and account_code = 'platform_fees';
  select account_id into payable_id from public.ledger_accounts
    where tenant_id = recovery.tenant_id and driver_profile_id = booking.current_driver_profile_id;
  if cash_id is null or revenue_id is null or payable_id is null
    then raise exception 'Required refund ledger accounts are unavailable'; end if;

  if recovery.driver_earning_transfer_id is not null then
    insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint,
      description, effective_at, booking_id, created_by_person_id)
    values (recovery.tenant_id, 'driver_transfer_reversal:' || recovery.booking_id::text,
      md5(recovery.provider_transfer_reversal_id), 'Driver transfer reversed for completed-trip refund',
      now(), recovery.booking_id, recovery.requested_by_person_id)
    on conflict (tenant_id, external_key) do nothing returning transaction_id into transaction_id_value;
    if transaction_id_value is not null then
      set constraints ledger_entries_balanced deferred;
      insert into public.ledger_entries
        (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
      values (recovery.tenant_id, transaction_id_value, cash_id, 1, transfer.amount_minor, 0),
        (recovery.tenant_id, transaction_id_value, payable_id, 2, 0, transfer.amount_minor);
      set constraints ledger_entries_balanced immediate;
    end if;
    update public.driver_earning_transfers set status = 'reversed', updated_at = now()
      where driver_earning_transfer_id = transfer.driver_earning_transfer_id;
  end if;

  transaction_id_value := null;
  insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint,
    description, effective_at, booking_id, created_by_person_id)
  values (recovery.tenant_id, 'driver_earnings_reversal:' || recovery.booking_id::text,
    md5(recovery.booking_id::text || ':earnings'), 'Driver earnings reversed for completed-trip refund',
    now(), recovery.booking_id, recovery.requested_by_person_id)
  on conflict (tenant_id, external_key) do nothing returning transaction_id into transaction_id_value;
  if transaction_id_value is not null then
    set constraints ledger_entries_balanced deferred;
    insert into public.ledger_entries
      (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
    values (recovery.tenant_id, transaction_id_value, payable_id, 1, booking.driver_earnings_minor, 0),
      (recovery.tenant_id, transaction_id_value, revenue_id, 2, 0, booking.driver_earnings_minor);
    set constraints ledger_entries_balanced immediate;
  end if;

  transaction_id_value := null;
  insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint,
    description, effective_at, booking_id, created_by_person_id)
  values (recovery.tenant_id, 'completed_trip_refund:' || refund.refund_id::text,
    md5(provider_refund_id_value), 'Completed Rider trip fully refunded', now(),
    recovery.booking_id, recovery.requested_by_person_id)
  on conflict (tenant_id, external_key) do nothing returning transaction_id into transaction_id_value;
  if transaction_id_value is not null then
    set constraints ledger_entries_balanced deferred;
    insert into public.ledger_entries
      (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
    values (recovery.tenant_id, transaction_id_value, revenue_id, 1, refund.amount_minor, 0),
      (recovery.tenant_id, transaction_id_value, cash_id, 2, 0, refund.amount_minor);
    set constraints ledger_entries_balanced immediate;
  end if;

  update public.dispatch_bookings set driver_earnings_reversed_at = now(),
    driver_earnings_reversal_reason = refund.reason where booking_id = booking.booking_id;
  update public.rider_payment_attempts set status = 'refunded', updated_at = now()
    where payment_attempt_id = refund.payment_attempt_id;
  update public.rider_payment_refunds set status = 'succeeded',
    provider_refund_id = provider_refund_id_value, refunded_at = now(), updated_at = now()
    where refund_id = refund.refund_id;
  update public.completed_trip_refund_recoveries set status = 'succeeded',
    failure_message = null, completed_at = now(), updated_at = now()
    where completed_trip_refund_recovery_id = recovery.completed_trip_refund_recovery_id;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (recovery.tenant_id, 'payment.completed_trip_refunded', 'person',
    recovery.requested_by_person_id, '{}', refund.reason, gen_random_uuid(),
    'completed_trip_refund_recovery', recovery.completed_trip_refund_recovery_id::text,
    jsonb_build_object('booking_id', recovery.booking_id, 'refund_amount_minor', refund.amount_minor,
      'driver_earnings_minor', booking.driver_earnings_minor,
      'transfer_reversed', recovery.driver_earning_transfer_id is not null));
  return true;
end;
$$;

create or replace function public.my_driver_wallet()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare driver_id uuid := public.current_driver_profile_id(); account_id_value uuid; result jsonb;
begin
  if driver_id is null then raise exception 'active Driver profile is required'; end if;
  select account_id into account_id_value from public.ledger_accounts where driver_profile_id = driver_id;
  select jsonb_build_object(
    'currencyCode', setting.operating_currency,
    'balanceMinor', coalesce((select sum(entry.credit_amount_minor - entry.debit_amount_minor)
      from public.ledger_entries entry where entry.account_id = account_id_value), 0),
    'pendingMinor', coalesce((select sum(booking.driver_earnings_minor)
      from public.dispatch_bookings booking
      left join public.rider_payment_attempts payment on payment.booking_id = booking.booking_id and payment.status = 'paid'
      where booking.current_driver_profile_id = driver_id and booking.status = 'completed'
        and booking.driver_earnings_minor is not null and booking.driver_earnings_reversed_at is null
        and payment.payment_attempt_id is null), 0),
    'availableMinor', coalesce((select sum(booking.driver_earnings_minor)
      from public.dispatch_bookings booking join public.rider_payment_attempts payment
        on payment.booking_id = booking.booking_id and payment.status = 'paid'
      left join public.driver_earning_transfers transfer on transfer.booking_id = booking.booking_id and transfer.status = 'succeeded'
      where booking.current_driver_profile_id = driver_id and booking.status = 'completed'
        and booking.driver_earnings_minor is not null and booking.driver_earnings_reversed_at is null
        and transfer.driver_earning_transfer_id is null), 0),
    'paidMinor', coalesce((select sum(transfer.amount_minor)
      from public.driver_earning_transfers transfer join public.dispatch_bookings booking on booking.booking_id = transfer.booking_id
      where transfer.driver_profile_id = driver_id and transfer.status = 'succeeded'
        and booking.driver_earnings_reversed_at is null), 0),
    'trips', coalesce((select jsonb_agg(jsonb_build_object(
      'bookingId', booking.booking_id, 'completedAt', booking.completed_at,
      'pickupAddress', booking.pickup_address, 'destinationAddress', booking.destination_address,
      'fareAmountMinor', booking.final_fare_minor, 'earningsAmountMinor', booking.driver_earnings_minor,
      'platformFeeMinor', booking.platform_fee_minor, 'shareBasisPoints', booking.earnings_share_basis_points,
      'paymentCollected', payment.payment_attempt_id is not null,
      'transferStatus', transfer.status,
      'earningsReversed', booking.driver_earnings_reversed_at is not null,
      'earningsReversalReason', booking.driver_earnings_reversal_reason
    ) order by booking.completed_at desc) from public.dispatch_bookings booking
      left join public.rider_payment_attempts payment on payment.booking_id = booking.booking_id and payment.status = 'paid'
      left join public.driver_earning_transfers transfer on transfer.booking_id = booking.booking_id
      where booking.current_driver_profile_id = driver_id and booking.status = 'completed'
        and booking.driver_earnings_minor is not null), '[]'::jsonb)
  ) into result
  from public.driver_profiles driver join public.tenant_financial_settings setting on setting.tenant_id = driver.tenant_id
  where driver.driver_profile_id = driver_id;
  return result;
end;
$$;

create or replace function public.fail_completed_trip_refund_recovery_internal(
  target_recovery_id uuid, failure_message_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.completed_trip_refund_recoveries set status = case
      when provider_transfer_reversal_id is null then 'failed' else 'transfer_reversed' end,
    failure_message = left(failure_message_value, 500), updated_at = now()
  where completed_trip_refund_recovery_id = target_recovery_id and status <> 'succeeded';
  update public.rider_payment_refunds set status = 'failed',
    failure_message = left(failure_message_value, 500), updated_at = now()
  where refund_id = (select refund_id from public.completed_trip_refund_recoveries
    where completed_trip_refund_recovery_id = target_recovery_id) and status <> 'succeeded';
  return found;
end;
$$;

revoke all on function public.prepare_completed_trip_refund(uuid, text) from public, anon, authenticated;
revoke all on function public.record_completed_trip_transfer_reversal_internal(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_completed_trip_refund_internal(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_completed_trip_refund_recovery_internal(uuid, text) from public, anon, authenticated;
grant execute on function public.prepare_completed_trip_refund(uuid, text) to authenticated;
grant execute on function public.record_completed_trip_transfer_reversal_internal(uuid, text) to service_role;
grant execute on function public.complete_completed_trip_refund_internal(uuid, text) to service_role;
grant execute on function public.fail_completed_trip_refund_recovery_internal(uuid, text) to service_role;
