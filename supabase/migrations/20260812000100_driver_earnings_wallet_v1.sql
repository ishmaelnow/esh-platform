-- Driver earnings allocation and a ledger-derived Driver wallet.

create table public.tenant_driver_earnings_settings (
  tenant_id uuid primary key references public.tenants (tenant_id) on delete restrict,
  driver_share_basis_points integer not null default 8000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  constraint tenant_driver_earnings_share_check check (driver_share_basis_points between 0 and 10000)
);

alter table public.ledger_accounts
  add column driver_profile_id uuid,
  add constraint ledger_accounts_driver_fk foreign key (tenant_id, driver_profile_id)
    references public.driver_profiles (tenant_id, driver_profile_id) on delete restrict,
  add constraint ledger_accounts_driver_scope_check check (
    (account_code = 'driver_payables' and driver_profile_id is null)
    or (account_code like 'driver_payable_%' and driver_profile_id is not null and account_type = 'liability')
    or (account_code <> 'driver_payables' and account_code not like 'driver_payable_%' and driver_profile_id is null)
  );

create unique index ledger_accounts_driver_payable_unique
  on public.ledger_accounts (tenant_id, driver_profile_id)
  where driver_profile_id is not null and account_type = 'liability';

alter table public.dispatch_bookings
  add column driver_earnings_minor bigint,
  add column platform_fee_minor bigint,
  add column earnings_share_basis_points integer,
  add constraint dispatch_bookings_earnings_check check (
    (driver_earnings_minor is null and platform_fee_minor is null and earnings_share_basis_points is null)
    or (driver_earnings_minor >= 0 and platform_fee_minor >= 0
      and driver_earnings_minor + platform_fee_minor = final_fare_minor
      and earnings_share_basis_points between 0 and 10000)
  );

create or replace function public.set_tenant_driver_earnings_settings(
  target_tenant_id uuid,
  driver_share_basis_points_value integer
)
returns boolean language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id();
begin
  if not public.can_manage_pricing(target_tenant_id) then raise exception 'pricing management access is required'; end if;
  if driver_share_basis_points_value not between 0 and 10000 then raise exception 'Driver share must be between 0% and 100%'; end if;
  insert into public.tenant_driver_earnings_settings
    (tenant_id, driver_share_basis_points, updated_by_person_id)
  values (target_tenant_id, driver_share_basis_points_value, actor_id)
  on conflict (tenant_id) do update set driver_share_basis_points = excluded.driver_share_basis_points,
    updated_at = now(), updated_by_person_id = excluded.updated_by_person_id;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (target_tenant_id, 'earnings.settings_updated', 'person', actor_id, '{}',
    'Tenant Driver earnings share updated.', gen_random_uuid(), 'tenant_driver_earnings_settings',
    target_tenant_id::text, jsonb_build_object('driver_share_basis_points', driver_share_basis_points_value));
  return true;
end;
$$;

