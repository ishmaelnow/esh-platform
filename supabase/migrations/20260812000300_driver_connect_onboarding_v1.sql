-- Stripe Connect payout onboarding and collected Driver earnings availability.

create table public.driver_payout_accounts (
  driver_payout_account_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  driver_profile_id uuid not null,
  provider text not null default 'stripe',
  provider_account_id text not null,
  onboarding_status text not null default 'not_started',
  details_submitted boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  transfers_capability_status text,
  requirements_currently_due text[] not null default '{}',
  requirements_eventually_due text[] not null default '{}',
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_payout_accounts_driver_fk foreign key (tenant_id, driver_profile_id)
    references public.driver_profiles (tenant_id, driver_profile_id) on delete restrict,
  constraint driver_payout_accounts_status_check check (
    onboarding_status in ('not_started', 'details_required', 'under_review', 'enabled', 'restricted')
  ),
  constraint driver_payout_accounts_provider_unique unique (provider, provider_account_id),
  constraint driver_payout_accounts_driver_unique unique (driver_profile_id)
);

alter table public.driver_payout_accounts enable row level security;
create policy driver_payout_accounts_driver_select on public.driver_payout_accounts
  for select to authenticated using (driver_profile_id = public.current_driver_profile_id());
create policy driver_payout_accounts_manager_select on public.driver_payout_accounts
  for select to authenticated using (public.can_manage_ledger(tenant_id));
grant select on public.driver_payout_accounts to authenticated;
grant all on public.driver_payout_accounts to service_role;

create or replace function public.register_driver_payout_account_internal(
  target_driver_profile_id uuid, provider_account_id_value text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare driver public.driver_profiles; payout_account_id uuid;
begin
  select * into driver from public.driver_profiles where driver_profile_id = target_driver_profile_id;
  if driver.driver_profile_id is null then raise exception 'Driver profile is unavailable'; end if;
  insert into public.driver_payout_accounts
    (tenant_id, driver_profile_id, provider_account_id, onboarding_status)
  values (driver.tenant_id, driver.driver_profile_id, provider_account_id_value, 'details_required')
  on conflict (driver_profile_id) do update set updated_at = now()
  returning driver_payout_account_id into payout_account_id;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (driver.tenant_id, 'payout.account_created', 'platform_system', driver.person_id, '{}',
    'Stripe connected account registered for Driver payout onboarding.', gen_random_uuid(),
    'driver_payout_account', payout_account_id::text,
    jsonb_build_object('driver_profile_id', driver.driver_profile_id));
  return payout_account_id;
end;
$$;

create or replace function public.update_driver_payout_account_internal(
  provider_account_id_value text, details_submitted_value boolean,
  charges_enabled_value boolean, payouts_enabled_value boolean,
  transfers_capability_status_value text, currently_due_value text[],
  eventually_due_value text[], disabled_reason_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare payout public.driver_payout_accounts; next_status text;
begin
  select * into payout from public.driver_payout_accounts
    where provider = 'stripe' and provider_account_id = provider_account_id_value for update;
  if payout.driver_payout_account_id is null then raise exception 'Driver payout account is unavailable'; end if;
  next_status := case
    when payouts_enabled_value and transfers_capability_status_value = 'active' then 'enabled'
    when disabled_reason_value is not null then 'restricted'
    when details_submitted_value and coalesce(array_length(currently_due_value, 1), 0) = 0 then 'under_review'
    else 'details_required' end;
  update public.driver_payout_accounts set onboarding_status = next_status,
    details_submitted = details_submitted_value, charges_enabled = charges_enabled_value,
    payouts_enabled = payouts_enabled_value,
    transfers_capability_status = transfers_capability_status_value,
    requirements_currently_due = coalesce(currently_due_value, '{}'),
    requirements_eventually_due = coalesce(eventually_due_value, '{}'),
    disabled_reason = disabled_reason_value, updated_at = now()
  where driver_payout_account_id = payout.driver_payout_account_id;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (payout.tenant_id, 'payout.account_updated', 'platform_system', null, '{}',
    'Stripe connected account status updated from a verified server event.', gen_random_uuid(),
    'driver_payout_account', payout.driver_payout_account_id::text,
    jsonb_build_object('onboarding_status', next_status, 'payouts_enabled', payouts_enabled_value,
      'transfers_capability_status', transfers_capability_status_value));
  return true;
end;
$$;

create or replace function public.my_driver_payout_account()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'exists', payout.driver_payout_account_id is not null,
    'onboardingStatus', coalesce(payout.onboarding_status, 'not_started'),
    'detailsSubmitted', coalesce(payout.details_submitted, false),
    'payoutsEnabled', coalesce(payout.payouts_enabled, false),
    'transfersCapabilityStatus', payout.transfers_capability_status,
    'requirementsCurrentlyDue', coalesce(to_jsonb(payout.requirements_currently_due), '[]'::jsonb),
    'disabledReason', payout.disabled_reason,
    'updatedAt', payout.updated_at
  ) from public.driver_profiles driver
  left join public.driver_payout_accounts payout on payout.driver_profile_id = driver.driver_profile_id
  where driver.driver_profile_id = public.current_driver_profile_id();
$$;

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
    'pendingMinor', coalesce((select sum(booking.driver_earnings_minor)
      from public.dispatch_bookings booking
      left join public.rider_payment_attempts payment on payment.booking_id = booking.booking_id and payment.status = 'paid'
      where booking.current_driver_profile_id = driver_id and booking.status = 'completed'
        and booking.driver_earnings_minor is not null and payment.payment_attempt_id is null), 0),
    'availableMinor', coalesce((select sum(booking.driver_earnings_minor)
      from public.dispatch_bookings booking join public.rider_payment_attempts payment
        on payment.booking_id = booking.booking_id and payment.status = 'paid'
      where booking.current_driver_profile_id = driver_id and booking.status = 'completed'
        and booking.driver_earnings_minor is not null), 0),
    'paidMinor', 0,
    'trips', coalesce((select jsonb_agg(jsonb_build_object(
      'bookingId', booking.booking_id, 'completedAt', booking.completed_at,
      'pickupAddress', booking.pickup_address, 'destinationAddress', booking.destination_address,
      'fareAmountMinor', booking.final_fare_minor, 'earningsAmountMinor', booking.driver_earnings_minor,
      'platformFeeMinor', booking.platform_fee_minor, 'shareBasisPoints', booking.earnings_share_basis_points,
      'paymentCollected', payment.payment_attempt_id is not null
    ) order by booking.completed_at desc) from public.dispatch_bookings booking
      left join public.rider_payment_attempts payment on payment.booking_id = booking.booking_id and payment.status = 'paid'
      where booking.current_driver_profile_id = driver_id and booking.status = 'completed'
        and booking.driver_earnings_minor is not null), '[]'::jsonb)
  ) into result
  from public.driver_profiles driver join public.tenant_financial_settings setting on setting.tenant_id = driver.tenant_id
  where driver.driver_profile_id = driver_id;
  return result;
end;
$$;

revoke all on function public.register_driver_payout_account_internal(uuid, text) from public, anon, authenticated;
revoke all on function public.update_driver_payout_account_internal(text, boolean, boolean, boolean, text, text[], text[], text) from public, anon, authenticated;
revoke all on function public.my_driver_payout_account() from public, anon, authenticated;
grant execute on function public.register_driver_payout_account_internal(uuid, text) to service_role;
grant execute on function public.update_driver_payout_account_internal(text, boolean, boolean, boolean, text, text[], text[], text) to service_role;
grant execute on function public.my_driver_payout_account() to authenticated;
