-- Immutable, linked reversals for tenant-admin manual ledger journals.

create table public.ledger_transaction_reversals (
  ledger_transaction_reversal_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  original_transaction_id uuid not null,
  reversal_transaction_id uuid not null,
  reason text not null,
  created_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint ledger_transaction_reversals_original_fk foreign key (tenant_id, original_transaction_id)
    references public.ledger_transactions (tenant_id, transaction_id) on delete restrict,
  constraint ledger_transaction_reversals_reversal_fk foreign key (tenant_id, reversal_transaction_id)
    references public.ledger_transactions (tenant_id, transaction_id) on delete restrict,
  constraint ledger_transaction_reversals_original_unique unique (original_transaction_id),
  constraint ledger_transaction_reversals_reversal_unique unique (reversal_transaction_id),
  constraint ledger_transaction_reversals_distinct_check check (original_transaction_id <> reversal_transaction_id),
  constraint ledger_transaction_reversals_reason_check check (length(btrim(reason)) between 5 and 500)
);

alter table public.ledger_transaction_reversals enable row level security;
create policy ledger_transaction_reversals_manager_select on public.ledger_transaction_reversals
  for select to authenticated using (public.can_manage_ledger(tenant_id));
grant select on public.ledger_transaction_reversals to authenticated;
grant all on public.ledger_transaction_reversals to service_role;
create trigger ledger_transaction_reversals_immutable
  before update or delete on public.ledger_transaction_reversals
  for each row execute function public.prevent_ledger_mutation();

create or replace function public.reverse_tenant_manual_ledger_transaction(
  target_tenant_id uuid, target_transaction_id uuid, reason_value text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id();
  original public.ledger_transactions;
  original_entry public.ledger_entries;
  reversal_id uuid;
  existing_reversal_id uuid;
  normalized_reason text := btrim(reason_value);
  sequence_value integer := 0;
begin
  if not public.can_manage_ledger(target_tenant_id) then raise exception 'ledger management access is required'; end if;
  if length(normalized_reason) not between 5 and 500 then raise exception 'reversal reason must be between 5 and 500 characters'; end if;
  select * into original from public.ledger_transactions
    where tenant_id = target_tenant_id and transaction_id = target_transaction_id;
  if original.transaction_id is null then raise exception 'ledger transaction was not found'; end if;
  if original.external_key not like 'manual:%' or original.booking_id is not null then
    raise exception 'only manual journals can be reversed from this workflow'; end if;
  select reversal_transaction_id into existing_reversal_id
    from public.ledger_transaction_reversals
    where tenant_id = target_tenant_id and original_transaction_id = target_transaction_id;
  if existing_reversal_id is not null then return existing_reversal_id; end if;

  insert into public.ledger_transactions
    (tenant_id, external_key, request_fingerprint, description, effective_at,
     booking_id, created_by_person_id)
  values (target_tenant_id, 'reversal:' || original.transaction_id::text,
    md5(jsonb_build_object('originalTransactionId', original.transaction_id,
      'reason', normalized_reason)::text), left('Reversal: ' || original.description, 240),
    now(), null, actor_id) returning transaction_id into reversal_id;

  set constraints ledger_entries_balanced deferred;
  for original_entry in select * from public.ledger_entries
    where tenant_id = target_tenant_id and transaction_id = original.transaction_id
    order by entry_sequence loop
    sequence_value := sequence_value + 1;
    insert into public.ledger_entries
      (tenant_id, transaction_id, account_id, entry_sequence,
       debit_amount_minor, credit_amount_minor, memo)
    values (target_tenant_id, reversal_id, original_entry.account_id, sequence_value,
      original_entry.credit_amount_minor, original_entry.debit_amount_minor,
      left('Reversal of ' || original.transaction_id::text, 240));
  end loop;
  set constraints ledger_entries_balanced immediate;

  insert into public.ledger_transaction_reversals
    (tenant_id, original_transaction_id, reversal_transaction_id, reason, created_by_person_id)
  values (target_tenant_id, original.transaction_id, reversal_id, normalized_reason, actor_id);
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (target_tenant_id, 'ledger.manual_transaction_reversed', 'person', actor_id, '{}',
    normalized_reason, gen_random_uuid(), 'ledger_transaction', reversal_id::text,
    jsonb_build_object('original_transaction_id', original.transaction_id,
      'reversal_transaction_id', reversal_id, 'original_external_key', original.external_key));
  return reversal_id;
end;
$$;

create or replace function public.tenant_ledger_summary(target_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.can_manage_ledger(target_tenant_id) then raise exception 'ledger management access is required'; end if;
  select jsonb_build_object(
    'settings', (select to_jsonb(setting) from (
      select setting.operating_currency as "operatingCurrency", currency.fraction_digits as "fractionDigits"
      from public.tenant_financial_settings setting
      join public.currency_codes currency on currency.currency_code = setting.operating_currency
      where setting.tenant_id = target_tenant_id) setting),
    'accounts', coalesce((select jsonb_agg(jsonb_build_object(
      'accountId', account.account_id, 'accountCode', account.account_code, 'accountName', account.account_name,
      'accountType', account.account_type, 'normalBalance', account.normal_balance, 'status', account.status,
      'balanceMinor', coalesce(balance.debits, 0) - coalesce(balance.credits, 0)
    ) order by account.account_code) from public.ledger_accounts account left join (
      select entry.account_id, sum(entry.debit_amount_minor) debits, sum(entry.credit_amount_minor) credits
      from public.ledger_entries entry where entry.tenant_id = target_tenant_id group by entry.account_id
    ) balance using (account_id) where account.tenant_id = target_tenant_id), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(jsonb_build_object(
      'transactionId', txn.transaction_id, 'externalKey', txn.external_key,
      'description', txn.description, 'effectiveAt', txn.effective_at,
      'bookingId', txn.booking_id, 'createdAt', txn.created_at,
      'reversalTransactionId', (select link.reversal_transaction_id
        from public.ledger_transaction_reversals link where link.original_transaction_id = txn.transaction_id),
      'reversesTransactionId', (select link.original_transaction_id
        from public.ledger_transaction_reversals link where link.reversal_transaction_id = txn.transaction_id),
      'reversalReason', (select link.reason from public.ledger_transaction_reversals link
        where link.original_transaction_id = txn.transaction_id or link.reversal_transaction_id = txn.transaction_id),
      'entries', (select jsonb_agg(jsonb_build_object('accountCode', account.account_code,
        'side', case when entry.debit_amount_minor > 0 then 'debit' else 'credit' end,
        'amountMinor', greatest(entry.debit_amount_minor, entry.credit_amount_minor), 'memo', entry.memo)
        order by entry.entry_sequence) from public.ledger_entries entry join public.ledger_accounts account using (account_id)
        where entry.transaction_id = txn.transaction_id)
    ) order by txn.effective_at desc, txn.created_at desc)
    from (select * from public.ledger_transactions where tenant_id = target_tenant_id
      order by effective_at desc, created_at desc limit 50) txn), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.reverse_tenant_manual_ledger_transaction(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reverse_tenant_manual_ledger_transaction(uuid, uuid, text) to authenticated;
