-- Remove the ambiguous defaulted overload and expose the service-type booking RPC by name.

drop function if exists public.create_my_rider_priced_booking(uuid, text, timestamptz, text);

create or replace function public.create_my_rider_priced_booking_with_service_type(
  target_quote_id uuid,
  booking_notes_value text,
  scheduled_pickup_at_value timestamptz,
  service_type_value text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare normalized text := lower(btrim(coalesce(service_type_value, 'standard'))); booking_id_value uuid;
begin
  if normalized not in ('standard', 'larger', 'premium', 'accessible') then
    raise exception 'unsupported vehicle service type';
  end if;
  perform set_config('esh.requested_service_type', normalized, true);
  booking_id_value := public.create_my_rider_priced_booking(target_quote_id, booking_notes_value, scheduled_pickup_at_value);
  return booking_id_value;
end;
$$;

revoke all on function public.create_my_rider_priced_booking_with_service_type(uuid, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.create_my_rider_priced_booking_with_service_type(uuid, text, timestamptz, text)
  to authenticated;
