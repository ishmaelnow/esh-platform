-- Recover out-of-order dispute funds events from Stripe balance activity on any later replay.

alter table public.rider_payment_disputes
  add column fee_minor bigint not null default 0,
  add column funds_withdrawn_minor bigint not null default 0,
  add column funds_reinstated_minor bigint not null default 0,
  add constraint rider_payment_disputes_fee_check check (fee_minor >= 0),
  add constraint rider_payment_disputes_withdrawn_check check (funds_withdrawn_minor >= 0),
  add constraint rider_payment_disputes_reinstated_check check (funds_reinstated_minor >= 0);

create or replace function public.record_rider_payment_dispute_internal(
  provider_dispute_id_value text,
  provider_charge_id_value text,
  provider_payment_intent_id_value text,
  status_value text,
  reason_value text,
  currency_code_value text,
  amount_minor_value bigint,
  fee_minor_value bigint,
  withdrawn_minor_value bigint,
  reinstated_minor_value bigint,
  evidence_due_at_value timestamptz,
  event_type_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  payment public.rider_payment_attempts;
  dispute public.rider_payment_disputes;
  cash_id uuid;
  adjustment_id uuid;
  transaction_id_value uuid;
  prior_status text;
  financial_transition boolean := false;
begin
  if event_type_value not in ('charge.dispute.created', 'charge.dispute.updated',
    'charge.dispute.closed', 'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated')
    then raise exception 'Unsupported dispute event'; end if;
  if status_value not in ('warning_needs_response', 'warning_under_review', 'warning_closed',
    'needs_response', 'under_review', 'won', 'lost', 'prevented')
    then raise exception 'Unsupported dispute status'; end if;
  if amount_minor_value <= 0 or fee_minor_value < 0 or withdrawn_minor_value < 0
    or reinstated_minor_value < 0 then raise exception 'Dispute amounts are invalid'; end if;
  if withdrawn_minor_value > 0 and withdrawn_minor_value < amount_minor_value
    then raise exception 'Dispute withdrawal is less than disputed principal'; end if;

  select * into payment from public.rider_payment_attempts
    where provider_payment_intent_id = provider_payment_intent_id_value;
  if payment.payment_attempt_id is null then raise exception 'Disputed Rider payment is unavailable'; end if;
  if payment.currency_code <> upper(currency_code_value)
    then raise exception 'Dispute currency does not match the Rider payment'; end if;
  if amount_minor_value > payment.amount_minor
    then raise exception 'Dispute amount exceeds the Rider payment'; end if;

  select status into prior_status from public.rider_payment_disputes
    where provider = 'stripe' and provider_dispute_id = provider_dispute_id_value;
  insert into public.rider_payment_disputes
    (tenant_id, payment_attempt_id, booking_id, provider_dispute_id, provider_charge_id,
     status, reason, currency_code, amount_minor, fee_minor, evidence_due_at)
  values (payment.tenant_id, payment.payment_attempt_id, payment.booking_id,
    provider_dispute_id_value, provider_charge_id_value, status_value, left(reason_value, 120),
    upper(currency_code_value), amount_minor_value, fee_minor_value, evidence_due_at_value)
  on conflict (provider, provider_dispute_id) do update set
    booking_id = coalesce(public.rider_payment_disputes.booking_id, excluded.booking_id),
    status = excluded.status, reason = excluded.reason,
    fee_minor = greatest(public.rider_payment_disputes.fee_minor, excluded.fee_minor),
    evidence_due_at = excluded.evidence_due_at, updated_at = now()
  returning * into dispute;

  select account_id into cash_id from public.ledger_accounts
    where tenant_id = payment.tenant_id and account_code = 'cash_clearing';
  select account_id into adjustment_id from public.ledger_accounts
    where tenant_id = payment.tenant_id and account_code = 'operating_adjustments';
  if cash_id is null or adjustment_id is null
    then raise exception 'Required dispute ledger accounts are unavailable'; end if;

  if withdrawn_minor_value > 0 then
    insert into public.ledger_transactions
      (tenant_id, external_key, request_fingerprint, description, effective_at, booking_id)
    values (payment.tenant_id, 'payment_dispute_withdrawal:' || dispute.rider_payment_dispute_id::text,
      md5(provider_dispute_id_value || ':withdrawn:' || withdrawn_minor_value::text),
      'Stripe dispute funds withdrawn', now(), payment.booking_id)
    on conflict (tenant_id, external_key) do nothing returning transaction_id into transaction_id_value;
    if transaction_id_value is not null then
      financial_transition := true;
      set constraints ledger_entries_balanced deferred;
      insert into public.ledger_entries
        (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
      values (payment.tenant_id, transaction_id_value, adjustment_id, 1, withdrawn_minor_value, 0),
        (payment.tenant_id, transaction_id_value, cash_id, 2, 0, withdrawn_minor_value);
      set constraints ledger_entries_balanced immediate;
    end if;
    update public.rider_payment_disputes set
      fee_minor = greatest(fee_minor, fee_minor_value),
      funds_withdrawn_minor = greatest(funds_withdrawn_minor, withdrawn_minor_value),
      funds_withdrawn_at = coalesce(funds_withdrawn_at, now()), updated_at = now()
    where rider_payment_dispute_id = dispute.rider_payment_dispute_id;
  end if;

  transaction_id_value := null;
  if reinstated_minor_value > 0 then
    if not exists (select 1 from public.rider_payment_disputes
      where rider_payment_dispute_id = dispute.rider_payment_dispute_id and funds_withdrawn_minor > 0)
      then raise exception 'Dispute withdrawal must be recorded before reinstatement'; end if;
    insert into public.ledger_transactions
      (tenant_id, external_key, request_fingerprint, description, effective_at, booking_id)
    values (payment.tenant_id, 'payment_dispute_reinstatement:' || dispute.rider_payment_dispute_id::text,
      md5(provider_dispute_id_value || ':reinstated:' || reinstated_minor_value::text),
      'Stripe dispute funds reinstated', now(), payment.booking_id)
    on conflict (tenant_id, external_key) do nothing returning transaction_id into transaction_id_value;
    if transaction_id_value is not null then
      financial_transition := true;
      set constraints ledger_entries_balanced deferred;
      insert into public.ledger_entries
        (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
      values (payment.tenant_id, transaction_id_value, cash_id, 1, reinstated_minor_value, 0),
        (payment.tenant_id, transaction_id_value, adjustment_id, 2, 0, reinstated_minor_value);
      set constraints ledger_entries_balanced immediate;
    end if;
    update public.rider_payment_disputes set
      funds_reinstated_minor = greatest(funds_reinstated_minor, reinstated_minor_value),
      funds_reinstated_at = coalesce(funds_reinstated_at, now()), updated_at = now()
    where rider_payment_dispute_id = dispute.rider_payment_dispute_id;
  end if;

  if prior_status is distinct from status_value or financial_transition then
    insert into public.tenant_audit_events
      (tenant_id, event_name, actor_type, actor_platform_roles, reason, correlation_id,
       resource_type, resource_id, metadata)
    values (payment.tenant_id, 'payment.dispute_updated', 'platform_system', '{}',
      'Signature-verified Stripe dispute event recorded.', gen_random_uuid(),
      'rider_payment_dispute', dispute.rider_payment_dispute_id::text,
      jsonb_build_object('booking_id', payment.booking_id, 'status', status_value,
        'event_type', event_type_value, 'amount_minor', amount_minor_value,
        'fee_minor', fee_minor_value, 'withdrawn_minor', withdrawn_minor_value,
        'reinstated_minor', reinstated_minor_value));
  end if;
  return true;
end;
$$;

revoke all on function public.record_rider_payment_dispute_internal(
  text, text, text, text, text, text, bigint, bigint, bigint, bigint, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.record_rider_payment_dispute_internal(
  text, text, text, text, text, text, bigint, bigint, bigint, bigint, timestamptz, text
) to service_role;
