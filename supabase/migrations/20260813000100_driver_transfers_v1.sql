-- Idempotent per-trip Stripe transfers for collected Driver earnings.

create table public.driver_earning_transfers (
  driver_earning_transfer_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  driver_profile_id uuid not null,
  booking_id uuid not null,
  payment_attempt_id uuid not null,
  provider text not null default 'stripe',
  provider_transfer_id text,
  status text not null default 'pending',
  currency_code text not null references public.currency_codes (currency_code) on delete restrict,
  amount_minor bigint not null,
  failure_message text,
  created_at timestamptz not null default now(),
  transferred_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint driver_earning_transfers_driver_fk foreign key (tenant_id, driver_profile_id)
    references public.driver_profiles (tenant_id, driver_profile_id) on delete restrict,
  constraint driver_earning_transfers_booking_fk foreign key (tenant_id, booking_id)
    references public.dispatch_bookings (tenant_id, booking_id) on delete restrict,
  constraint driver_earning_transfers_payment_fk foreign key (tenant_id, payment_attempt_id)
    references public.rider_payment_attempts (tenant_id, payment_attempt_id) on delete restrict,
  constraint driver_earning_transfers_status_check check (status in ('pending', 'succeeded', 'failed', 'reversed')),
  constraint driver_earning_transfers_amount_check check (amount_minor > 0),
  constraint driver_earning_transfers_booking_unique unique (booking_id)
);

create unique index driver_earning_transfers_provider_unique
  on public.driver_earning_transfers (provider, provider_transfer_id)
  where provider_transfer_id is not null;

alter table public.driver_earning_transfers enable row level security;
create policy driver_earning_transfers_driver_select on public.driver_earning_transfers
  for select to authenticated using (driver_profile_id = public.current_driver_profile_id());
create policy driver_earning_transfers_manager_select on public.driver_earning_transfers
  for select to authenticated using (public.can_manage_ledger(tenant_id));
grant select on public.driver_earning_transfers to authenticated;
grant all on public.driver_earning_transfers to service_role;