create or replace function public.ensure_driver_payable_account(target_driver_profile_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare driver public.driver_profiles; currency text; actor_id uuid := public.current_person_id(); account_id_value uuid;
begin
  select * into driver from public.driver_profiles where driver_profile_id = target_driver_profile_id;
  if driver.driver_profile_id is null then raise exception 'Driver profile is required'; end if;
  select operating_currency into currency from public.tenant_financial_settings where tenant_id = driver.tenant_id;
  if currency is null then raise exception 'tenant ledger is required'; end if;
  select account_id into account_id_value from public.ledger_accounts
    where tenant_id = driver.tenant_id and driver_profile_id = driver.driver_profile_id;
  if account_id_value is null then
    insert into public.ledger_accounts (tenant_id, account_code, account_name, account_type,
      normal_balance, currency_code, created_by_person_id, driver_profile_id)
    values (driver.tenant_id, 'driver_payable_' || replace(driver.driver_profile_id::text, '-', ''),
      'Driver payable · ' || driver.display_name, 'liability', 'credit', currency,
      coalesce(actor_id, driver.person_id), driver.driver_profile_id)
    returning account_id into account_id_value;
  end if;
  return account_id_value;
end;
$$;

create or replace function public.allocate_driver_earnings_for_booking(target_booking_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  booking public.dispatch_bookings; share_basis_points integer; earnings_minor bigint; fee_minor bigint;
  driver_account_id uuid; revenue_account_id uuid; transaction_id_value uuid; actor_id uuid;
begin
  select * into booking from public.dispatch_bookings where booking_id = target_booking_id for update;
  if booking.booking_id is null or booking.status <> 'completed' or booking.final_fare_minor is null
    or booking.current_driver_profile_id is null then return null; end if;
  if booking.driver_earnings_minor is not null then
    select transaction_id into transaction_id_value from public.ledger_transactions
      where tenant_id = booking.tenant_id and external_key = 'driver_earnings:' || booking.booking_id::text;
    return transaction_id_value;
  end if;
  select coalesce(settings.driver_share_basis_points, 8000) into share_basis_points
  from (select booking.tenant_id) context left join public.tenant_driver_earnings_settings settings
    on settings.tenant_id = context.tenant_id;
  earnings_minor := round(booking.final_fare_minor::numeric * share_basis_points / 10000)::bigint;
  fee_minor := booking.final_fare_minor - earnings_minor;
  driver_account_id := public.ensure_driver_payable_account(booking.current_driver_profile_id);
  select account_id into revenue_account_id from public.ledger_accounts
    where tenant_id = booking.tenant_id and account_code = 'platform_fees';
  select person_id into actor_id from public.driver_profiles
    where driver_profile_id = booking.current_driver_profile_id;
  insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint, description,
    effective_at, booking_id, created_by_person_id)
  values (booking.tenant_id, 'driver_earnings:' || booking.booking_id::text,
    md5(jsonb_build_object('bookingId', booking.booking_id, 'earningsMinor', earnings_minor,
      'shareBasisPoints', share_basis_points)::text), 'Driver earnings allocation',
    coalesce(booking.completed_at, now()), booking.booking_id, actor_id)
  on conflict (tenant_id, external_key) do nothing returning transaction_id into transaction_id_value;
  if transaction_id_value is null then return null; end if;
  set constraints ledger_entries_balanced deferred;
  insert into public.ledger_entries
    (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
  values
    (booking.tenant_id, transaction_id_value, revenue_account_id, 1, earnings_minor, 0),
    (booking.tenant_id, transaction_id_value, driver_account_id, 2, 0, earnings_minor);
  set constraints ledger_entries_balanced immediate;
  update public.dispatch_bookings set driver_earnings_minor = earnings_minor,
    platform_fee_minor = fee_minor, earnings_share_basis_points = share_basis_points
  where booking_id = booking.booking_id;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (booking.tenant_id, 'earnings.trip_allocated', 'platform_system', actor_id, '{}',
    'Completed trip fare allocated between Driver payable and platform fee.', gen_random_uuid(),
    'dispatch_booking', booking.booking_id::text, jsonb_build_object(
      'driver_profile_id', booking.current_driver_profile_id, 'driver_earnings_minor', earnings_minor,
      'platform_fee_minor', fee_minor, 'driver_share_basis_points', share_basis_points,
      'ledger_transaction_id', transaction_id_value));
  return transaction_id_value;
end;
$$;

create or replace function public.allocate_driver_earnings_after_completion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status <> 'completed' and new.final_fare_minor is not null then
    perform public.allocate_driver_earnings_for_booking(new.booking_id);
  end if;
  return new;
end;
$$;

create trigger dispatch_bookings_allocate_driver_earnings
after update of status on public.dispatch_bookings for each row execute function public.allocate_driver_earnings_after_completion();

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
    'pendingMinor', coalesce((select sum(booking.driver_earnings_minor) from public.dispatch_bookings booking
      where booking.current_driver_profile_id = driver_id and booking.status = 'completed'), 0),
    'availableMinor', 0,
    'paidMinor', 0,
    'trips', coalesce((select jsonb_agg(jsonb_build_object(
      'bookingId', booking.booking_id, 'completedAt', booking.completed_at,
      'pickupAddress', booking.pickup_address, 'destinationAddress', booking.destination_address,
      'fareAmountMinor', booking.final_fare_minor, 'earningsAmountMinor', booking.driver_earnings_minor,
      'platformFeeMinor', booking.platform_fee_minor, 'shareBasisPoints', booking.earnings_share_basis_points
    ) order by booking.completed_at desc) from public.dispatch_bookings booking
      where booking.current_driver_profile_id = driver_id and booking.status = 'completed'
        and booking.driver_earnings_minor is not null), '[]'::jsonb)
  ) into result
  from public.driver_profiles driver join public.tenant_financial_settings setting on setting.tenant_id = driver.tenant_id
  where driver.driver_profile_id = driver_id;
  return result;
end;
$$;

alter table public.tenant_driver_earnings_settings enable row level security;
create policy tenant_driver_earnings_settings_manager_select on public.tenant_driver_earnings_settings
  for select to authenticated using (public.can_manage_pricing(tenant_id));
grant select on public.tenant_driver_earnings_settings to authenticated;
grant all on public.tenant_driver_earnings_settings to service_role;

insert into public.tenant_driver_earnings_settings (tenant_id, driver_share_basis_points, updated_by_person_id)
select setting.tenant_id, 8000, setting.updated_by_person_id from public.tenant_pricing_settings setting
on conflict (tenant_id) do nothing;

do $$ declare booking record;
begin
  for booking in select booking_id from public.dispatch_bookings
    where status = 'completed' and final_fare_minor is not null and current_driver_profile_id is not null
      and driver_earnings_minor is null
  loop perform public.allocate_driver_earnings_for_booking(booking.booking_id); end loop;
end $$;

revoke all on function public.set_tenant_driver_earnings_settings(uuid, integer) from public, anon, authenticated;
revoke all on function public.ensure_driver_payable_account(uuid) from public, anon, authenticated;
revoke all on function public.allocate_driver_earnings_for_booking(uuid) from public, anon, authenticated;
revoke all on function public.my_driver_wallet() from public, anon, authenticated;
grant execute on function public.set_tenant_driver_earnings_settings(uuid, integer) to authenticated;
grant execute on function public.my_driver_wallet() to authenticated;
grant execute on function public.ensure_driver_payable_account(uuid) to service_role;
grant execute on function public.allocate_driver_earnings_for_booking(uuid) to service_role;
