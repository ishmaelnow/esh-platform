-- TEST ONLY additions to the isolated active-booking bootstrap, not a production script.
alter table public.driver_profiles add primary key(driver_profile_id);
alter table public.driver_profiles add column auth_user_id uuid;
insert into public.driver_profiles values
 ('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002'),
 ('40000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000003');
create or replace function public.current_driver_profile_id() returns uuid language sql security definer as $$
  select driver_profile_id from public.driver_profiles where auth_user_id=auth.uid() $$;
alter table public.dispatch_bookings add column current_driver_profile_id uuid;
create table public.tenant_audit_events(tenant_id uuid,event_name text,actor_type text,actor_person_id uuid,
  actor_platform_roles text[],reason text,correlation_id uuid,resource_type text,resource_id text,metadata jsonb);
update public.dispatch_bookings set status='accepted',current_driver_profile_id='60000000-0000-4000-8000-000000000001'
where booking_id='50000000-0000-4000-8000-000000000001';
