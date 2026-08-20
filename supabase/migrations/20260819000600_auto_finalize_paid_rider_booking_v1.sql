-- Finalize a paid normal Rider quote exactly once after verified Stripe payment.

create or replace function public.finalize_paid_rider_booking_internal(
  target_quote_id uuid,
  booking_notes_value text,
  scheduled_pickup_at_value timestamptz,
  service_type_value text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare quote public.trip_price_quotes; existing_booking uuid; attempt_id uuid;
begin
  select * into quote from public.trip_price_quotes where quote_id = target_quote_id for update;
  if quote.quote_id is null then raise exception 'price quote is unavailable'; end if;
  if quote.status = 'booked' then return quote.booking_id; end if;
  select payment_attempt_id into attempt_id from public.rider_payment_attempts where quote_id = target_quote_id and status = 'paid' limit 1;
  if attempt_id is null then raise exception 'verified payment is required before booking'; end if;
  existing_booking := public.create_my_rider_priced_booking_with_service_type(target_quote_id, booking_notes_value, scheduled_pickup_at_value, service_type_value);
  return existing_booking;
end;
$$;

revoke all on function public.finalize_paid_rider_booking_internal(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.finalize_paid_rider_booking_internal(uuid, text, timestamptz, text) to service_role;
