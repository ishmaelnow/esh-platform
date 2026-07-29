-- Let a vehicle be created before it is assigned, then let the assigned driver upload its photo.

alter table public.vehicles drop constraint vehicles_photo_required_check;
alter table public.vehicles add constraint vehicles_photo_complete_check check (
  (photo_storage_path is null and photo_storage_bucket is null and photo_original_file_name is null
    and photo_mime_type is null and photo_size_bytes is null)
  or
  (photo_storage_path is not null and photo_storage_bucket is not null
    and photo_original_file_name is not null and photo_mime_type in ('image/jpeg', 'image/png')
    and photo_size_bytes between 1 and 5000000)
);

create or replace function public.submit_my_vehicle_photo(
  target_vehicle_id uuid,
  target_storage_path text,
  target_original_file_name text,
  target_mime_type text,
  target_size_bytes bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_user uuid := auth.uid();
  target_tenant_id uuid;
  target_driver_profile_id uuid;
  storage_object storage.objects;
begin
  if auth_user is null then raise exception 'authentication is required'; end if;
  if target_mime_type not in ('image/jpeg', 'image/png')
    or target_size_bytes not between 1 and 5000000
    or length(btrim(target_original_file_name)) = 0
  then
    raise exception 'vehicle photos must be JPEG or PNG and 5MB or smaller';
  end if;

  select assignment.tenant_id, assignment.driver_profile_id
    into target_tenant_id, target_driver_profile_id
  from public.driver_vehicle_assignments assignment
  join public.driver_profiles driver
    on driver.driver_profile_id = assignment.driver_profile_id
  join public.person_profiles person on person.person_id = driver.person_id
  join public.vehicles vehicle on vehicle.vehicle_id = assignment.vehicle_id
  where assignment.vehicle_id = target_vehicle_id
    and assignment.ended_at is null
    and person.auth_user_id = auth_user
    and vehicle.status = 'active';

  if target_tenant_id is null then
    raise exception 'an active assigned vehicle is required';
  end if;
  if target_storage_path not like
    'vehicle-self-service/' || auth_user::text || '/' || target_vehicle_id::text || '/%'
  then
    raise exception 'invalid vehicle photo path';
  end if;

  select object.* into storage_object
  from storage.objects object
  where object.bucket_id = 'driver-application-files'
    and object.name = target_storage_path;
  if storage_object.id is null then raise exception 'uploaded vehicle photo was not found'; end if;
  if coalesce((storage_object.metadata ->> 'size')::bigint, 0) <> target_size_bytes
    or coalesce(storage_object.metadata ->> 'mimetype', '') <> target_mime_type
  then
    raise exception 'uploaded vehicle photo metadata does not match';
  end if;

  update public.vehicles set
    photo_storage_bucket = 'driver-application-files',
    photo_storage_path = target_storage_path,
    photo_original_file_name = btrim(target_original_file_name),
    photo_mime_type = target_mime_type,
    photo_size_bytes = target_size_bytes,
    updated_by_person_id = public.current_person_id()
  where tenant_id = target_tenant_id and vehicle_id = target_vehicle_id;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles,
    reason, correlation_id, resource_type, resource_id, metadata
  ) values (
    target_tenant_id, 'vehicle.photo_submitted', 'person', public.current_person_id(), '{}',
    'Assigned driver uploaded the vehicle photo.', gen_random_uuid(), 'vehicle',
    target_vehicle_id::text,
    jsonb_build_object('driver_profile_id', target_driver_profile_id)
  );
  return true;
end;
$$;

revoke all on function public.submit_my_vehicle_photo(uuid, text, text, text, bigint)
  from public, anon;
grant execute on function public.submit_my_vehicle_photo(uuid, text, text, text, bigint)
  to authenticated;
