-- TEST ONLY: minimal existing schema; never run against an existing database.
alter table driver_profiles add column display_name text;
create table dispatch_bookings(booking_id uuid primary key,tenant_id uuid,rider_profile_id uuid,current_driver_profile_id uuid,status text,completed_at timestamptz,pickup_address text,destination_address text,unique(tenant_id,booking_id));
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at:=now(); return new; end; $$;
create function public.can_manage_dispatch(t uuid) returns boolean language sql security definer as $$ select auth.uid()='20000000-0000-4000-8000-000000000003'::uuid and t='10000000-0000-4000-8000-000000000001'::uuid $$;
