-- Full Stripe refunds for paid Rider bookings canceled before trip start.

create table public.rider_payment_refunds (
  refund_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  payment_attempt_id uuid not null,
  booking_id uuid not null,
  provider text not null default 'stripe',
  provider_refund_id text,
  status text not null default 'pending',
  currency_code text not null references public.currency_codes (currency_code) on delete restrict,
  amount_minor bigint not null,
  reason text not null,
  failure_message text,
  created_at timestamptz not null default now(),
  refunded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint rider_payment_refunds_payment_fk foreign key (tenant_id, payment_attempt_id)
    references public.rider_payment_attempts (tenant_id, payment_attempt_id) on delete restrict,
  constraint rider_payment_refunds_booking_fk foreign key (tenant_id, booking_id)
    references public.dispatch_bookings (tenant_id, booking_id) on delete restrict,
  constraint rider_payment_refunds_status_check check (status in ('pending', 'succeeded', 'failed')),
  constraint rider_payment_refunds_amount_check check (amount_minor > 0),
  constraint rider_payment_refunds_booking_unique unique (booking_id)
);

create unique index rider_payment_refunds_provider_unique on public.rider_payment_refunds
  (provider, provider_refund_id) where provider_refund_id is not null;
alter table public.rider_payment_refunds enable row level security;
create policy rider_payment_refunds_rider_select on public.rider_payment_refunds for select to authenticated
  using (exists (select 1 from public.rider_payment_attempts payment
    where payment.payment_attempt_id = rider_payment_refunds.payment_attempt_id
      and payment.rider_profile_id = public.current_rider_profile_id(payment.tenant_id)));
create policy rider_payment_refunds_manager_select on public.rider_payment_refunds for select to authenticated
  using (public.can_manage_ledger(tenant_id));
grant select on public.rider_payment_refunds to authenticated;
grant all on public.rider_payment_refunds to service_role;

create or replace function public.prevent_trip_start_during_pending_refund()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'in_progress' and old.status is distinct from new.status
    and exists (
      select 1 from public.rider_payment_refunds refund
      where refund.booking_id = new.booking_id and refund.status = 'pending'
    ) then
    raise exception 'Trip cannot start while its Rider refund is processing';
  end if;
  return new;
end;
$$;

create trigger dispatch_bookings_pending_refund_start_guard
before update of status on public.dispatch_bookings
for each row execute function public.prevent_trip_start_during_pending_refund();

create or replace function public.prepare_pretrip_refund_internal(target_booking_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare booking public.dispatch_bookings; payment public.rider_payment_attempts; refund public.rider_payment_refunds;
begin
  select * into booking from public.dispatch_bookings where booking_id = target_booking_id for update;
  if booking.booking_id is null then raise exception 'Booking is unavailable'; end if;
  if booking.status in ('in_progress', 'completed', 'cancelled') then raise exception 'Booking is not eligible for automatic refund'; end if;
  select * into payment from public.rider_payment_attempts where booking_id = booking.booking_id and status = 'paid';
  if payment.payment_attempt_id is null or payment.provider_payment_intent_id is null
    then raise exception 'Paid Rider booking is required'; end if;
  select * into refund from public.rider_payment_refunds where booking_id = booking.booking_id;
  if refund.status = 'succeeded' then return jsonb_build_object('alreadyRefunded', true, 'refundId', refund.refund_id); end if;
  if refund.refund_id is null then
    insert into public.rider_payment_refunds
      (tenant_id, payment_attempt_id, booking_id, currency_code, amount_minor, reason)
    values (booking.tenant_id, payment.payment_attempt_id, booking.booking_id,
      payment.currency_code, payment.amount_minor, 'Paid trip canceled before trip start.') returning * into refund;
  else
    update public.rider_payment_refunds set status = 'pending', failure_message = null, updated_at = now()
      where refund_id = refund.refund_id returning * into refund;
  end if;
  return jsonb_build_object('alreadyRefunded', false, 'refundId', refund.refund_id,
    'paymentIntentId', payment.provider_payment_intent_id, 'amountMinor', refund.amount_minor);
end;
$$;

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
  update public.dispatch_offers set status = 'cancelled', responded_at = now(), response_notes = 'Paid booking refunded.'
    where booking_id = booking.booking_id and status = 'pending';
  update public.dispatch_bookings set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()),
    current_driver_profile_id = null, current_vehicle_id = null where booking_id = booking.booking_id;
  update public.rider_payment_attempts set status = 'refunded', updated_at = now() where payment_attempt_id = payment.payment_attempt_id;
  insert into public.ledger_transactions (tenant_id, external_key, request_fingerprint, description,
    effective_at, booking_id, created_by_person_id)
  values (refund.tenant_id, 'payment_refund:' || refund.refund_id::text,
    md5(jsonb_build_object('refundId', refund.refund_id, 'amountMinor', refund.amount_minor,
      'providerRefundId', provider_refund_id_value)::text), 'Paid canceled trip refunded', now(), refund.booking_id, actor_id)
  on conflict (tenant_id, external_key) do nothing returning transaction_id into transaction_id_value;
  if transaction_id_value is not null then
    set constraints ledger_entries_balanced deferred;
    insert into public.ledger_entries (tenant_id, transaction_id, account_id, entry_sequence, debit_amount_minor, credit_amount_minor)
    values (refund.tenant_id, transaction_id_value, prepayment_id, 1, refund.amount_minor, 0),
      (refund.tenant_id, transaction_id_value, cash_id, 2, 0, refund.amount_minor);
    set constraints ledger_entries_balanced immediate;
  end if;
  update public.rider_payment_refunds set status = 'succeeded', provider_refund_id = provider_refund_id_value,
    refunded_at = now(), updated_at = now() where refund_id = refund.refund_id;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (refund.tenant_id, 'payment.refunded', 'platform_system', actor_id, '{}',
    'Paid Rider booking canceled and fully refunded before trip start.', gen_random_uuid(),
    'rider_payment_refund', refund.refund_id::text,
    jsonb_build_object('booking_id', refund.booking_id, 'amount_minor', refund.amount_minor));
  return true;
end;
$$;

create or replace function public.fail_pretrip_refund_internal(target_refund_id uuid, failure_message_value text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.rider_payment_refunds set status = 'failed', failure_message = left(failure_message_value, 500), updated_at = now()
    where refund_id = target_refund_id and status <> 'succeeded';
  return found;
end;
$$;

revoke all on function public.prepare_pretrip_refund_internal(uuid) from public, anon, authenticated;
revoke all on function public.complete_pretrip_refund_internal(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_pretrip_refund_internal(uuid, text) from public, anon, authenticated;
grant execute on function public.prepare_pretrip_refund_internal(uuid) to service_role;
grant execute on function public.complete_pretrip_refund_internal(uuid, text) to service_role;
grant execute on function public.fail_pretrip_refund_internal(uuid, text) to service_role;
