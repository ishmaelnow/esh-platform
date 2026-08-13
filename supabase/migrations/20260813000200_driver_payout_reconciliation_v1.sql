-- Reconcile Stripe connected-account payouts to external bank accounts.

create table public.driver_bank_payouts (
  driver_bank_payout_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  driver_profile_id uuid not null,
  driver_payout_account_id uuid not null,
  provider text not null default 'stripe',
  provider_payout_id text not null,
  status text not null,
  currency_code text not null references public.currency_codes (currency_code) on delete restrict,
  amount_minor bigint not null,
  automatic boolean not null default false,
  method text,
  destination_reference text,
  expected_arrival_at timestamptz,
  failure_code text,
  failure_message text,
  provider_created_at timestamptz not null,
  paid_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_bank_payouts_driver_fk foreign key (tenant_id, driver_profile_id)
    references public.driver_profiles (tenant_id, driver_profile_id) on delete restrict,
  constraint driver_bank_payouts_account_fk foreign key (driver_payout_account_id)
    references public.driver_payout_accounts (driver_payout_account_id) on delete restrict,
  constraint driver_bank_payouts_status_check check (status in ('pending', 'in_transit', 'paid', 'failed', 'canceled')),
  constraint driver_bank_payouts_amount_check check (amount_minor > 0),
  constraint driver_bank_payouts_provider_unique unique (provider, provider_payout_id)
);

create index driver_bank_payouts_driver_created_idx
  on public.driver_bank_payouts (driver_profile_id, provider_created_at desc);

alter table public.driver_bank_payouts enable row level security;
create policy driver_bank_payouts_driver_select on public.driver_bank_payouts
  for select to authenticated using (driver_profile_id = public.current_driver_profile_id());
create policy driver_bank_payouts_manager_select on public.driver_bank_payouts
  for select to authenticated using (public.can_manage_ledger(tenant_id));
grant select on public.driver_bank_payouts to authenticated;
grant all on public.driver_bank_payouts to service_role;

create or replace function public.record_driver_bank_payout_internal(
  provider_account_id_value text, provider_payout_id_value text, status_value text,
  currency_code_value text, amount_minor_value bigint, automatic_value boolean,
  method_value text, destination_reference_value text, expected_arrival_at_value timestamptz,
  failure_code_value text, failure_message_value text, provider_created_at_value timestamptz
)
returns boolean language plpgsql security definer set search_path = public as $$
declare payout_account public.driver_payout_accounts; payout_id uuid; previous_status text;
begin
  select * into payout_account from public.driver_payout_accounts
    where provider = 'stripe' and provider_account_id = provider_account_id_value;
  if payout_account.driver_payout_account_id is null then raise exception 'Driver payout account is unavailable'; end if;
  if status_value not in ('pending', 'in_transit', 'paid', 'failed', 'canceled')
    then raise exception 'Unsupported payout status'; end if;
  if amount_minor_value <= 0 then raise exception 'Payout amount must be positive'; end if;
  select driver_bank_payout_id, status into payout_id, previous_status
    from public.driver_bank_payouts where provider = 'stripe' and provider_payout_id = provider_payout_id_value
    for update;
  insert into public.driver_bank_payouts
    (tenant_id, driver_profile_id, driver_payout_account_id, provider_payout_id, status,
     currency_code, amount_minor, automatic, method, destination_reference, expected_arrival_at,
     failure_code, failure_message, provider_created_at, paid_at, failed_at)
  values (payout_account.tenant_id, payout_account.driver_profile_id,
    payout_account.driver_payout_account_id, provider_payout_id_value, status_value,
    upper(currency_code_value), amount_minor_value, automatic_value, left(method_value, 40),
    left(destination_reference_value, 120), expected_arrival_at_value, left(failure_code_value, 120),
    left(failure_message_value, 500), provider_created_at_value,
    case when status_value = 'paid' then now() end,
    case when status_value = 'failed' then now() end)
  on conflict (provider, provider_payout_id) do update set
    status = excluded.status, expected_arrival_at = excluded.expected_arrival_at,
    failure_code = excluded.failure_code, failure_message = excluded.failure_message,
    paid_at = case when excluded.status = 'paid' then coalesce(driver_bank_payouts.paid_at, now()) else driver_bank_payouts.paid_at end,
    failed_at = case when excluded.status = 'failed' then coalesce(driver_bank_payouts.failed_at, now()) else driver_bank_payouts.failed_at end,
    updated_at = now()
  returning driver_bank_payout_id into payout_id;
  if previous_status is distinct from status_value then
    insert into public.tenant_audit_events
      (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
       correlation_id, resource_type, resource_id, metadata)
    values (payout_account.tenant_id, 'payout.bank_' || status_value, 'platform_system', null, '{}',
      'Stripe connected-account bank payout status recorded from a verified event.', gen_random_uuid(),
      'driver_bank_payout', payout_id::text, jsonb_build_object(
        'driver_profile_id', payout_account.driver_profile_id, 'amount_minor', amount_minor_value,
        'currency_code', upper(currency_code_value), 'status', status_value));
  end if;
  return true;
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
    'paidAt', payout.paid_at, 'failedAt', payout.failed_at
  ) order by payout.provider_created_at desc), '[]'::jsonb)
  from public.driver_bank_payouts payout
  where payout.driver_profile_id = public.current_driver_profile_id();
$$;

revoke all on function public.record_driver_bank_payout_internal(text, text, text, text, bigint, boolean, text, text, timestamptz, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.my_driver_bank_payouts() from public, anon, authenticated;
grant execute on function public.record_driver_bank_payout_internal(text, text, text, text, bigint, boolean, text, text, timestamptz, text, text, timestamptz) to service_role;
grant execute on function public.my_driver_bank_payouts() to authenticated;
