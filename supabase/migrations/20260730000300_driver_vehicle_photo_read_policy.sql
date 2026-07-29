-- Let an authenticated driver view the private photo for their currently assigned vehicle.

drop policy if exists driver_assigned_vehicle_photo_read on storage.objects;
create policy driver_assigned_vehicle_photo_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'driver-application-files'
    and exists (
      select 1
      from public.driver_vehicle_assignments assignment
      join public.driver_profiles driver
        on driver.tenant_id = assignment.tenant_id
        and driver.driver_profile_id = assignment.driver_profile_id
      join public.person_profiles person on person.person_id = driver.person_id
      join public.vehicles vehicle
        on vehicle.tenant_id = assignment.tenant_id
        and vehicle.vehicle_id = assignment.vehicle_id
      where assignment.ended_at is null
        and person.auth_user_id = auth.uid()
        and vehicle.status = 'active'
        and vehicle.photo_storage_bucket = bucket_id
        and vehicle.photo_storage_path = name
    )
  );
