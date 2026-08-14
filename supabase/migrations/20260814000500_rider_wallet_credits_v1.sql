-- Tenant-scoped Rider stored credit with immutable ledger backing and split wallet/card checkout.

insert into public.ledger_accounts
  (tenant_id, account_code, account_name, account_type, normal_balance, currency_code, created_by_person_id)
select setting.tenant_id, 'rider_wallet_credits', 'Rider wallet credits', 'liability', 'credit',
  setting.operating_currency, setting.created_by_person_id
from public.tenant_financial_settings setting
on conflict (tenant_id, account_code) do nothing;

create or replace function public.seed_rider_financial_accounts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ledger_accounts
    (tenant_id, account_code, account_name, account_type, normal_balance, currency_code, created_by_person_id)
  values
    (new.tenant_id, 'rider_prepayments', 'Rider prepayments', 'liability', 'credit', new.operating_currency, new.created_by_person_id),
    (new.tenant_id, 'rider_wallet_credits', 'Rider wallet credits', 'liability', 'credit', new.operating_currency, new.created_by_person_id)
  on conflict (tenant_id, account_code) do nothing;
  return new;
end;
$$;
create trigger tenant_financial_settings_seed_rider_accounts
after insert on public.tenant_financial_settings for each row execute function public.seed_rider_financial_accounts();

create table public.rider_wallet_entries (
  rider_wallet_entry_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  rider_profile_id uuid not null,
  direction text not null,
  entry_type text not null,
  currency_code text not null references public.currency_codes (currency_code) on delete restrict,
  amount_minor bigint not null,
  description text not null,
  external_key text not null,
  quote_id uuid,
  booking_id uuid,
  created_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint rider_wallet_entries_rider_fk foreign key (tenant_id, rider_profile_id)
    references public.rider_profiles (tenant_id, rider_profile_id) on delete restrict,
  constraint rider_wallet_entries_quote_fk foreign key (tenant_id, quote_id)
    references public.trip_price_quotes (tenant_id, quote_id) on delete restrict,
  constraint rider_wallet_entries_booking_fk foreign key (tenant_id, booking_id)
    references public.dispatch_bookings (tenant_id, booking_id) on delete restrict,
  constraint rider_wallet_entries_direction_check check (direction in ('credit', 'debit')),
  constraint rider_wallet_entries_type_check check (entry_type in ('admin_credit', 'trip_applied', 'trip_restored')),
  constraint rider_wallet_entries_amount_check check (amount_minor > 0),
  constraint rider_wallet_entries_description_check check (char_length(btrim(description)) between 5 and 500),
  constraint rider_wallet_entries_external_unique unique (tenant_id, external_key)
);

create index rider_wallet_entries_rider_created_idx
  on public.rider_wallet_entries (tenant_id, rider_profile_id, created_at desc);

create table public.rider_wallet_quote_allocations (
  rider_wallet_quote_allocation_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  rider_profile_id uuid not null,
  quote_id uuid not null,
  booking_id uuid,
  currency_code text not null references public.currency_codes (currency_code) on delete restrict,
  amount_minor bigint not null,
  status text not null default 'reserved',
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  restored_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint rider_wallet_allocations_rider_fk foreign key (tenant_id, rider_profile_id)
    references public.rider_profiles (tenant_id, rider_profile_id) on delete restrict,
  constraint rider_wallet_allocations_quote_fk foreign key (tenant_id, quote_id)
    references public.trip_price_quotes (tenant_id, quote_id) on delete restrict,
  constraint rider_wallet_allocations_booking_fk foreign key (tenant_id, booking_id)
    references public.dispatch_bookings (tenant_id, booking_id) on delete restrict,
  constraint rider_wallet_allocations_amount_check check (amount_minor > 0),
  constraint rider_wallet_allocations_status_check check (status in ('reserved', 'applied', 'restored')),
  constraint rider_wallet_allocations_quote_unique unique (quote_id)
);

alter table public.rider_wallet_entries enable row level security;
alter table public.rider_wallet_quote_allocations enable row level security;
create policy rider_wallet_entries_rider_select on public.rider_wallet_entries for select to authenticated
  using (rider_profile_id = public.current_rider_profile_id(tenant_id));
create policy rider_wallet_entries_manager_select on public.rider_wallet_entries for select to authenticated
  using (public.can_manage_ledger(tenant_id));
create policy rider_wallet_allocations_rider_select on public.rider_wallet_quote_allocations for select to authenticated
  using (rider_profile_id = public.current_rider_profile_id(tenant_id));
