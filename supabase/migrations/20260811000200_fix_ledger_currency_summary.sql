-- Correct the Ledger summary currency join after Ledger Foundation V1 deployment.

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

revoke all on function public.tenant_ledger_summary(uuid) from public, anon, authenticated;
grant execute on function public.tenant_ledger_summary(uuid) to authenticated;
