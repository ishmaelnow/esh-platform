-- TEST ONLY: minimal existing dependencies. Never run on a remote/existing database.
create table public.dispatch_bookings(booking_id uuid primary key,tenant_id uuid,rider_profile_id uuid,current_driver_profile_id uuid,status text,unique(tenant_id,booking_id));
create table public.driver_locations(tenant_id uuid,driver_profile_id uuid,sharing_enabled boolean,latitude double precision,longitude double precision,recorded_at timestamptz);
