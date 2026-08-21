-- Idempotent post-trip fare settlement records. External Stripe movement is performed by the
-- authenticated server route, then committed through the completion RPC below.

create table public.trip_fare_settlements (
  settlement_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  reconciliation_id uuid not null unique references public.trip_fare_reconciliations (reconciliation_id) on delete restrict,
  booking_id uuid not null,
  direction text not null check (direction in ('refund', 'charge')),
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null references public.currency_codes (currency_code) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'balance_due')),
  provider_reference text,
  failure_message text,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint trip_fare_settlements_booking_fk foreign key (tenant_id, booking_id)
    references public.dispatch_bookings (tenant_id, booking_id) on delete restrict
);
alter table public.trip_fare_settlements enable row level security;
create policy trip_fare_settlements_manager_select on public.trip_fare_settlements
  for select to authenticated using (public.can_manage_ledger(tenant_id));
create policy trip_fare_settlements_rider_select on public.trip_fare_settlements
  for select to authenticated using (exists (
    select 1 from public.dispatch_bookings booking
    where booking.booking_id = trip_fare_settlements.booking_id
      and booking.tenant_id = trip_fare_settlements.tenant_id
      and booking.rider_profile_id = public.current_rider_profile_id(trip_fare_settlements.tenant_id)
  ));
grant select on public.trip_fare_settlements to authenticated;
grant all on public.trip_fare_settlements to service_role;

