-- Serialize driver-number allocation per tenant so concurrent approvals cannot choose the same number.

create or replace function public.approve_driver_application(
  target_application_id uuid,
  actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.driver_applications;
  new_driver uuid;
  next_driver_number bigint;
begin
  if not public.can_manage_driver_management(
    (select tenant_id from public.driver_applications where driver_application_id = target_application_id)
  ) then
    raise exception 'driver management permission is required';
  end if;

  select * into app
  from public.driver_applications
  where driver_application_id = target_application_id
  for update;

  if app.driver_application_id is null then raise exception 'application not found'; end if;
  if app.application_status = 'approved' and app.driver_profile_id is not null then
    return app.driver_profile_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(app.tenant_id::text, 0));

  select coalesce(max(driver_number::bigint), 0) + 1
  into next_driver_number
  from public.driver_profiles
  where tenant_id = app.tenant_id
    and driver_number ~ '^[0-9]+$';

  insert into public.driver_profiles (
    tenant_id, driver_number, display_name, email, phone, status,
    created_by_person_id, updated_by_person_id
  )
  values (
    app.tenant_id,
    lpad(next_driver_number::text, greatest(3, length(next_driver_number::text)), '0'),
    app.full_name, app.email, app.phone, 'draft', actor_id, actor_id
  )
  returning driver_profile_id into new_driver;

  update public.driver_applications
  set application_status = 'approved', driver_profile_id = new_driver,
      reviewed_by_person_id = actor_id, reviewed_at = now()
  where driver_application_id = target_application_id;

  update public.driver_evidence
  set driver_profile_id = new_driver
  where driver_application_id = target_application_id;

  perform public.sync_driver_document_compliance(new_driver);
  return new_driver;
end;
$$;
