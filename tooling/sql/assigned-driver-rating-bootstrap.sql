-- TEST ONLY: dependencies for the actual legacy Rider portal. Never run in production.
alter table driver_profiles add column driver_number text;
alter table rider_profiles add column phone text,add column accessibility_notes text;
create table tenant_capabilities(tenant_id uuid,capability_key text,enabled boolean);
create table service_areas(service_area_id uuid primary key,tenant_id uuid,name text,description text,status text);
create table vehicles(vehicle_id uuid primary key,vehicle_number text,make text,model text,model_year integer,color text,license_plate text);
alter table dispatch_bookings add column service_area_id uuid,add column booking_notes text,
  add column created_at timestamptz default now(),add column updated_at timestamptz default now(),
  add column cancelled_at timestamptz,add column current_vehicle_id uuid;