create policy rider_wallet_allocations_manager_select on public.rider_wallet_quote_allocations for select to authenticated
  using (public.can_manage_ledger(tenant_id));
grant select on public.rider_wallet_entries, public.rider_wallet_quote_allocations to authenticated;
grant all on public.rider_wallet_entries, public.rider_wallet_quote_allocations to service_role;

create trigger rider_wallet_entries_immutable before update or delete on public.rider_wallet_entries
for each row execute function public.prevent_ledger_mutation();

create or replace function public.prevent_unsupported_wallet_completed_refund()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.refund_scope = 'completed_trip' and exists (
    select 1 from public.rider_wallet_quote_allocations allocation
    where allocation.booking_id = new.booking_id and allocation.status = 'applied'
  ) then raise exception 'Completed trips funded with wallet credit require reviewed wallet recovery'; end if;
  return new;
end;
$$;
create trigger rider_payment_refunds_wallet_completed_guard
before insert or update of refund_scope on public.rider_payment_refunds
for each row execute function public.prevent_unsupported_wallet_completed_refund();

create or replace function public.issue_rider_wallet_credit(
  target_tenant_id uuid, target_rider_profile_id uuid, amount_minor_value bigint,
  reason_value text, request_key_value text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); rider public.rider_profiles; setting public.tenant_financial_settings;
  wallet_account_id uuid; adjustment_account_id uuid; transaction_id_value uuid; wallet_entry_id uuid;
begin
  if not public.can_manage_ledger(target_tenant_id) then raise exception 'ledger management access is required'; end if;
  if amount_minor_value <= 0 then raise exception 'credit amount must be greater than zero'; end if;
  if char_length(btrim(reason_value)) not between 5 and 500 then raise exception 'credit reason must be between 5 and 500 characters'; end if;
  if char_length(btrim(request_key_value)) not between 8 and 200 then raise exception 'credit request key is invalid'; end if;
  select * into rider from public.rider_profiles where tenant_id = target_tenant_id and rider_profile_id = target_rider_profile_id;
  if rider.rider_profile_id is null then raise exception 'Rider is unavailable'; end if;
  select * into setting from public.tenant_financial_settings where tenant_id = target_tenant_id;
  if setting.tenant_id is null then raise exception 'tenant ledger must be initialized'; end if;
  select rider_wallet_entry_id into wallet_entry_id from public.rider_wallet_entries
    where tenant_id = target_tenant_id and external_key = 'wallet_credit:' || btrim(request_key_value);
  if wallet_entry_id is not null then return wallet_entry_id; end if;
  select account_id into wallet_account_id from public.ledger_accounts where tenant_id = target_tenant_id and account_code = 'rider_wallet_credits';
  select account_id into adjustment_account_id from public.ledger_accounts where tenant_id = target_tenant_id and account_code = 'operating_adjustments';
  insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint, description, effective_at, created_by_person_id)
  values (target_tenant_id, 'wallet_credit:' || btrim(request_key_value),
    md5(jsonb_build_object('riderId', target_rider_profile_id, 'amountMinor', amount_minor_value,
      'currency', setting.operating_currency, 'reason', btrim(reason_value))::text),
    'Rider wallet credit issued', now(), actor_id)
  returning transaction_id into transaction_id_value;
  set constraints ledger_entries_balanced deferred;
  insert into public.ledger_entries (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
  values (target_tenant_id, transaction_id_value, adjustment_account_id, 1, amount_minor_value, 0),
    (target_tenant_id, transaction_id_value, wallet_account_id, 2, 0, amount_minor_value);
  set constraints ledger_entries_balanced immediate;
  insert into public.rider_wallet_entries (tenant_id, rider_profile_id, direction, entry_type, currency_code,
    amount_minor, description, external_key, created_by_person_id)
  values (target_tenant_id, target_rider_profile_id, 'credit', 'admin_credit', setting.operating_currency,
    amount_minor_value, btrim(reason_value), 'wallet_credit:' || btrim(request_key_value), actor_id)
  returning rider_wallet_entry_id into wallet_entry_id;
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_person_id,
    actor_platform_roles, reason, correlation_id, resource_type, resource_id, metadata)
  values (target_tenant_id, 'rider_wallet.credit_issued', 'person', actor_id, '{}', btrim(reason_value),
    gen_random_uuid(), 'rider_wallet_entry', wallet_entry_id::text,
    jsonb_build_object('rider_profile_id', target_rider_profile_id, 'amount_minor', amount_minor_value,
      'currency_code', setting.operating_currency));
  return wallet_entry_id;
