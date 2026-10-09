-- TEST ONLY: minimal legacy preference dependencies, never use on production.
alter table public.driver_profiles add column created_at timestamptz default now();
alter table public.driver_profiles add column driver_number text, add column display_name text,
  add column email text, add column phone text;
create table public.driver_onboarding_checklists(driver_profile_id uuid,review_status text,documents_reviewed boolean);
create table public.vehicles(vehicle_id uuid,vehicle_number text,make text,model text,model_year integer,color text,
  license_plate text,status text,photo_storage_path text,photo_storage_bucket text);
create table public.driver_vehicle_assignments(driver_profile_id uuid,vehicle_id uuid,ended_at timestamptz);
create table public.driver_evidence_requirements(tenant_id uuid,evidence_type text,required_for_activation boolean,expiration_required boolean);
create table public.driver_evidence(tenant_id uuid,driver_profile_id uuid,evidence_type text,evidence_id uuid,
  review_status text,expires_on date,review_notes text,submitted_at timestamptz,created_at timestamptz,original_file_name text);
create table public.rider_notification_preferences(rider_profile_id uuid primary key,tenant_id uuid,
  trip_updates_enabled boolean default true,payment_updates_enabled boolean default true);
create table public.driver_notification_preferences(driver_profile_id uuid primary key,tenant_id uuid,
  expiration_reminders_enabled boolean default true,earnings_updates_enabled boolean default true);
create table public.push_subscriptions(push_subscription_id uuid primary key default gen_random_uuid(),
  tenant_id uuid,rider_profile_id uuid,driver_profile_id uuid,status text);
create table public.dispatch_bookings(booking_id uuid primary key default gen_random_uuid(), tenant_id uuid,
  rider_profile_id uuid,status text,pickup_address text,destination_address text,scheduled_pickup_at timestamptz,
  current_driver_profile_id uuid,current_vehicle_id uuid,updated_at timestamptz default now());
alter table public.notification_outbox add column delivery_error text;
alter table public.notification_outbox add constraint notification_outbox_status_check
  check(delivery_status in ('queued','sending','sent','delivered','failed','canceled'));
alter table public.rider_notification_preferences enable row level security;
alter table public.driver_notification_preferences enable row level security;
revoke all on public.rider_notification_preferences,public.driver_notification_preferences from public,anon,authenticated;
-- Preexisting opted-out accounts: migration must preserve actual email choice.
insert into public.tenants values('10000000-0000-4000-8000-000000000001','active',now());
insert into auth.users(id) values('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
insert into public.person_profiles(person_id,auth_user_id,status) values
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','active'),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','active');
insert into public.tenant_configurations(tenant_id,tenant_slug) values('10000000-0000-4000-8000-000000000001','channel-test');
insert into public.rider_profiles(rider_profile_id,tenant_id,person_id,email) values
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','channel-test@example.invalid');
insert into public.driver_profiles(driver_profile_id,tenant_id,person_id) values
  ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002');
insert into public.rider_notification_preferences values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',false,false);
insert into public.driver_notification_preferences values('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',false,false);
insert into auth.sessions(id,user_id) values('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
 ('60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
