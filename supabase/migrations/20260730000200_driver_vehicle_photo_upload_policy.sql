-- Allow an authenticated driver to upload a photo only for their currently assigned active vehicle.

drop policy if exists driver_assigned_vehicle_photo_upload on storage.objects;
create policy driver_assigned_vehicle_photo_upload
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'driver-application-files'
    and (storage.foldername(name))[1] = 'vehicle-self-service'
    and (storage.foldername(name))[2] = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png')
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
      where assignment.vehicle_id::text = (storage.foldername(name))[3]
        and assignment.ended_at is null
        and person.auth_user_id = auth.uid()
        and vehicle.status = 'active'
    )
  );
