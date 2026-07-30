-- Keep online transitions compatible with the non-null last_offline_at invariant.

create or replace function public.set_my_driver_availability(target_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_driver public.driver_profiles;
  blockers text[];
  previous_status text;
  previous_last_offline_at timestamptz;
  next_changed_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'authentication is required'; end if;
  if target_status not in ('online', 'offline') then
    raise exception 'availability must be online or offline';
  end if;

  select driver.* into target_driver
  from public.driver_profiles driver
  join public.person_profiles person on person.person_id = driver.person_id
  where person.auth_user_id = auth.uid()
  order by driver.created_at
  limit 1
  for update of driver;
  if target_driver.driver_profile_id is null then
    raise exception 'driver profile is unavailable';
  end if;

  blockers := public.driver_service_blockers(target_driver.driver_profile_id);
  if target_status = 'online' and cardinality(blockers) > 0 then
    raise exception 'cannot go online: %', array_to_string(blockers, ', ');
  end if;

  select requested_status, last_offline_at
    into previous_status, previous_last_offline_at
  from public.driver_availability
  where driver_profile_id = target_driver.driver_profile_id;

  insert into public.driver_availability (
    driver_profile_id,
    tenant_id,
    requested_status,
    status_changed_at,
    last_online_at,
    last_offline_at
  ) values (
    target_driver.driver_profile_id,
    target_driver.tenant_id,
    target_status,
    next_changed_at,
    case when target_status = 'online' then next_changed_at end,
    case
      when target_status = 'offline' then next_changed_at
      else coalesce(previous_last_offline_at, next_changed_at)
    end
  )
  on conflict (driver_profile_id) do update set
    requested_status = excluded.requested_status,
    status_changed_at = case
      when driver_availability.requested_status = excluded.requested_status
        then driver_availability.status_changed_at
      else excluded.status_changed_at
    end,
    last_online_at = case
      when excluded.requested_status = 'online' then excluded.status_changed_at
      else driver_availability.last_online_at
    end,
    last_offline_at = case
      when excluded.requested_status = 'offline' then excluded.status_changed_at
      else driver_availability.last_offline_at
    end;

  if previous_status is distinct from target_status then
    insert into public.tenant_audit_events (
      tenant_id,
      event_name,
      actor_type,
      actor_person_id,
      actor_platform_roles,
      reason,
      correlation_id,
      resource_type,
      resource_id,
      metadata
    ) values (
      target_driver.tenant_id,
      'driver.availability_changed',
      'person',
      target_driver.person_id,
      '{}',
      'Driver changed service availability.',
      gen_random_uuid(),
      'driver_profile',
      target_driver.driver_profile_id::text,
      jsonb_build_object('requested_status', target_status)
    );
  end if;

  return public.my_driver_availability();
end;
$$;

grant execute on function public.set_my_driver_availability(text) to authenticated;