end;
$$;

create or replace function public.my_rider_wallet(target_tenant_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare target_tenant_id uuid; rider_id uuid; currency_value text; fraction_digits_value integer; balance_value bigint; reserved_value bigint;
begin
  select config.tenant_id into target_tenant_id from public.tenant_configurations config where config.tenant_slug = lower(btrim(target_tenant_slug));
  rider_id := public.current_rider_profile_id(target_tenant_id);
  if rider_id is null then raise exception 'Rider access is required'; end if;
  select operating_currency into currency_value from public.tenant_financial_settings where tenant_id = target_tenant_id;
  select fraction_digits into fraction_digits_value from public.currency_codes where currency_code = currency_value;
  select coalesce(sum(case when direction = 'credit' then amount_minor else -amount_minor end), 0)
    into balance_value from public.rider_wallet_entries where tenant_id = target_tenant_id and rider_profile_id = rider_id;
  select coalesce(sum(allocation.amount_minor), 0) into reserved_value
    from public.rider_wallet_quote_allocations allocation join public.trip_price_quotes quote using (quote_id)
    where allocation.tenant_id = target_tenant_id and allocation.rider_profile_id = rider_id
      and allocation.status = 'reserved' and quote.status = 'quoted' and quote.expires_at > now();
  return jsonb_build_object('currencyCode', currency_value, 'fractionDigits', fraction_digits_value, 'balanceMinor', balance_value,
    'availableMinor', greatest(balance_value - reserved_value, 0),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('entryId', entry.rider_wallet_entry_id,
      'direction', entry.direction, 'entryType', entry.entry_type, 'amountMinor', entry.amount_minor,
      'description', entry.description, 'bookingId', entry.booking_id, 'createdAt', entry.created_at)
      order by entry.created_at desc) from public.rider_wallet_entries entry
      where entry.tenant_id = target_tenant_id and entry.rider_profile_id = rider_id), '[]'::jsonb));
end;
$$;

