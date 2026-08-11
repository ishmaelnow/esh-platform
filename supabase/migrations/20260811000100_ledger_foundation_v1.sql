-- Tenant currency configuration and immutable balanced double-entry ledger foundation.

alter table public.tenant_capabilities drop constraint tenant_capabilities_key_check;
alter table public.tenant_capabilities add constraint tenant_capabilities_key_check check (
  capability_key in (
    'tenant.memberships', 'tenant.roles', 'tenant.audit', 'app.admin', 'app.rider', 'app.driver',
    'driver.management', 'vehicle.management', 'finance.ledger'
  )
);

create table public.currency_codes (
  currency_code text primary key,
  display_name text not null,
  fraction_digits smallint not null,
  constraint currency_codes_code_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint currency_codes_fraction_check check (fraction_digits between 0 and 4)
);

insert into public.currency_codes (currency_code, display_name, fraction_digits) values
  ('USD', 'United States dollar', 2),
  ('CAD', 'Canadian dollar', 2),
  ('MXN', 'Mexican peso', 2),
  ('EUR', 'Euro', 2),
  ('GBP', 'Pound sterling', 2),
  ('AUD', 'Australian dollar', 2);

create table public.tenant_financial_settings (
  tenant_id uuid primary key references public.tenants (tenant_id) on delete restrict,
  operating_currency text not null references public.currency_codes (currency_code) on delete restrict,
  created_at timestamptz not null default now(),
  created_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  constraint tenant_financial_settings_currency_check check (operating_currency ~ '^[A-Z]{3}$')
);

