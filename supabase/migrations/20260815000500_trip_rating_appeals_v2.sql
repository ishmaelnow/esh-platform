-- Audited appeals for disclosed Rider and Driver trip ratings.

alter table public.trip_ratings add constraint trip_ratings_tenant_rating_unique
  unique (tenant_id, rating_id);

create table public.trip_rating_appeals (
  rating_appeal_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  rating_id uuid not null,
  booking_id uuid not null,
  appellant_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  appellant_type text not null,
  reason text not null,
  status text not null default 'submitted',
  resolution_notes text,
  resolved_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  submitted_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint rating_appeals_rating_fk foreign key (tenant_id, rating_id)
    references public.trip_ratings (tenant_id, rating_id) on delete restrict,
  constraint rating_appeals_booking_fk foreign key (tenant_id, booking_id)
    references public.dispatch_bookings (tenant_id, booking_id) on delete restrict,
  constraint rating_appeals_appellant_type_check check (appellant_type in ('rider', 'driver')),
  constraint rating_appeals_reason_check check (length(btrim(reason)) between 10 and 1000),
  constraint rating_appeals_status_check check (status in ('submitted', 'upheld', 'removed')),
  constraint rating_appeals_resolution_check check (
    (status = 'submitted' and resolution_notes is null and resolved_by_person_id is null and resolved_at is null) or
    (status in ('upheld', 'removed') and length(btrim(resolution_notes)) between 5 and 1000
      and resolved_by_person_id is not null and resolved_at is not null)
  ),
  constraint rating_appeals_rating_appellant_unique unique (rating_id, appellant_person_id)
);

create trigger trip_rating_appeals_set_updated_at before update on public.trip_rating_appeals
  for each row execute function public.set_updated_at();
create index trip_rating_appeals_tenant_status_idx
  on public.trip_rating_appeals (tenant_id, status, submitted_at desc);

alter table public.trip_rating_appeals enable row level security;
create policy trip_rating_appeals_manager_select on public.trip_rating_appeals for select to authenticated
  using (public.can_manage_dispatch(tenant_id));
grant select on public.trip_rating_appeals to authenticated;
grant all on public.trip_rating_appeals to service_role;

create or replace function public.submit_my_rider_rating_appeal(
  target_tenant_slug text, target_booking_id uuid, reason_value text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_tenant_id uuid; rider public.rider_profiles; rating public.trip_ratings;
  booking public.dispatch_bookings; appeal_id uuid;
begin
  if length(btrim(reason_value)) not between 10 and 1000 then
    raise exception 'appeal reason must be between 10 and 1000 characters'; end if;
  select config.tenant_id into target_tenant_id from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  where config.tenant_slug = lower(btrim(target_tenant_slug)) and tenant.status = 'active';
  select profile.* into rider from public.rider_profiles profile
  join public.person_profiles person on person.person_id = profile.person_id
  where profile.tenant_id = target_tenant_id and person.auth_user_id = auth.uid() and profile.status = 'active';
  select * into booking from public.dispatch_bookings where tenant_id = target_tenant_id
    and booking_id = target_booking_id and rider_profile_id = rider.rider_profile_id and status = 'completed';
  select * into rating from public.trip_ratings where tenant_id = target_tenant_id
    and booking_id = target_booking_id and reviewer_type = 'driver' and moderation_status = 'visible';
  if booking.booking_id is null or rating.rating_id is null
    or not (booking.completed_at <= now() - interval '7 days' or exists (
    select 1 from public.trip_ratings own where own.booking_id = target_booking_id and own.reviewer_type = 'rider'))
  then raise exception 'a disclosed received rating is required'; end if;
  insert into public.trip_rating_appeals
    (tenant_id, rating_id, booking_id, appellant_person_id, appellant_type, reason)
  values (target_tenant_id, rating.rating_id, target_booking_id, rider.person_id, 'rider', btrim(reason_value))
  returning rating_appeal_id into appeal_id;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (target_tenant_id, 'reputation.rating_appealed', 'person', rider.person_id, '{}',
    'Rider appealed a disclosed rating.', gen_random_uuid(), 'trip_rating_appeal', appeal_id::text,
    jsonb_build_object('rating_id', rating.rating_id, 'booking_id', target_booking_id));
  return appeal_id;
end;
$$;

create or replace function public.submit_my_driver_rating_appeal(target_booking_id uuid, reason_value text)
returns uuid language plpgsql security definer set search_path = public as $$
declare driver public.driver_profiles; rating public.trip_ratings; booking public.dispatch_bookings; appeal_id uuid;
begin
  if length(btrim(reason_value)) not between 10 and 1000 then
    raise exception 'appeal reason must be between 10 and 1000 characters'; end if;
  select profile.* into driver from public.driver_profiles profile
  where profile.driver_profile_id = public.current_driver_profile_id();
  select * into booking from public.dispatch_bookings where tenant_id = driver.tenant_id
    and booking_id = target_booking_id and current_driver_profile_id = driver.driver_profile_id and status = 'completed';
  select * into rating from public.trip_ratings where tenant_id = driver.tenant_id
    and booking_id = target_booking_id and reviewer_type = 'rider' and moderation_status = 'visible';
  if booking.booking_id is null or rating.rating_id is null
    or not (booking.completed_at <= now() - interval '7 days' or exists (
    select 1 from public.trip_ratings own where own.booking_id = target_booking_id and own.reviewer_type = 'driver'))
  then raise exception 'a disclosed received rating is required'; end if;
  insert into public.trip_rating_appeals
    (tenant_id, rating_id, booking_id, appellant_person_id, appellant_type, reason)
  values (driver.tenant_id, rating.rating_id, target_booking_id, driver.person_id, 'driver', btrim(reason_value))
  returning rating_appeal_id into appeal_id;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (driver.tenant_id, 'reputation.rating_appealed', 'person', driver.person_id, '{}',
    'Driver appealed a disclosed rating.', gen_random_uuid(), 'trip_rating_appeal', appeal_id::text,
    jsonb_build_object('rating_id', rating.rating_id, 'booking_id', target_booking_id));
  return appeal_id;
end;
$$;

create or replace function public.my_rider_rating_appeals(target_tenant_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare target_tenant_id uuid; rider_id uuid; actor_id uuid;
begin
  select config.tenant_id into target_tenant_id from public.tenant_configurations config
  join public.tenants tenant on tenant.tenant_id = config.tenant_id
  where config.tenant_slug = lower(btrim(target_tenant_slug));
  rider_id := public.current_rider_profile_id(target_tenant_id);
  select person_id into actor_id from public.rider_profiles where rider_profile_id = rider_id;
  return coalesce((select jsonb_agg(jsonb_build_object('appealId', appeal.rating_appeal_id,
    'bookingId', appeal.booking_id, 'status', appeal.status, 'reason', appeal.reason,
    'resolutionNotes', appeal.resolution_notes, 'submittedAt', appeal.submitted_at,
    'resolvedAt', appeal.resolved_at) order by appeal.submitted_at desc)
    from public.trip_rating_appeals appeal where appeal.tenant_id = target_tenant_id
      and appeal.appellant_person_id = actor_id), '[]'::jsonb);
end;
$$;

create or replace function public.my_driver_rating_appeals()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('appealId', appeal.rating_appeal_id,
    'bookingId', appeal.booking_id, 'status', appeal.status, 'reason', appeal.reason,
    'resolutionNotes', appeal.resolution_notes, 'submittedAt', appeal.submitted_at,
    'resolvedAt', appeal.resolved_at) order by appeal.submitted_at desc), '[]'::jsonb)
  from public.trip_rating_appeals appeal join public.person_profiles person
    on person.person_id = appeal.appellant_person_id where person.auth_user_id = auth.uid();