create or replace function public.prepare_rider_wallet_checkout_internal(target_quote_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare quote public.trip_price_quotes; allocation public.rider_wallet_quote_allocations;
  balance_value bigint; reserved_elsewhere bigint; allocation_value bigint;
begin
  select * into quote from public.trip_price_quotes where quote_id = target_quote_id for update;
  if quote.quote_id is null or quote.status <> 'quoted' or quote.expires_at <= now() then raise exception 'active price quote is required'; end if;
  select * into allocation from public.rider_wallet_quote_allocations where quote_id = quote.quote_id;
  if allocation.rider_wallet_quote_allocation_id is not null then
    return jsonb_build_object('walletAmountMinor', allocation.amount_minor,
      'cardAmountMinor', quote.fare_amount_minor - allocation.amount_minor);
  end if;
  perform 1 from public.rider_profiles where rider_profile_id = quote.rider_profile_id for update;
  select coalesce(sum(case when direction = 'credit' then amount_minor else -amount_minor end), 0)
    into balance_value from public.rider_wallet_entries
    where tenant_id = quote.tenant_id and rider_profile_id = quote.rider_profile_id;
  select coalesce(sum(existing.amount_minor), 0) into reserved_elsewhere
    from public.rider_wallet_quote_allocations existing join public.trip_price_quotes reserved_quote using (quote_id)
    where existing.tenant_id = quote.tenant_id and existing.rider_profile_id = quote.rider_profile_id
      and existing.status = 'reserved' and reserved_quote.status = 'quoted' and reserved_quote.expires_at > now();
  allocation_value := least(greatest(balance_value - reserved_elsewhere, 0), quote.fare_amount_minor);
  if allocation_value < quote.fare_amount_minor and quote.fare_amount_minor - allocation_value < 50 then
    allocation_value := greatest(quote.fare_amount_minor - 50, 0);
  end if;
  if allocation_value > 0 then
    insert into public.rider_wallet_quote_allocations
      (tenant_id, rider_profile_id, quote_id, currency_code, amount_minor)
    values (quote.tenant_id, quote.rider_profile_id, quote.quote_id, quote.currency_code, allocation_value);
  end if;
  return jsonb_build_object('walletAmountMinor', allocation_value,
    'cardAmountMinor', quote.fare_amount_minor - allocation_value);
end;
$$;

create or replace function public.register_rider_checkout_internal(target_quote_id uuid, checkout_session_id_value text)
returns uuid language plpgsql security definer set search_path = public as $$
declare quote public.trip_price_quotes; allocation_minor bigint := 0; attempt_id uuid; card_minor bigint;
begin
  select * into quote from public.trip_price_quotes where quote_id = target_quote_id;
  if quote.quote_id is null or quote.status <> 'quoted' or quote.expires_at <= now() then raise exception 'active price quote is required'; end if;
  select amount_minor into allocation_minor from public.rider_wallet_quote_allocations where quote_id = quote.quote_id and status = 'reserved';
  allocation_minor := coalesce(allocation_minor, 0); card_minor := quote.fare_amount_minor - allocation_minor;
  if card_minor <= 0 then raise exception 'Stripe payment is not required for this quote'; end if;
  select payment_attempt_id into attempt_id from public.rider_payment_attempts where quote_id = quote.quote_id;
  if attempt_id is not null then return attempt_id; end if;
  insert into public.rider_payment_attempts
    (tenant_id, rider_profile_id, quote_id, provider_checkout_session_id, currency_code, amount_minor)
  values (quote.tenant_id, quote.rider_profile_id, quote.quote_id, checkout_session_id_value,
    quote.currency_code, card_minor) returning payment_attempt_id into attempt_id;
  return attempt_id;
end;
$$;

create or replace function public.create_my_rider_priced_booking(
  target_quote_id uuid, booking_notes_value text default null, scheduled_pickup_at_value timestamptz default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare quote public.trip_price_quotes; rider_id uuid; target_tenant_slug text; new_booking_id uuid;
  attempt public.rider_payment_attempts; allocation public.rider_wallet_quote_allocations;
  wallet_account_id uuid; prepayment_id uuid; transaction_id_value uuid; actor_id uuid;
begin
  select * into quote from public.trip_price_quotes where quote_id = target_quote_id for update;
  if quote.quote_id is null or quote.status <> 'quoted' then raise exception 'price quote is unavailable'; end if;
  rider_id := public.current_rider_profile_id(quote.tenant_id);
  if rider_id is null or rider_id <> quote.rider_profile_id then raise exception 'Rider quote access is required'; end if;
  select * into attempt from public.rider_payment_attempts where quote_id = quote.quote_id and rider_profile_id = rider_id and status = 'paid';
  select * into allocation from public.rider_wallet_quote_allocations where quote_id = quote.quote_id and status = 'reserved';
  if coalesce(attempt.amount_minor, 0) + coalesce(allocation.amount_minor, 0) <> quote.fare_amount_minor then
    if quote.expires_at <= now() then raise exception 'price quote has expired; calculate a new fare'; end if;
    raise exception 'successful payment or wallet credit is required before booking';
  end if;
  select config.tenant_slug into target_tenant_slug from public.tenant_configurations config where config.tenant_id = quote.tenant_id;
  if scheduled_pickup_at_value is null then
    new_booking_id := public.create_my_rider_geocoded_booking(target_tenant_slug, quote.service_area_id,
      quote.pickup_address, quote.destination_address, quote.pickup_latitude, quote.pickup_longitude,
      quote.destination_latitude, quote.destination_longitude, 'mapbox-v6', booking_notes_value);
  else
    new_booking_id := public.create_my_rider_geocoded_scheduled_booking(target_tenant_slug, quote.service_area_id,
      quote.pickup_address, quote.destination_address, scheduled_pickup_at_value,
      quote.pickup_latitude, quote.pickup_longitude, quote.destination_latitude,
      quote.destination_longitude, 'mapbox-v6', booking_notes_value);
  end if;
  update public.dispatch_bookings set price_quote_id = quote.quote_id, fare_currency_code = quote.currency_code,
    estimated_fare_minor = quote.fare_amount_minor, final_fare_minor = quote.fare_amount_minor,
    route_distance_meters = quote.route_distance_meters, route_duration_seconds = quote.route_duration_seconds
    where booking_id = new_booking_id;
  update public.trip_price_quotes set status = 'booked', booking_id = new_booking_id where quote_id = quote.quote_id;
  if attempt.payment_attempt_id is not null then update public.rider_payment_attempts set booking_id = new_booking_id, updated_at = now() where payment_attempt_id = attempt.payment_attempt_id; end if;
  if allocation.rider_wallet_quote_allocation_id is not null then
    update public.rider_wallet_quote_allocations set status = 'applied', booking_id = new_booking_id,
      applied_at = now(), updated_at = now() where rider_wallet_quote_allocation_id = allocation.rider_wallet_quote_allocation_id;
    select person_id into actor_id from public.rider_profiles where rider_profile_id = rider_id;
    insert into public.rider_wallet_entries (tenant_id, rider_profile_id, direction, entry_type, currency_code,
      amount_minor, description, external_key, quote_id, booking_id, created_by_person_id)
    values (quote.tenant_id, rider_id, 'debit', 'trip_applied', quote.currency_code, allocation.amount_minor,
      'Wallet credit applied to trip', 'wallet_apply:' || allocation.rider_wallet_quote_allocation_id::text,
      quote.quote_id, new_booking_id, actor_id);
    select account_id into wallet_account_id from public.ledger_accounts where tenant_id = quote.tenant_id and account_code = 'rider_wallet_credits';
    select account_id into prepayment_id from public.ledger_accounts where tenant_id = quote.tenant_id and account_code = 'rider_prepayments';
    insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint, description, effective_at, booking_id, created_by_person_id)
    values (quote.tenant_id, 'wallet_apply:' || allocation.rider_wallet_quote_allocation_id::text,
      md5(jsonb_build_object('allocationId', allocation.rider_wallet_quote_allocation_id,
        'amountMinor', allocation.amount_minor)::text), 'Rider wallet credit applied', now(), new_booking_id, actor_id)
    returning transaction_id into transaction_id_value;
    set constraints ledger_entries_balanced deferred;
    insert into public.ledger_entries (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
    values (quote.tenant_id, transaction_id_value, wallet_account_id, 1, allocation.amount_minor, 0),
      (quote.tenant_id, transaction_id_value, prepayment_id, 2, 0, allocation.amount_minor);
    set constraints ledger_entries_balanced immediate;
  end if;
  return new_booking_id;
end;
$$;

create or replace function public.clear_rider_prepayment_after_completion()
returns trigger language plpgsql security definer set search_path = public as $$
declare card_minor bigint := 0; wallet_minor bigint := 0; total_minor bigint;
  prepayment_id uuid; receivable_id uuid; transaction_id_value uuid; actor_id uuid;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  select coalesce(amount_minor, 0), rider_profile_id into card_minor, actor_id
    from public.rider_payment_attempts where booking_id = new.booking_id and status = 'paid';
  select coalesce(amount_minor, 0) into wallet_minor from public.rider_wallet_quote_allocations
    where booking_id = new.booking_id and status = 'applied';
  total_minor := coalesce(card_minor, 0) + coalesce(wallet_minor, 0);
  if total_minor = 0 then return new; end if;
  select person_id into actor_id from public.rider_profiles where rider_profile_id = coalesce(
    (select rider_profile_id from public.rider_payment_attempts where booking_id = new.booking_id),
    (select rider_profile_id from public.rider_wallet_quote_allocations where booking_id = new.booking_id));
  select account_id into prepayment_id from public.ledger_accounts where tenant_id = new.tenant_id and account_code = 'rider_prepayments';
  select account_id into receivable_id from public.ledger_accounts where tenant_id = new.tenant_id and account_code = 'rider_receivables';
  insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint, description, effective_at, booking_id, created_by_person_id)
  values (new.tenant_id, 'payment_settlement:' || new.booking_id::text,
    md5(jsonb_build_object('bookingId', new.booking_id, 'amountMinor', total_minor)::text),
    'Rider payment applied to completed trip', coalesce(new.completed_at, now()), new.booking_id, actor_id)
  on conflict (tenant_id, external_key) do nothing returning transaction_id into transaction_id_value;
  if transaction_id_value is not null then
    set constraints ledger_entries_balanced deferred;
    insert into public.ledger_entries (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
    values (new.tenant_id, transaction_id_value, prepayment_id, 1, total_minor, 0),
      (new.tenant_id, transaction_id_value, receivable_id, 2, 0, total_minor);
    set constraints ledger_entries_balanced immediate;
  end if;
  return new;
end;
$$;

create or replace function public.restore_rider_wallet_for_booking_internal(target_booking_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare allocation public.rider_wallet_quote_allocations; wallet_account_id uuid; prepayment_id uuid;
  transaction_id_value uuid; actor_id uuid;
begin
  select * into allocation from public.rider_wallet_quote_allocations where booking_id = target_booking_id for update;
  if allocation.rider_wallet_quote_allocation_id is null or allocation.status = 'restored' then return 0; end if;
  if allocation.status <> 'applied' then raise exception 'wallet allocation is not applied'; end if;
  select person_id into actor_id from public.rider_profiles where rider_profile_id = allocation.rider_profile_id;
  update public.rider_wallet_quote_allocations set status = 'restored', restored_at = now(), updated_at = now()
    where rider_wallet_quote_allocation_id = allocation.rider_wallet_quote_allocation_id;
  insert into public.rider_wallet_entries (tenant_id, rider_profile_id, direction, entry_type, currency_code,
    amount_minor, description, external_key, quote_id, booking_id, created_by_person_id)
  values (allocation.tenant_id, allocation.rider_profile_id, 'credit', 'trip_restored', allocation.currency_code,
    allocation.amount_minor, 'Wallet credit restored after trip cancellation',
    'wallet_restore:' || allocation.rider_wallet_quote_allocation_id::text, allocation.quote_id, target_booking_id, actor_id);
  select account_id into wallet_account_id from public.ledger_accounts where tenant_id = allocation.tenant_id and account_code = 'rider_wallet_credits';
  select account_id into prepayment_id from public.ledger_accounts where tenant_id = allocation.tenant_id and account_code = 'rider_prepayments';
  insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint, description, effective_at, booking_id, created_by_person_id)
  values (allocation.tenant_id, 'wallet_restore:' || allocation.rider_wallet_quote_allocation_id::text,
    md5(jsonb_build_object('allocationId', allocation.rider_wallet_quote_allocation_id,
      'amountMinor', allocation.amount_minor)::text), 'Rider wallet credit restored', now(), target_booking_id, actor_id)
  returning transaction_id into transaction_id_value;
  set constraints ledger_entries_balanced deferred;
  insert into public.ledger_entries (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
  values (allocation.tenant_id, transaction_id_value, prepayment_id, 1, allocation.amount_minor, 0),
    (allocation.tenant_id, transaction_id_value, wallet_account_id, 2, 0, allocation.amount_minor);
  set constraints ledger_entries_balanced immediate;
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_person_id,
    actor_platform_roles, reason, correlation_id, resource_type, resource_id, metadata)
  values (allocation.tenant_id, 'rider_wallet.credit_restored', 'platform_system', actor_id, '{}',
    'Wallet credit restored after pre-trip cancellation.', gen_random_uuid(),
    'rider_wallet_quote_allocation', allocation.rider_wallet_quote_allocation_id::text,
    jsonb_build_object('booking_id', target_booking_id, 'amount_minor', allocation.amount_minor));
  return allocation.amount_minor;
end;
$$;

create or replace function public.cancel_wallet_only_booking_internal(target_booking_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare booking public.dispatch_bookings;
begin
  select * into booking from public.dispatch_bookings where booking_id = target_booking_id for update;
  if booking.booking_id is null then raise exception 'Booking is unavailable'; end if;
  if booking.status in ('in_progress', 'completed') then raise exception 'Booking is not eligible for wallet restoration'; end if;
  if exists (select 1 from public.rider_payment_attempts where booking_id = target_booking_id and status = 'paid')
    then raise exception 'Stripe refund is required for this booking'; end if;
  perform public.restore_rider_wallet_for_booking_internal(target_booking_id);
  update public.dispatch_offers set status = 'cancelled', responded_at = now(), response_notes = 'Wallet booking canceled.'
    where booking_id = target_booking_id and status = 'pending';
  update public.dispatch_bookings set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()),
    current_driver_profile_id = null, current_vehicle_id = null where booking_id = target_booking_id;
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_person_id,
    actor_platform_roles, reason, correlation_id, resource_type, resource_id, metadata)
  values (booking.tenant_id, 'dispatch.booking_cancelled', 'platform_system', null, '{}',
    'Wallet-funded Rider booking canceled before trip start.', gen_random_uuid(),
    'dispatch_booking', booking.booking_id::text, jsonb_build_object('wallet_restored', true));
  return true;
end;
$$;

-- Extend successful Stripe cancellation completion to restore any wallet portion after the card refund.
create or replace function public.complete_pretrip_refund_internal(target_refund_id uuid, provider_refund_id_value text)
returns boolean language plpgsql security definer set search_path = public as $$
declare refund public.rider_payment_refunds; booking public.dispatch_bookings; payment public.rider_payment_attempts;
  prepayment_id uuid; cash_id uuid; transaction_id_value uuid; actor_id uuid;
begin
  select * into refund from public.rider_payment_refunds where refund_id = target_refund_id for update;
  if refund.refund_id is null then raise exception 'Refund is unavailable'; end if;
  if refund.status = 'succeeded' then return true; end if;
  select * into booking from public.dispatch_bookings where booking_id = refund.booking_id for update;
  if booking.status in ('in_progress', 'completed') then raise exception 'Trip started while refund was processing'; end if;
  select * into payment from public.rider_payment_attempts where payment_attempt_id = refund.payment_attempt_id;
  select account_id into prepayment_id from public.ledger_accounts where tenant_id = refund.tenant_id and account_code = 'rider_prepayments';
  select account_id into cash_id from public.ledger_accounts where tenant_id = refund.tenant_id and account_code = 'cash_clearing';
  select person_id into actor_id from public.rider_profiles where rider_profile_id = payment.rider_profile_id;
  update public.dispatch_offers set status = 'cancelled', responded_at = now(), response_notes = 'Paid booking refunded.' where booking_id = booking.booking_id and status = 'pending';
  update public.dispatch_bookings set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), current_driver_profile_id = null, current_vehicle_id = null where booking_id = booking.booking_id;
  update public.rider_payment_attempts set status = 'refunded', updated_at = now() where payment_attempt_id = payment.payment_attempt_id;
  insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint, description, effective_at, booking_id, created_by_person_id)
  values (refund.tenant_id, 'payment_refund:' || refund.refund_id::text,
    md5(jsonb_build_object('refundId', refund.refund_id, 'amountMinor', refund.amount_minor, 'providerRefundId', provider_refund_id_value)::text),
    'Paid canceled trip refunded', now(), refund.booking_id, actor_id)
  on conflict (tenant_id, external_key) do nothing returning transaction_id into transaction_id_value;
  if transaction_id_value is not null then
    set constraints ledger_entries_balanced deferred;
    insert into public.ledger_entries (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
    values (refund.tenant_id, transaction_id_value, prepayment_id, 1, refund.amount_minor, 0),
      (refund.tenant_id, transaction_id_value, cash_id, 2, 0, refund.amount_minor);
    set constraints ledger_entries_balanced immediate;
  end if;
  perform public.restore_rider_wallet_for_booking_internal(refund.booking_id);
  update public.rider_payment_refunds set status = 'succeeded', provider_refund_id = provider_refund_id_value,
    refunded_at = now(), updated_at = now() where refund_id = refund.refund_id;
  insert into public.tenant_audit_events (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles,
    reason, correlation_id, resource_type, resource_id, metadata)
  values (refund.tenant_id, 'payment.refunded', 'platform_system', actor_id, '{}',
    'Paid Rider booking canceled and card payment refunded; wallet credit restored when applicable.',
    gen_random_uuid(), 'rider_payment_refund', refund.refund_id::text,
    jsonb_build_object('booking_id', refund.booking_id, 'amount_minor', refund.amount_minor));
  return true;
end;
$$;

revoke all on function public.issue_rider_wallet_credit(uuid, uuid, bigint, text, text) from public, anon, authenticated;
revoke all on function public.my_rider_wallet(text) from public, anon, authenticated;
revoke all on function public.prepare_rider_wallet_checkout_internal(uuid) from public, anon, authenticated;
revoke all on function public.cancel_wallet_only_booking_internal(uuid) from public, anon, authenticated;
revoke all on function public.restore_rider_wallet_for_booking_internal(uuid) from public, anon, authenticated;
grant execute on function public.issue_rider_wallet_credit(uuid, uuid, bigint, text, text) to authenticated;
grant execute on function public.my_rider_wallet(text) to authenticated;
grant execute on function public.prepare_rider_wallet_checkout_internal(uuid) to service_role;
grant execute on function public.cancel_wallet_only_booking_internal(uuid) to service_role;
grant execute on function public.restore_rider_wallet_for_booking_internal(uuid) to service_role;

-- Wallet-funded earnings remain pending ESH obligations unless the actual Stripe collection can
-- cover the full Driver earning. The existing source-transaction transfer must never overstate cash.
create or replace function public.prepare_driver_earning_transfer_internal(
  target_driver_profile_id uuid, target_booking_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare booking public.dispatch_bookings; payment public.rider_payment_attempts;
  payout public.driver_payout_accounts; transfer public.driver_earning_transfers;
begin
  select * into booking from public.dispatch_bookings where booking_id = target_booking_id for update;
  if booking.booking_id is null or booking.current_driver_profile_id <> target_driver_profile_id then raise exception 'Driver trip is unavailable'; end if;
  if booking.status <> 'completed' or booking.driver_earnings_minor is null or booking.driver_earnings_minor <= 0 then raise exception 'Completed Driver earnings are required'; end if;
  select * into payment from public.rider_payment_attempts where booking_id = booking.booking_id and status = 'paid';
  if payment.payment_attempt_id is null or payment.provider_payment_intent_id is null
    or payment.amount_minor < booking.driver_earnings_minor
    then raise exception 'Stripe-collected Rider payment sufficient for this Driver earning is required'; end if;
  select * into payout from public.driver_payout_accounts where driver_profile_id = target_driver_profile_id;
  if payout.driver_payout_account_id is null or payout.onboarding_status <> 'enabled'
    or payout.transfers_capability_status <> 'active' then raise exception 'Enabled Driver payout account is required'; end if;
  select * into transfer from public.driver_earning_transfers where booking_id = booking.booking_id;
  if transfer.status = 'succeeded' then return jsonb_build_object('alreadyTransferred', true, 'transferId', transfer.driver_earning_transfer_id); end if;
  if transfer.driver_earning_transfer_id is null then
    insert into public.driver_earning_transfers (tenant_id, driver_profile_id, booking_id, payment_attempt_id, currency_code, amount_minor)
    values (booking.tenant_id, target_driver_profile_id, booking.booking_id, payment.payment_attempt_id,
      payment.currency_code, booking.driver_earnings_minor) returning * into transfer;
  else
    update public.driver_earning_transfers set status = 'pending', failure_message = null, updated_at = now()
      where driver_earning_transfer_id = transfer.driver_earning_transfer_id returning * into transfer;
  end if;
  return jsonb_build_object('alreadyTransferred', false, 'transferId', transfer.driver_earning_transfer_id,
    'amountMinor', transfer.amount_minor, 'currencyCode', transfer.currency_code,
    'paymentIntentId', payment.provider_payment_intent_id, 'providerAccountId', payout.provider_account_id);
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
    'balanceMinor', coalesce((select sum(entry.credit_amount_minor - entry.debit_amount_minor) from public.ledger_entries entry where entry.account_id = account_id_value), 0),
    'pendingMinor', coalesce((select sum(booking.driver_earnings_minor) from public.dispatch_bookings booking
      left join public.rider_payment_attempts payment on payment.booking_id = booking.booking_id and payment.status = 'paid'
      where booking.current_driver_profile_id = driver_id and booking.status = 'completed'
        and booking.driver_earnings_minor is not null and booking.driver_earnings_reversed_at is null
        and (payment.payment_attempt_id is null or payment.amount_minor < booking.driver_earnings_minor)), 0),
    'availableMinor', coalesce((select sum(booking.driver_earnings_minor) from public.dispatch_bookings booking
      join public.rider_payment_attempts payment on payment.booking_id = booking.booking_id and payment.status = 'paid'
      left join public.driver_earning_transfers transfer on transfer.booking_id = booking.booking_id and transfer.status = 'succeeded'
      where booking.current_driver_profile_id = driver_id and booking.status = 'completed'
        and booking.driver_earnings_minor is not null and booking.driver_earnings_reversed_at is null
        and payment.amount_minor >= booking.driver_earnings_minor and transfer.driver_earning_transfer_id is null), 0),
    'paidMinor', coalesce((select sum(transfer.amount_minor) from public.driver_earning_transfers transfer
      join public.dispatch_bookings booking on booking.booking_id = transfer.booking_id
      where transfer.driver_profile_id = driver_id and transfer.status = 'succeeded' and booking.driver_earnings_reversed_at is null), 0),
    'trips', coalesce((select jsonb_agg(jsonb_build_object(
      'bookingId', booking.booking_id, 'completedAt', booking.completed_at, 'pickupAddress', booking.pickup_address,
      'destinationAddress', booking.destination_address, 'fareAmountMinor', booking.final_fare_minor,
      'earningsAmountMinor', booking.driver_earnings_minor, 'platformFeeMinor', booking.platform_fee_minor,
      'shareBasisPoints', booking.earnings_share_basis_points,
      'paymentCollected', payment.payment_attempt_id is not null and payment.amount_minor >= booking.driver_earnings_minor,
      'transferStatus', transfer.status, 'earningsReversed', booking.driver_earnings_reversed_at is not null,
      'earningsReversalReason', booking.driver_earnings_reversal_reason) order by booking.completed_at desc)
      from public.dispatch_bookings booking
      left join public.rider_payment_attempts payment on payment.booking_id = booking.booking_id and payment.status = 'paid'
      left join public.driver_earning_transfers transfer on transfer.booking_id = booking.booking_id
      where booking.current_driver_profile_id = driver_id and booking.status = 'completed'
        and booking.driver_earnings_minor is not null), '[]'::jsonb)
  ) into result from public.driver_profiles driver join public.tenant_financial_settings setting on setting.tenant_id = driver.tenant_id
  where driver.driver_profile_id = driver_id;
  return result;
end;
$$;