create table public.ledger_accounts (
  account_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  account_code text not null,
  account_name text not null,
  account_type text not null,
  normal_balance text not null,
  currency_code text not null references public.currency_codes (currency_code) on delete restrict,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  created_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  constraint ledger_accounts_code_check check (account_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint ledger_accounts_name_check check (length(btrim(account_name)) between 1 and 120),
  constraint ledger_accounts_type_check check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  constraint ledger_accounts_normal_check check (
    (account_type in ('asset', 'expense') and normal_balance = 'debit')
    or (account_type in ('liability', 'equity', 'revenue') and normal_balance = 'credit')
  ),
  constraint ledger_accounts_status_check check (status in ('active', 'closed')),
  constraint ledger_accounts_tenant_account_unique unique (tenant_id, account_id),
  constraint ledger_accounts_tenant_code_unique unique (tenant_id, account_code)
);

create table public.ledger_transactions (
  transaction_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  external_key text not null,
  request_fingerprint text not null,
  description text not null,
  effective_at timestamptz not null,
  booking_id uuid,
  created_at timestamptz not null default now(),
  created_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  constraint ledger_transactions_external_key_check check (length(btrim(external_key)) between 1 and 120),
  constraint ledger_transactions_description_check check (length(btrim(description)) between 1 and 240),
  constraint ledger_transactions_tenant_transaction_unique unique (tenant_id, transaction_id),
  constraint ledger_transactions_external_key_unique unique (tenant_id, external_key),
  constraint ledger_transactions_booking_fk foreign key (tenant_id, booking_id)
    references public.dispatch_bookings (tenant_id, booking_id) on delete restrict
);

create table public.ledger_entries (
  entry_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  transaction_id uuid not null,
  account_id uuid not null,
  entry_sequence smallint not null,
  debit_amount_minor bigint not null default 0,
  credit_amount_minor bigint not null default 0,
  memo text,
  created_at timestamptz not null default now(),
  constraint ledger_entries_transaction_fk foreign key (tenant_id, transaction_id)
    references public.ledger_transactions (tenant_id, transaction_id) on delete restrict,
  constraint ledger_entries_account_fk foreign key (tenant_id, account_id)
    references public.ledger_accounts (tenant_id, account_id) on delete restrict,
  constraint ledger_entries_amount_check check (
    (debit_amount_minor > 0 and credit_amount_minor = 0)
    or (credit_amount_minor > 0 and debit_amount_minor = 0)
  ),
  constraint ledger_entries_sequence_check check (entry_sequence > 0),
  constraint ledger_entries_memo_check check (memo is null or length(memo) <= 240),
  constraint ledger_entries_transaction_sequence_unique unique (transaction_id, entry_sequence)
);

create index ledger_transactions_tenant_effective_idx
  on public.ledger_transactions (tenant_id, effective_at desc, created_at desc);
create index ledger_entries_account_idx on public.ledger_entries (account_id, created_at);

create or replace function public.can_manage_ledger(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_tenant_role(target_tenant_id, array['tenant_owner', 'tenant_admin'])
    and public.tenant_capability_enabled(target_tenant_id, 'finance.ledger');
$$;

create or replace function public.prevent_ledger_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'posted ledger records are immutable';
end;
$$;

create trigger ledger_transactions_immutable before update or delete on public.ledger_transactions
  for each row execute function public.prevent_ledger_mutation();
create trigger ledger_entries_immutable before update or delete on public.ledger_entries
  for each row execute function public.prevent_ledger_mutation();
create trigger ledger_accounts_immutable before update or delete on public.ledger_accounts
  for each row execute function public.prevent_ledger_mutation();
create trigger tenant_financial_settings_immutable before update or delete on public.tenant_financial_settings
  for each row execute function public.prevent_ledger_mutation();

create or replace function public.verify_ledger_transaction_balanced()
returns trigger language plpgsql set search_path = public as $$
declare target_transaction_id uuid := coalesce(new.transaction_id, old.transaction_id);
begin
  if not exists (
    select 1 from public.ledger_entries entry where entry.transaction_id = target_transaction_id
    group by entry.transaction_id
    having count(*) >= 2 and sum(entry.debit_amount_minor) = sum(entry.credit_amount_minor)
  ) then raise exception 'ledger transaction must contain at least two balanced entries'; end if;
  return null;
end;
$$;

create constraint trigger ledger_entries_balanced
after insert or update or delete on public.ledger_entries deferrable initially deferred
for each row execute function public.verify_ledger_transaction_balanced();

alter table public.currency_codes enable row level security;
alter table public.tenant_financial_settings enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries enable row level security;
create policy currency_codes_authenticated_select on public.currency_codes
  for select to authenticated using (true);
create policy tenant_financial_settings_manager_select on public.tenant_financial_settings
  for select to authenticated using (public.can_manage_ledger(tenant_id));
create policy ledger_accounts_manager_select on public.ledger_accounts
  for select to authenticated using (public.can_manage_ledger(tenant_id));
create policy ledger_transactions_manager_select on public.ledger_transactions
  for select to authenticated using (public.can_manage_ledger(tenant_id));
create policy ledger_entries_manager_select on public.ledger_entries
  for select to authenticated using (public.can_manage_ledger(tenant_id));

grant select on public.currency_codes, public.tenant_financial_settings, public.ledger_accounts,
  public.ledger_transactions, public.ledger_entries to authenticated;
grant all on public.currency_codes, public.tenant_financial_settings, public.ledger_accounts,
  public.ledger_transactions, public.ledger_entries to service_role;

create or replace function public.initialize_tenant_ledger(
  target_tenant_id uuid,
  target_currency_code text default 'USD'
)
returns boolean language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); normalized_currency text := upper(btrim(target_currency_code));
begin
  if not public.can_manage_ledger(target_tenant_id) then raise exception 'ledger management access is required'; end if;
  if not exists (select 1 from public.currency_codes where currency_code = normalized_currency)
    then raise exception 'unsupported operating currency'; end if;
  if exists (select 1 from public.tenant_financial_settings where tenant_id = target_tenant_id) then
    if (select operating_currency from public.tenant_financial_settings where tenant_id = target_tenant_id) <> normalized_currency
      then raise exception 'operating currency cannot change after ledger initialization'; end if;
    return true;
  end if;
  insert into public.tenant_financial_settings (tenant_id, operating_currency, created_by_person_id)
    values (target_tenant_id, normalized_currency, actor_id);
  insert into public.ledger_accounts
    (tenant_id, account_code, account_name, account_type, normal_balance, currency_code, created_by_person_id)
  values
    (target_tenant_id, 'cash_clearing', 'Cash and payment clearing', 'asset', 'debit', normalized_currency, actor_id),
    (target_tenant_id, 'rider_receivables', 'Rider receivables', 'asset', 'debit', normalized_currency, actor_id),
    (target_tenant_id, 'driver_payables', 'Driver payables', 'liability', 'credit', normalized_currency, actor_id),
    (target_tenant_id, 'platform_fees', 'Platform fee revenue', 'revenue', 'credit', normalized_currency, actor_id),
    (target_tenant_id, 'operating_adjustments', 'Operating adjustments', 'expense', 'debit', normalized_currency, actor_id)
  on conflict (tenant_id, account_code) do nothing;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (target_tenant_id, 'ledger.initialized', 'person', actor_id, '{}',
    'Tenant ledger initialized.', gen_random_uuid(), 'tenant_ledger', target_tenant_id::text,
    jsonb_build_object('operating_currency', normalized_currency));
  return true;
end;
$$;

create or replace function public.post_tenant_ledger_transaction(
  target_tenant_id uuid,
  external_key_value text,
  description_value text,
  effective_at_value timestamptz,
  entries_value jsonb,
  target_booking_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := public.current_person_id(); new_transaction_id uuid; existing_transaction_id uuid;
  existing_fingerprint text; request_fingerprint_value text;
  entry_value jsonb; entry_index integer := 0; debit_total numeric := 0; credit_total numeric := 0;
  target_account public.ledger_accounts; amount_value bigint; side_value text;
begin
  if not public.can_manage_ledger(target_tenant_id) then raise exception 'ledger management access is required'; end if;
  request_fingerprint_value := md5(jsonb_build_object(
    'description', btrim(description_value), 'effectiveAt', effective_at_value,
    'bookingId', target_booking_id, 'entries', entries_value)::text);
  select transaction_id, request_fingerprint into existing_transaction_id, existing_fingerprint
    from public.ledger_transactions
    where tenant_id = target_tenant_id and external_key = btrim(external_key_value);
  if existing_transaction_id is not null then
    if existing_fingerprint <> request_fingerprint_value then
      raise exception 'external key already exists with different transaction content'; end if;
    return existing_transaction_id;
  end if;
  if length(btrim(description_value)) not between 1 and 240 then raise exception 'transaction description is required'; end if;
  if jsonb_typeof(entries_value) <> 'array' or jsonb_array_length(entries_value) < 2
    then raise exception 'at least two ledger entries are required'; end if;
  insert into public.ledger_transactions
    (tenant_id, external_key, request_fingerprint, description, effective_at, booking_id, created_by_person_id)
  values (target_tenant_id, btrim(external_key_value), request_fingerprint_value,
    btrim(description_value), effective_at_value, target_booking_id, actor_id)
  returning transaction_id into new_transaction_id;
  for entry_value in select value from jsonb_array_elements(entries_value) loop
    entry_index := entry_index + 1;
    side_value := entry_value->>'side';
    begin amount_value := (entry_value->>'amountMinor')::bigint;
    exception when others then raise exception 'ledger entry amount must be a whole minor-unit value'; end;
    if amount_value <= 0 or side_value not in ('debit', 'credit') then
      raise exception 'ledger entry side and positive amount are required'; end if;
    select * into target_account from public.ledger_accounts
      where tenant_id = target_tenant_id and account_code = entry_value->>'accountCode' and status = 'active';
    if target_account.account_id is null then raise exception 'active ledger account % is required', entry_value->>'accountCode'; end if;
    insert into public.ledger_entries
      (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor, memo)
    values (target_tenant_id, new_transaction_id, target_account.account_id, entry_index,
      case when side_value = 'debit' then amount_value else 0 end,
      case when side_value = 'credit' then amount_value else 0 end,
      nullif(btrim(entry_value->>'memo'), ''));
    if side_value = 'debit' then debit_total := debit_total + amount_value;
    else credit_total := credit_total + amount_value; end if;
  end loop;
  if debit_total <> credit_total then raise exception 'ledger transaction debits and credits must balance'; end if;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (target_tenant_id, 'ledger.transaction_posted', 'person', actor_id, '{}',
    'Balanced ledger transaction posted.', gen_random_uuid(), 'ledger_transaction', new_transaction_id::text,
    jsonb_build_object('external_key', btrim(external_key_value), 'amount_minor', debit_total));
  return new_transaction_id;
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
      from public.tenant_financial_settings setting join public.currency_codes currency using (currency_code)
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

insert into public.tenant_capabilities
  (tenant_id, capability_key, enabled, enabled_at, disabled_at, updated_by_person_id)
select capability.tenant_id, 'finance.ledger', capability.enabled,
  case when capability.enabled then now() else null end,
  case when capability.enabled then null else now() end, capability.updated_by_person_id
from public.tenant_capabilities capability where capability.capability_key = 'driver.management'
on conflict (tenant_id, capability_key) do nothing;

create or replace function public.seed_driver_management_capability()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tenant_capabilities (
    tenant_id, capability_key, enabled, disabled_at, updated_by_person_id
  ) values
    (new.tenant_id, 'driver.management', false, now(), public.current_person_id()),
    (new.tenant_id, 'vehicle.management', false, now(), public.current_person_id()),
    (new.tenant_id, 'finance.ledger', false, now(), public.current_person_id())
  on conflict (tenant_id, capability_key) do nothing;
  return new;
end;
$$;

revoke all on function public.can_manage_ledger(uuid) from public, anon, authenticated;
revoke all on function public.initialize_tenant_ledger(uuid, text) from public, anon, authenticated;
revoke all on function public.post_tenant_ledger_transaction(uuid, text, text, timestamptz, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.tenant_ledger_summary(uuid) from public, anon, authenticated;
grant execute on function public.can_manage_ledger(uuid) to authenticated;
grant execute on function public.initialize_tenant_ledger(uuid, text) to authenticated;
grant execute on function public.post_tenant_ledger_transaction(uuid, text, text, timestamptz, jsonb, uuid) to authenticated;
grant execute on function public.tenant_ledger_summary(uuid) to authenticated;