$$;

create or replace function public.resolve_trip_rating_appeal(
  target_appeal_id uuid, resolution_value text, resolution_notes_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare appeal public.trip_rating_appeals; actor_id uuid := public.current_person_id();
begin
  select * into appeal from public.trip_rating_appeals where rating_appeal_id = target_appeal_id for update;
  if appeal.rating_appeal_id is null or not public.can_manage_dispatch(appeal.tenant_id)
    then raise exception 'appeal resolution access is required'; end if;
  if appeal.status <> 'submitted' then raise exception 'appeal is already resolved'; end if;
  if resolution_value not in ('upheld', 'removed') or length(btrim(resolution_notes_value)) not between 5 and 1000
    then raise exception 'a valid resolution and notes are required'; end if;
  update public.trip_rating_appeals set status = resolution_value, resolution_notes = btrim(resolution_notes_value),
    resolved_by_person_id = actor_id, resolved_at = now() where rating_appeal_id = target_appeal_id;
  if resolution_value = 'removed' then update public.trip_ratings set moderation_status = 'hidden',
    moderation_reason = 'Removed after appeal: ' || btrim(resolution_notes_value), moderated_by_person_id = actor_id,
    moderated_at = now() where rating_id = appeal.rating_id; end if;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
     correlation_id, resource_type, resource_id, metadata)
  values (appeal.tenant_id, 'reputation.rating_appeal_resolved', 'person', actor_id, '{}',
    'Tenant operator resolved a rating appeal.', gen_random_uuid(), 'trip_rating_appeal', appeal.rating_appeal_id::text,
    jsonb_build_object('resolution', resolution_value, 'rating_id', appeal.rating_id));
  return true;
end;
$$;

revoke all on function public.submit_my_rider_rating_appeal(text, uuid, text) from public;
revoke all on function public.submit_my_driver_rating_appeal(uuid, text) from public;
revoke all on function public.my_rider_rating_appeals(text) from public;
revoke all on function public.my_driver_rating_appeals() from public;
revoke all on function public.resolve_trip_rating_appeal(uuid, text, text) from public;
grant execute on function public.submit_my_rider_rating_appeal(text, uuid, text) to authenticated;
grant execute on function public.submit_my_driver_rating_appeal(uuid, text) to authenticated;
grant execute on function public.my_rider_rating_appeals(text) to authenticated;
grant execute on function public.my_driver_rating_appeals() to authenticated;
grant execute on function public.resolve_trip_rating_appeal(uuid, text, text) to authenticated;