create or replace function public.prepare_trip_fare_settlement_internal(target_reconciliation_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare reconciliation public.trip_fare_reconciliations; booking public.dispatch_bookings;
  payment public.rider_payment_attempts; method public.rider_saved_payment_methods;
  settlement public.trip_fare_settlements; direction_value text; amount_value bigint;
begin
  select * into reconciliation from public.trip_fare_reconciliations
    where reconciliation_id = target_reconciliation_id for update;
  if reconciliation.reconciliation_id is null then raise exception 'fare reconciliation is unavailable'; end if;
  if reconciliation.status <> 'approved' then raise exception 'fare reconciliation must be approved'; end if;
  select * into booking from public.dispatch_bookings where booking_id = reconciliation.booking_id;
  select * into payment from public.rider_payment_attempts where booking_id = booking.booking_id and status = 'paid';
  if payment.payment_attempt_id is null then raise exception 'paid Rider payment is required'; end if;
  amount_value := abs(reconciliation.adjustment_minor);
  if amount_value = 0 then raise exception 'no fare difference requires settlement'; end if;
  direction_value := case when reconciliation.adjustment_minor < 0 then 'refund' else 'charge' end;
  select * into settlement from public.trip_fare_settlements where reconciliation_id = reconciliation.reconciliation_id for update;
  if settlement.status = 'succeeded' then return jsonb_build_object('alreadySettled', true, 'settlementId', settlement.settlement_id); end if;
  if settlement.settlement_id is null then
    insert into public.trip_fare_settlements (tenant_id, reconciliation_id, booking_id, direction, amount_minor, currency_code)
    values (reconciliation.tenant_id, reconciliation.reconciliation_id, reconciliation.booking_id, direction_value, amount_value, reconciliation.currency_code)
    returning * into settlement;
  else
    update public.trip_fare_settlements set status = 'pending', failure_message = null where settlement_id = settlement.settlement_id returning * into settlement;
  end if;
  select * into method from public.rider_saved_payment_methods where tenant_id = booking.tenant_id and rider_profile_id = booking.rider_profile_id and status = 'active';
  return jsonb_build_object('alreadySettled', false, 'settlementId', settlement.settlement_id,
    'direction', direction_value, 'amountMinor', amount_value, 'currencyCode', settlement.currency_code,
    'paymentIntentId', payment.provider_payment_intent_id,
    'customerId', method.provider_customer_id, 'paymentMethodId', method.provider_payment_method_id);
end;
$$;

create or replace function public.complete_trip_fare_settlement_internal(target_settlement_id uuid, provider_reference_value text)
returns boolean language plpgsql security definer set search_path = public as $$
declare settlement public.trip_fare_settlements; reconciliation public.trip_fare_reconciliations;
  booking public.dispatch_bookings; transaction_id_value uuid; cash_id uuid; revenue_id uuid; payable_id uuid;
  driver_part bigint; platform_part bigint; actor_id uuid;
begin
  select * into settlement from public.trip_fare_settlements where settlement_id = target_settlement_id for update;
  if settlement.settlement_id is null then raise exception 'fare settlement is unavailable'; end if;
  if settlement.status = 'succeeded' then return true; end if;
  select * into reconciliation from public.trip_fare_reconciliations where reconciliation_id = settlement.reconciliation_id;
  select * into booking from public.dispatch_bookings where booking_id = settlement.booking_id;
  if exists (select 1 from public.driver_earning_transfers where booking_id = booking.booking_id and status = 'succeeded')
    then raise exception 'Driver transfer already settled; use completed-trip recovery'; end if;
  select account_id into cash_id from public.ledger_accounts where tenant_id = settlement.tenant_id and account_code = 'cash_clearing';
  select account_id into revenue_id from public.ledger_accounts where tenant_id = settlement.tenant_id and account_code = 'platform_fees';
  driver_part := round(settlement.amount_minor::numeric * coalesce(booking.earnings_share_basis_points, 0) / 10000)::bigint;
  platform_part := settlement.amount_minor - driver_part;
  if driver_part > 0 then
    select account_id into payable_id from public.ledger_accounts where tenant_id = settlement.tenant_id and driver_profile_id = booking.current_driver_profile_id;
  end if;
  select person_id into actor_id from public.rider_profiles where rider_profile_id = booking.rider_profile_id;
  insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint, description, effective_at, booking_id, created_by_person_id)
  values (settlement.tenant_id, 'trip_fare_settlement:' || settlement.settlement_id::text,
    md5(jsonb_build_object('settlementId', settlement.settlement_id, 'amountMinor', settlement.amount_minor, 'providerReference', provider_reference_value)::text),
    case when settlement.direction = 'refund' then 'Post-trip fare difference refunded' else 'Post-trip fare difference collected' end,
    now(), settlement.booking_id, actor_id)
  on conflict (tenant_id, external_key) do nothing returning transaction_id into transaction_id_value;
  if transaction_id_value is not null then
    set constraints ledger_entries_balanced deferred;
    if settlement.direction = 'refund' then
      insert into public.ledger_entries (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
      values (settlement.tenant_id, transaction_id_value, revenue_id, 1, platform_part, 0),
        (settlement.tenant_id, transaction_id_value, coalesce(payable_id, revenue_id), 2, driver_part, 0),
        (settlement.tenant_id, transaction_id_value, cash_id, 3, 0, settlement.amount_minor);
    else
      insert into public.ledger_entries (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
      values (settlement.tenant_id, transaction_id_value, cash_id, 1, settlement.amount_minor, 0),
        (settlement.tenant_id, transaction_id_value, revenue_id, 2, 0, platform_part),
        (settlement.tenant_id, transaction_id_value, coalesce(payable_id, revenue_id), 3, 0, driver_part);
    end if;
    set constraints ledger_entries_balanced immediate;
  end if;
  update public.trip_fare_settlements set status = 'succeeded', provider_reference = provider_reference_value, settled_at = now() where settlement_id = settlement.settlement_id;
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason, correlation_id, resource_type, resource_id, metadata)
  values (settlement.tenant_id, 'pricing.trip_fare_settlement_succeeded', 'platform_system', actor_id, '{}', 'Post-trip fare difference settled.', gen_random_uuid(), 'trip_fare_settlement', settlement.settlement_id::text,
    jsonb_build_object('bookingId', settlement.booking_id, 'direction', settlement.direction, 'amountMinor', settlement.amount_minor));
  return true;
end;
$$;

create or replace function public.fail_trip_fare_settlement_internal(target_settlement_id uuid, failure_message_value text, balance_due_value boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.trip_fare_settlements set status = case when balance_due_value then 'balance_due' else 'failed' end,
    failure_message = left(failure_message_value, 500) where settlement_id = target_settlement_id and status <> 'succeeded';
  return found;
end;
$$;

revoke all on function public.prepare_trip_fare_settlement_internal(uuid) from public, anon, authenticated;
revoke all on function public.complete_trip_fare_settlement_internal(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_trip_fare_settlement_internal(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.prepare_trip_fare_settlement_internal(uuid) to service_role;
grant execute on function public.complete_trip_fare_settlement_internal(uuid, text) to service_role;
grant execute on function public.fail_trip_fare_settlement_internal(uuid, text, boolean) to service_role;
