-- TEST ONLY: remaining dependencies for the actual Driver dispatch definition.
alter table dispatch_bookings add column customer_name text,add column customer_phone text,
  add column pickup_latitude double precision,add column pickup_longitude double precision,
  add column destination_latitude double precision,add column destination_longitude double precision,
  add column fare_currency_code text,add column final_fare_minor bigint;
alter table dispatch_offers add column booking_id uuid,add column offered_at timestamptz default now();
create function public.expire_dispatch_offers(tenant_value uuid) returns void language plpgsql as $$
begin perform set_config('test.expiration_tenant',tenant_value::text,true); end; $$;
