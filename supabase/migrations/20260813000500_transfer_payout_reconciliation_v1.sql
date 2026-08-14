-- Reconcile automatic Stripe bank payouts to the ESH transfers included in them.

alter table public.driver_bank_payouts
  add column reconciliation_status text not null default 'pending',
  add column matched_amount_minor bigint not null default 0,
  add column unmatched_amount_minor bigint not null default 0,
  add column reconciliation_error text,
  add column reconciled_at timestamptz,
  add constraint driver_bank_payouts_reconciliation_status_check check (
    reconciliation_status in ('pending', 'matched', 'partial', 'unmatched', 'unsupported_manual', 'failed')
  ),
  add constraint driver_bank_payouts_reconciliation_amounts_check check (
    matched_amount_minor >= 0 and unmatched_amount_minor >= 0
  ),
  add constraint driver_bank_payouts_tenant_driver_id_unique
    unique (tenant_id, driver_profile_id, driver_bank_payout_id);

alter table public.driver_earning_transfers
  add constraint driver_earning_transfers_tenant_driver_id_unique
    unique (tenant_id, driver_profile_id, driver_earning_transfer_id);

create table public.driver_payout_transfer_allocations (
  driver_payout_transfer_allocation_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  driver_profile_id uuid not null,
  driver_bank_payout_id uuid not null,
  driver_earning_transfer_id uuid not null,
  provider_balance_transaction_id text not null,
  amount_minor bigint not null,
  created_at timestamptz not null default now(),
  constraint driver_payout_transfer_allocations_driver_fk foreign key (tenant_id, driver_profile_id)
    references public.driver_profiles (tenant_id, driver_profile_id) on delete restrict,
  constraint driver_payout_transfer_allocations_payout_fk
    foreign key (tenant_id, driver_profile_id, driver_bank_payout_id)
    references public.driver_bank_payouts
      (tenant_id, driver_profile_id, driver_bank_payout_id) on delete restrict,
  constraint driver_payout_transfer_allocations_transfer_fk
    foreign key (tenant_id, driver_profile_id, driver_earning_transfer_id)
    references public.driver_earning_transfers
      (tenant_id, driver_profile_id, driver_earning_transfer_id) on delete restrict,
  constraint driver_payout_transfer_allocations_amount_check check (amount_minor > 0),
  constraint driver_payout_transfer_allocations_payout_transfer_unique
    unique (driver_bank_payout_id, driver_earning_transfer_id),
  constraint driver_payout_transfer_allocations_balance_transaction_unique
    unique (driver_bank_payout_id, provider_balance_transaction_id)
);

create index driver_payout_transfer_allocations_driver_idx
  on public.driver_payout_transfer_allocations (driver_profile_id, created_at desc);

alter table public.driver_payout_transfer_allocations enable row level security;
create policy driver_payout_transfer_allocations_driver_select on public.driver_payout_transfer_allocations
  for select to authenticated using (driver_profile_id = public.current_driver_profile_id());
create policy driver_payout_transfer_allocations_manager_select on public.driver_payout_transfer_allocations
  for select to authenticated using (public.can_manage_ledger(tenant_id));
grant select on public.driver_payout_transfer_allocations to authenticated;
grant all on public.driver_payout_transfer_allocations to service_role;

