-- Retry automatic matching after a paid Rider quote is linked to the booking.
-- The insert trigger runs before quote finalization; this closes that timing gap.
create or replace function public.trigger_automatic_matching_after_pricing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'requested'
    and new.price_quote_id is not null
    and old.price_quote_id is distinct from new.price_quote_id
    and not exists (
      select 1 from public.dispatch_offers offer
      where offer.booking_id = new.booking_id and offer.status = 'pending'
    ) then
    perform public.match_dispatch_booking(new.booking_id);
  end if;
  return new;
end;
$$;

drop trigger if exists dispatch_bookings_automatic_matching_after_pricing on public.dispatch_bookings;
create trigger dispatch_bookings_automatic_matching_after_pricing
  after update of price_quote_id on public.dispatch_bookings
  for each row execute function public.trigger_automatic_matching_after_pricing();

revoke all on function public.trigger_automatic_matching_after_pricing() from public, anon, authenticated;
