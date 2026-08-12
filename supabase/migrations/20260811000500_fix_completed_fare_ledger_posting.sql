-- Ensure automated trip-fare postings insert both sides before balance validation.

create or replace function public.post_completed_trip_fare_to_ledger()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); transaction_id_value uuid; receivable_id uuid; revenue_id uuid; fingerprint text;
begin
  if new.status <> 'completed' or old.status = 'completed' or new.final_fare_minor is null then return new; end if;
  select account_id into receivable_id from public.ledger_accounts
    where tenant_id = new.tenant_id and account_code = 'rider_receivables';
  select account_id into revenue_id from public.ledger_accounts
    where tenant_id = new.tenant_id and account_code = 'platform_fees';
  if receivable_id is null or revenue_id is null then
    raise exception 'tenant ledger accounts are required before completing a priced trip';
  end if;
  fingerprint := md5(jsonb_build_object('bookingId', new.booking_id, 'fareMinor', new.final_fare_minor,
    'currency', new.fare_currency_code)::text);
  insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint, description,
    effective_at, booking_id, created_by_person_id)
  values (new.tenant_id, 'trip_fare:' || new.booking_id::text, fingerprint,
    'Completed trip fare', coalesce(new.completed_at, now()), new.booking_id, actor_id)
  on conflict (tenant_id, external_key) do nothing returning transaction_id into transaction_id_value;
  if transaction_id_value is null then return new; end if;

  set constraints ledger_entries_balanced deferred;
  insert into public.ledger_entries
    (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
  values
    (new.tenant_id, transaction_id_value, receivable_id, 1, new.final_fare_minor, 0),
    (new.tenant_id, transaction_id_value, revenue_id, 2, 0, new.final_fare_minor);
  set constraints ledger_entries_balanced immediate;

  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (new.tenant_id, 'pricing.trip_fare_posted', 'person', actor_id, '{}',
    'Completed trip fare posted to the ledger.', gen_random_uuid(), 'dispatch_booking', new.booking_id::text,
    jsonb_build_object('fare_amount_minor', new.final_fare_minor, 'currency_code', new.fare_currency_code,
      'ledger_transaction_id', transaction_id_value));
  return new;
end;
$$;
