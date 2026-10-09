-- TEST ONLY: minimal legacy dependencies; never run on an existing/remote database.
alter table public.dispatch_bookings add constraint test_tenant_booking unique(tenant_id,booking_id);
alter table public.dispatch_bookings add column service_area_id uuid, add column price_quote_id uuid,
  add column final_fare_minor bigint, add column fare_currency_code text,
  add column route_duration_seconds integer, add column dispatch_ready_at timestamptz,
  add column created_at timestamptz default now(), add column completed_at timestamptz, add column customer_name text,
  add column customer_phone text, add column booking_notes text;
alter table public.dispatch_offers add column booking_id uuid, add column vehicle_id uuid,
  add column offered_by_person_id uuid, add column offer_source text, add column offered_at timestamptz default now(),
  add column responded_at timestamptz, add column response_notes text;
create unique index test_pending_offer on public.dispatch_offers(booking_id) where status='pending';
alter table public.dispatch_offers alter column offer_id set default gen_random_uuid();
alter table public.dispatch_offers alter column status set default 'pending';
alter table public.driver_vehicle_assignments add column tenant_id uuid;
create table public.service_areas(service_area_id uuid primary key,tenant_id uuid,name text,status text);
create table public.driver_availability(driver_profile_id uuid primary key,tenant_id uuid,requested_status text,selected_service_area_id uuid);
create table public.tenant_matching_settings(tenant_id uuid primary key,automatic_matching_enabled boolean default true,
  maximum_attempts integer default 5,offer_duration_seconds integer default 90);
create function auth.role() returns text language sql as $$ select current_user::text $$;
create function public.can_manage_dispatch(t uuid) returns boolean language sql as $$
  select auth.uid()='20000000-0000-4000-8000-000000000003'::uuid and t='10000000-0000-4000-8000-000000000001'::uuid $$;
create function public.driver_service_blockers(d uuid) returns text[] language sql as $$
  select case when exists(select 1 from public.driver_profiles where driver_profile_id=d and status='active')
    then '{}'::text[] else array['Driver inactive'] end $$;
grant execute on function public.can_manage_dispatch(uuid) to authenticated;
alter table public.notification_outbox add constraint notification_outbox_type_check check(length(notification_type)>0);
insert into auth.users(id) values('20000000-0000-4000-8000-000000000003'),('20000000-0000-4000-8000-000000000004');
insert into public.person_profiles(person_id,auth_user_id,status) values
  ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','active');
insert into public.driver_profiles(driver_profile_id,tenant_id,person_id,email,display_name,driver_number) values
  ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004','preorder-other@example.invalid','Other test Driver','2');
update public.driver_profiles set email='preorder-driver@example.invalid',display_name='Preorder test Driver',driver_number='1'
  where driver_profile_id='50000000-0000-4000-8000-000000000001';
insert into public.service_areas values('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Test area','active');
insert into public.driver_availability select driver_profile_id,tenant_id,'online','80000000-0000-4000-8000-000000000001'::uuid from public.driver_profiles;
insert into public.driver_vehicle_assignments(driver_profile_id,vehicle_id,tenant_id)
  select driver_profile_id,gen_random_uuid(),tenant_id from public.driver_profiles;
insert into public.tenant_matching_settings(tenant_id) values('10000000-0000-4000-8000-000000000001');
update public.tenant_configurations set default_time_zone='America/Chicago';
