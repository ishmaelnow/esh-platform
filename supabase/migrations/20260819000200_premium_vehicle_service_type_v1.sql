-- Add Premium SUV as a supported Rider vehicle service type.

alter table public.vehicles drop constraint if exists vehicles_service_type_check;
alter table public.vehicles add constraint vehicles_service_type_check
  check (service_type in ('standard', 'larger', 'premium', 'accessible'));
alter table public.dispatch_bookings drop constraint if exists dispatch_bookings_requested_service_type_check;
alter table public.dispatch_bookings add constraint dispatch_bookings_requested_service_type_check
  check (requested_service_type in ('standard', 'larger', 'premium', 'accessible'));

create or replace function public.apply_rider_requested_service_type()
returns trigger language plpgsql security definer set search_path = public as $$
declare requested text;
begin
  requested := current_setting('esh.requested_service_type', true);
  if requested in ('standard', 'larger', 'premium', 'accessible') then
    new.requested_service_type := requested;
  end if;
  return new;
end;
$$;

create or replace function public.create_my_rider_priced_booking(
  target_quote_id uuid,
  booking_notes_value text default null,
  scheduled_pickup_at_value timestamptz default null,
  service_type_value text default 'standard'
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

revoke all on function public.create_my_rider_priced_booking(uuid, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.create_my_rider_priced_booking(uuid, text, timestamptz, text)
  to authenticated;