create or replace function public.reconcile_driver_bank_payout_internal(
  provider_account_id_value text,
  provider_payout_id_value text,
  provider_transfer_ids_value text[],
  provider_balance_transaction_ids_value text[]
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  payout public.driver_bank_payouts;
  payout_account public.driver_payout_accounts;
  transfer public.driver_earning_transfers;
  index_value integer;
  inserted_amount_value bigint;
  matched_value bigint := 0;
  status_value text;
  previous_status_value text;
  previous_matched_value bigint;
  previous_unmatched_value bigint;
begin
  if cardinality(provider_transfer_ids_value) is distinct from cardinality(provider_balance_transaction_ids_value)
    then raise exception 'Transfer and balance transaction counts must match'; end if;
  select * into payout_account from public.driver_payout_accounts
    where provider = 'stripe' and provider_account_id = provider_account_id_value;
  if payout_account.driver_payout_account_id is null then raise exception 'Driver payout account is unavailable'; end if;
  select * into payout from public.driver_bank_payouts
    where provider = 'stripe' and provider_payout_id = provider_payout_id_value
      and driver_profile_id = payout_account.driver_profile_id for update;
  if payout.driver_bank_payout_id is null then raise exception 'Driver bank payout is unavailable'; end if;
  previous_status_value := payout.reconciliation_status;
  previous_matched_value := payout.matched_amount_minor;
  previous_unmatched_value := payout.unmatched_amount_minor;
  if not payout.automatic then
    update public.driver_bank_payouts set reconciliation_status = 'unsupported_manual',
      matched_amount_minor = 0, unmatched_amount_minor = amount_minor,
      reconciliation_error = null, reconciled_at = now(), updated_at = now()
    where driver_bank_payout_id = payout.driver_bank_payout_id;
    return jsonb_build_object('status', 'unsupported_manual', 'matchedAmountMinor', 0,
      'unmatchedAmountMinor', payout.amount_minor, 'allocationCount', 0);
  end if;

  delete from public.driver_payout_transfer_allocations
    where driver_bank_payout_id = payout.driver_bank_payout_id;
  for index_value in 1..coalesce(cardinality(provider_transfer_ids_value), 0) loop
    inserted_amount_value := null;
    select * into transfer from public.driver_earning_transfers
      where provider = 'stripe' and provider_transfer_id = provider_transfer_ids_value[index_value]
        and tenant_id = payout.tenant_id and driver_profile_id = payout.driver_profile_id
        and currency_code = payout.currency_code and status = 'succeeded';
    if transfer.driver_earning_transfer_id is not null then
      insert into public.driver_payout_transfer_allocations
        (tenant_id, driver_profile_id, driver_bank_payout_id, driver_earning_transfer_id,
         provider_balance_transaction_id, amount_minor)
      values (payout.tenant_id, payout.driver_profile_id, payout.driver_bank_payout_id,
        transfer.driver_earning_transfer_id, provider_balance_transaction_ids_value[index_value],
        transfer.amount_minor) on conflict do nothing returning amount_minor into inserted_amount_value;
      matched_value := matched_value + coalesce(inserted_amount_value, 0);
    end if;
  end loop;
  status_value := case when matched_value = payout.amount_minor then 'matched'
    when matched_value > 0 then 'partial' else 'unmatched' end;
  update public.driver_bank_payouts set reconciliation_status = status_value,
    matched_amount_minor = matched_value,
    unmatched_amount_minor = greatest(amount_minor - matched_value, 0),
    reconciliation_error = null, reconciled_at = now(), updated_at = now()
  where driver_bank_payout_id = payout.driver_bank_payout_id;
  if previous_status_value is distinct from status_value
    or previous_matched_value is distinct from matched_value
    or previous_unmatched_value is distinct from greatest(payout.amount_minor - matched_value, 0) then
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (payout.tenant_id, 'payout.reconciled', 'platform_system', null, '{}',
    'Automatic Stripe payout reconciled to recorded Driver transfers.', gen_random_uuid(),
    'driver_bank_payout', payout.driver_bank_payout_id::text, jsonb_build_object(
      'driver_profile_id', payout.driver_profile_id, 'status', status_value,
      'payout_amount_minor', payout.amount_minor, 'matched_amount_minor', matched_value,
      'unmatched_amount_minor', greatest(payout.amount_minor - matched_value, 0)));
  end if;
  return jsonb_build_object('status', status_value, 'matchedAmountMinor', matched_value,
    'unmatchedAmountMinor', greatest(payout.amount_minor - matched_value, 0),
    'allocationCount', (select count(*) from public.driver_payout_transfer_allocations
      where driver_bank_payout_id = payout.driver_bank_payout_id));
end;
$$;

create or replace function public.fail_driver_bank_payout_reconciliation_internal(
  provider_account_id_value text, provider_payout_id_value text, failure_message_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.driver_bank_payouts payout set reconciliation_status = 'failed',
    reconciliation_error = left(failure_message_value, 500), updated_at = now()
  from public.driver_payout_accounts account
  where payout.driver_payout_account_id = account.driver_payout_account_id
    and account.provider = 'stripe' and account.provider_account_id = provider_account_id_value
    and payout.provider = 'stripe' and payout.provider_payout_id = provider_payout_id_value;
  return found;
end;
$$;

create or replace function public.my_driver_bank_payouts()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'payoutId', payout.driver_bank_payout_id, 'status', payout.status,
    'currencyCode', payout.currency_code, 'amountMinor', payout.amount_minor,
    'automatic', payout.automatic, 'method', payout.method,
    'expectedArrivalAt', payout.expected_arrival_at, 'failureCode', payout.failure_code,
    'failureMessage', payout.failure_message, 'providerCreatedAt', payout.provider_created_at,
    'paidAt', payout.paid_at, 'failedAt', payout.failed_at,
    'reconciliationStatus', payout.reconciliation_status,
    'matchedAmountMinor', payout.matched_amount_minor,
    'unmatchedAmountMinor', payout.unmatched_amount_minor,
    'reconciliationError', payout.reconciliation_error,
    'reconciledAt', payout.reconciled_at,
    'allocations', coalesce((select jsonb_agg(jsonb_build_object(
      'bookingId', transfer.booking_id, 'amountMinor', allocation.amount_minor,
      'transferredAt', transfer.transferred_at
    ) order by transfer.transferred_at)
    from public.driver_payout_transfer_allocations allocation
    join public.driver_earning_transfers transfer
      on transfer.driver_earning_transfer_id = allocation.driver_earning_transfer_id
    where allocation.driver_bank_payout_id = payout.driver_bank_payout_id), '[]'::jsonb)
  ) order by payout.provider_created_at desc), '[]'::jsonb)
  from public.driver_bank_payouts payout
  where payout.driver_profile_id = public.current_driver_profile_id();
$$;

revoke all on function public.reconcile_driver_bank_payout_internal(text, text, text[], text[]) from public, anon, authenticated;
revoke all on function public.fail_driver_bank_payout_reconciliation_internal(text, text, text) from public, anon, authenticated;
grant execute on function public.reconcile_driver_bank_payout_internal(text, text, text[], text[]) to service_role;
grant execute on function public.fail_driver_bank_payout_reconciliation_internal(text, text, text) to service_role;