create or replace function public.prepare_driver_earning_transfer_internal(
  target_driver_profile_id uuid, target_booking_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare booking public.dispatch_bookings; payment public.rider_payment_attempts;
  payout public.driver_payout_accounts; transfer public.driver_earning_transfers;
begin
  select * into booking from public.dispatch_bookings where booking_id = target_booking_id for update;
  if booking.booking_id is null or booking.current_driver_profile_id <> target_driver_profile_id
    then raise exception 'Driver trip is unavailable'; end if;
  if booking.status <> 'completed' or booking.driver_earnings_minor is null or booking.driver_earnings_minor <= 0
    then raise exception 'Completed Driver earnings are required'; end if;
  select * into payment from public.rider_payment_attempts
    where booking_id = booking.booking_id and status = 'paid';
  if payment.payment_attempt_id is null or payment.provider_payment_intent_id is null
    then raise exception 'Collected Rider payment is required'; end if;
  select * into payout from public.driver_payout_accounts
    where driver_profile_id = target_driver_profile_id;
  if payout.driver_payout_account_id is null or payout.onboarding_status <> 'enabled'
    or payout.transfers_capability_status <> 'active'
    then raise exception 'Enabled Driver payout account is required'; end if;
  select * into transfer from public.driver_earning_transfers where booking_id = booking.booking_id;
  if transfer.status = 'succeeded' then
    return jsonb_build_object('alreadyTransferred', true, 'transferId', transfer.driver_earning_transfer_id);
  end if;
  if transfer.driver_earning_transfer_id is null then
    insert into public.driver_earning_transfers
      (tenant_id, driver_profile_id, booking_id, payment_attempt_id, currency_code, amount_minor)
    values (booking.tenant_id, target_driver_profile_id, booking.booking_id,
      payment.payment_attempt_id, payment.currency_code, booking.driver_earnings_minor)
    returning * into transfer;
  else
    update public.driver_earning_transfers set status = 'pending', failure_message = null, updated_at = now()
      where driver_earning_transfer_id = transfer.driver_earning_transfer_id returning * into transfer;
  end if;
  return jsonb_build_object('alreadyTransferred', false,
    'transferId', transfer.driver_earning_transfer_id,
    'amountMinor', transfer.amount_minor, 'currencyCode', transfer.currency_code,
    'paymentIntentId', payment.provider_payment_intent_id,
    'providerAccountId', payout.provider_account_id);
end;
$$;

create or replace function public.complete_driver_earning_transfer_internal(
  target_transfer_id uuid, provider_transfer_id_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare transfer public.driver_earning_transfers; payable_id uuid; cash_id uuid;
  transaction_id_value uuid; actor_id uuid;
begin
  select * into transfer from public.driver_earning_transfers
    where driver_earning_transfer_id = target_transfer_id for update;
  if transfer.driver_earning_transfer_id is null then raise exception 'Driver transfer is unavailable'; end if;
  if transfer.status = 'succeeded' then return true; end if;
  select account_id into payable_id from public.ledger_accounts
    where tenant_id = transfer.tenant_id and driver_profile_id = transfer.driver_profile_id;
  select account_id into cash_id from public.ledger_accounts
    where tenant_id = transfer.tenant_id and account_code = 'cash_clearing';
  select person_id into actor_id from public.driver_profiles
    where driver_profile_id = transfer.driver_profile_id;
  insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint, description,
    effective_at, booking_id, created_by_person_id)
  values (transfer.tenant_id, 'driver_transfer:' || transfer.booking_id::text,
    md5(jsonb_build_object('transferId', transfer.driver_earning_transfer_id,
      'amountMinor', transfer.amount_minor, 'providerTransferId', provider_transfer_id_value)::text),
    'Driver earnings transferred to Stripe', now(), transfer.booking_id, actor_id)
  on conflict (tenant_id, external_key) do nothing returning transaction_id into transaction_id_value;
  if transaction_id_value is not null then
    set constraints ledger_entries_balanced deferred;
    insert into public.ledger_entries
      (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
    values (transfer.tenant_id, transaction_id_value, payable_id, 1, transfer.amount_minor, 0),
      (transfer.tenant_id, transaction_id_value, cash_id, 2, 0, transfer.amount_minor);
    set constraints ledger_entries_balanced immediate;
  end if;
  update public.driver_earning_transfers set status = 'succeeded',
    provider_transfer_id = provider_transfer_id_value, transferred_at = now(), updated_at = now()
  where driver_earning_transfer_id = transfer.driver_earning_transfer_id;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (transfer.tenant_id, 'payout.driver_transfer_succeeded', 'platform_system', actor_id, '{}',
    'Collected Driver earnings transferred to the verified Stripe connected account.', gen_random_uuid(),
    'driver_earning_transfer', transfer.driver_earning_transfer_id::text,
    jsonb_build_object('booking_id', transfer.booking_id, 'amount_minor', transfer.amount_minor));
  return true;
end;
$$;

create or replace function public.fail_driver_earning_transfer_internal(
  target_transfer_id uuid, failure_message_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.driver_earning_transfers set status = 'failed',
    failure_message = left(failure_message_value, 500), updated_at = now()
  where driver_earning_transfer_id = target_transfer_id and status <> 'succeeded';
  return found;
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
        and booking.driver_earnings_minor is not null and payment.payment_attempt_id is null), 0),
    'availableMinor', coalesce((select sum(booking.driver_earnings_minor)
      from public.dispatch_bookings booking join public.rider_payment_attempts payment
        on payment.booking_id = booking.booking_id and payment.status = 'paid'
      left join public.driver_earning_transfers transfer on transfer.booking_id = booking.booking_id and transfer.status = 'succeeded'
      where booking.current_driver_profile_id = driver_id and booking.status = 'completed'
        and booking.driver_earnings_minor is not null and transfer.driver_earning_transfer_id is null), 0),
    'paidMinor', coalesce((select sum(amount_minor) from public.driver_earning_transfers
      where driver_profile_id = driver_id and status = 'succeeded'), 0),
    'trips', coalesce((select jsonb_agg(jsonb_build_object(
      'bookingId', booking.booking_id, 'completedAt', booking.completed_at,
      'pickupAddress', booking.pickup_address, 'destinationAddress', booking.destination_address,
      'fareAmountMinor', booking.final_fare_minor, 'earningsAmountMinor', booking.driver_earnings_minor,
      'platformFeeMinor', booking.platform_fee_minor, 'shareBasisPoints', booking.earnings_share_basis_points,
      'paymentCollected', payment.payment_attempt_id is not null,
      'transferStatus', transfer.status
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

revoke all on function public.prepare_driver_earning_transfer_internal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_driver_earning_transfer_internal(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_driver_earning_transfer_internal(uuid, text) from public, anon, authenticated;
grant execute on function public.prepare_driver_earning_transfer_internal(uuid, uuid) to service_role;
grant execute on function public.complete_driver_earning_transfer_internal(uuid, text) to service_role;
grant execute on function public.fail_driver_earning_transfer_internal(uuid, text) to service_role;
