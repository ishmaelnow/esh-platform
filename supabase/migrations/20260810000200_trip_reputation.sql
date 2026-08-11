-- Privacy-delayed post-trip Rider and Driver ratings.

create table public.trip_ratings (
  rating_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  booking_id uuid not null,
  reviewer_type text not null,
  reviewer_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  subject_driver_profile_id uuid,
  subject_rider_profile_id uuid,
  overall_rating smallint not null,
  criteria jsonb not null,
  comment text,
  moderation_status text not null default 'visible',
  moderation_reason text,
  moderated_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  moderated_at timestamptz,
  submitted_at timestamptz not null default now(),
  constraint trip_ratings_booking_fk foreign key (tenant_id, booking_id)
    references public.dispatch_bookings (tenant_id, booking_id) on delete restrict,
  constraint trip_ratings_driver_fk foreign key (tenant_id, subject_driver_profile_id)
    references public.driver_profiles (tenant_id, driver_profile_id) on delete restrict,
  constraint trip_ratings_rider_fk foreign key (tenant_id, subject_rider_profile_id)
    references public.rider_profiles (tenant_id, rider_profile_id) on delete restrict,
  constraint trip_ratings_reviewer_type_check check (reviewer_type in ('rider', 'driver')),
  constraint trip_ratings_overall_check check (overall_rating between 1 and 5),
  constraint trip_ratings_comment_check check (comment is null or length(comment) <= 1000),
  constraint trip_ratings_moderation_check check (
    moderation_status in ('visible', 'hidden')
    and ((moderation_status = 'visible' and moderation_reason is null
      and moderated_by_person_id is null and moderated_at is null)
      or (moderation_status = 'hidden' and moderation_reason is not null
        and moderated_by_person_id is not null and moderated_at is not null))
  ),
  constraint trip_ratings_subject_check check (
    (reviewer_type = 'rider' and subject_driver_profile_id is not null
      and subject_rider_profile_id is null)
    or (reviewer_type = 'driver' and subject_driver_profile_id is null
      and subject_rider_profile_id is not null)
  ),
  constraint trip_ratings_criteria_check check (
    jsonb_typeof(criteria) = 'object'
    and criteria ? 'communication'
    and (criteria->>'communication')::integer between 1 and 5
    and case reviewer_type
      when 'rider' then
        criteria ? 'safety' and criteria ? 'vehicle_cleanliness'
        and criteria - array['communication', 'safety', 'vehicle_cleanliness'] = '{}'::jsonb
        and (criteria->>'safety')::integer between 1 and 5
        and (criteria->>'vehicle_cleanliness')::integer between 1 and 5
      else
        criteria ? 'readiness' and criteria ? 'respect'
        and criteria - array['communication', 'readiness', 'respect'] = '{}'::jsonb
        and (criteria->>'readiness')::integer between 1 and 5
        and (criteria->>'respect')::integer between 1 and 5
    end
  ),
  constraint trip_ratings_booking_reviewer_unique unique (booking_id, reviewer_type)
);

create index trip_ratings_tenant_submitted_idx
  on public.trip_ratings (tenant_id, submitted_at desc);
create index trip_ratings_driver_idx
  on public.trip_ratings (subject_driver_profile_id, submitted_at desc)
  where moderation_status = 'visible';
create index trip_ratings_rider_idx
  on public.trip_ratings (subject_rider_profile_id, submitted_at desc)
  where moderation_status = 'visible';

alter table public.trip_ratings enable row level security;
create policy trip_ratings_manager_select on public.trip_ratings
  for select to authenticated using (public.can_manage_dispatch(tenant_id));
grant select on public.trip_ratings to authenticated;
grant all on public.trip_ratings to service_role;

create or replace function public.submit_my_rider_trip_rating(
  target_booking_id uuid,
  overall_rating_value integer,
  safety_rating_value integer,
  communication_rating_value integer,
  vehicle_cleanliness_rating_value integer,
  comment_value text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  booking public.dispatch_bookings;
  rider public.rider_profiles;
  new_rating_id uuid;
begin
  select * into booking from public.dispatch_bookings
  where booking_id = target_booking_id for update;
  if booking.booking_id is null or booking.rider_profile_id is null
    or booking.status <> 'completed' or booking.completed_at < now() - interval '30 days'
  then raise exception 'completed trip is unavailable for rating'; end if;
  select * into rider from public.rider_profiles
  where rider_profile_id = public.current_rider_profile_id(booking.tenant_id);
  if rider.rider_profile_id is null or rider.rider_profile_id <> booking.rider_profile_id then
    raise exception 'rider trip access is required';
  end if;
  if booking.current_driver_profile_id is null then raise exception 'completed Driver is unavailable'; end if;
  if overall_rating_value not between 1 and 5
    or safety_rating_value not between 1 and 5
    or communication_rating_value not between 1 and 5
    or vehicle_cleanliness_rating_value not between 1 and 5
  then raise exception 'ratings must be between 1 and 5'; end if;

  insert into public.trip_ratings (
    tenant_id, booking_id, reviewer_type, reviewer_person_id,
    subject_driver_profile_id, overall_rating, criteria, comment
  ) values (
    booking.tenant_id, booking.booking_id, 'rider', rider.person_id,
    booking.current_driver_profile_id, overall_rating_value,
    jsonb_build_object('safety', safety_rating_value, 'communication', communication_rating_value,
      'vehicle_cleanliness', vehicle_cleanliness_rating_value),
    nullif(btrim(comment_value), '')
  ) returning rating_id into new_rating_id;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    booking.tenant_id, 'reputation.rider_rating_submitted', 'person', rider.person_id, '{}',
    'Rider submitted a post-trip rating.', gen_random_uuid(), 'trip_rating', new_rating_id::text,
    jsonb_build_object('booking_id', booking.booking_id, 'subject_driver_profile_id', booking.current_driver_profile_id)
  );
  return new_rating_id;
end;
$$;

create or replace function public.submit_my_driver_trip_rating(
  target_booking_id uuid,
  overall_rating_value integer,
  communication_rating_value integer,
  readiness_rating_value integer,
  respect_rating_value integer,
  comment_value text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  booking public.dispatch_bookings;
  driver public.driver_profiles;
  new_rating_id uuid;
begin
  select * into booking from public.dispatch_bookings
  where booking_id = target_booking_id for update;
  select * into driver from public.driver_profiles
  where driver_profile_id = public.current_driver_profile_id();
  if booking.booking_id is null or driver.driver_profile_id is null
    or booking.current_driver_profile_id <> driver.driver_profile_id
    or booking.rider_profile_id is null or booking.status <> 'completed'
    or booking.completed_at < now() - interval '30 days'
  then raise exception 'completed Rider trip is unavailable for rating'; end if;
  if overall_rating_value not between 1 and 5
    or communication_rating_value not between 1 and 5
    or readiness_rating_value not between 1 and 5
    or respect_rating_value not between 1 and 5
  then raise exception 'ratings must be between 1 and 5'; end if;

  insert into public.trip_ratings (
    tenant_id, booking_id, reviewer_type, reviewer_person_id,
    subject_rider_profile_id, overall_rating, criteria, comment
  ) values (
    booking.tenant_id, booking.booking_id, 'driver', driver.person_id,
    booking.rider_profile_id, overall_rating_value,
    jsonb_build_object('communication', communication_rating_value, 'readiness', readiness_rating_value,
      'respect', respect_rating_value), nullif(btrim(comment_value), '')
  ) returning rating_id into new_rating_id;

  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    booking.tenant_id, 'reputation.driver_rating_submitted', 'person', driver.person_id, '{}',
    'Driver submitted a post-trip rating.', gen_random_uuid(), 'trip_rating', new_rating_id::text,
    jsonb_build_object('booking_id', booking.booking_id, 'subject_rider_profile_id', booking.rider_profile_id)
  );
  return new_rating_id;
end;
$$;

create or replace function public.my_rider_reputation(target_tenant_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  target_tenant_id uuid;
  rider_id uuid;
  result jsonb;
begin
  select config.tenant_id into target_tenant_id
  from public.tenant_configurations config join public.tenants tenant using (tenant_id)
  where config.tenant_slug = lower(btrim(target_tenant_slug)) and tenant.status = 'active';
  rider_id := public.current_rider_profile_id(target_tenant_id);
  if rider_id is null then raise exception 'active Rider profile is required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'bookingId', booking.booking_id,
    'completedAt', booking.completed_at,
    'pickupAddress', booking.pickup_address,
    'destinationAddress', booking.destination_address,
    'subjectName', driver.display_name,
    'canSubmit', booking.completed_at >= now() - interval '30 days' and own.rating_id is null,
    'submittedRating', case when own.rating_id is null then null else jsonb_build_object(
      'overall', own.overall_rating, 'criteria', own.criteria, 'comment', own.comment,
      'submittedAt', own.submitted_at) end,
    'receivedRating', case when received.rating_id is not null
      and received.moderation_status = 'visible'
      and (own.rating_id is not null or booking.completed_at <= now() - interval '7 days')
      then jsonb_build_object('overall', received.overall_rating, 'criteria', received.criteria,
        'comment', received.comment, 'submittedAt', received.submitted_at) else null end
  ) order by booking.completed_at desc), '[]'::jsonb) into result
  from public.dispatch_bookings booking
  join public.driver_profiles driver on driver.driver_profile_id = booking.current_driver_profile_id
  left join public.trip_ratings own on own.booking_id = booking.booking_id and own.reviewer_type = 'rider'
  left join public.trip_ratings received on received.booking_id = booking.booking_id and received.reviewer_type = 'driver'
  where booking.tenant_id = target_tenant_id and booking.rider_profile_id = rider_id
    and booking.status = 'completed';
  return result;
end;
$$;

create or replace function public.my_driver_reputation()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  driver_id uuid := public.current_driver_profile_id();
  result jsonb;
begin
  if driver_id is null then raise exception 'active Driver profile is required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'bookingId', booking.booking_id,
    'completedAt', booking.completed_at,
    'pickupAddress', booking.pickup_address,
    'destinationAddress', booking.destination_address,
    'subjectName', rider.display_name,
    'canSubmit', booking.completed_at >= now() - interval '30 days' and own.rating_id is null,
    'submittedRating', case when own.rating_id is null then null else jsonb_build_object(
      'overall', own.overall_rating, 'criteria', own.criteria, 'comment', own.comment,
      'submittedAt', own.submitted_at) end,
    'receivedRating', case when received.rating_id is not null
      and received.moderation_status = 'visible'
      and (own.rating_id is not null or booking.completed_at <= now() - interval '7 days')
      then jsonb_build_object('overall', received.overall_rating, 'criteria', received.criteria,
        'comment', received.comment, 'submittedAt', received.submitted_at) else null end
  ) order by booking.completed_at desc), '[]'::jsonb) into result
  from public.dispatch_bookings booking
  join public.rider_profiles rider on rider.rider_profile_id = booking.rider_profile_id
  left join public.trip_ratings own on own.booking_id = booking.booking_id and own.reviewer_type = 'driver'
  left join public.trip_ratings received on received.booking_id = booking.booking_id and received.reviewer_type = 'rider'
  where booking.current_driver_profile_id = driver_id and booking.status = 'completed';
  return result;
end;
$$;

create or replace function public.moderate_trip_rating(
  target_rating_id uuid,
  target_status text,
  reason_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  rating public.trip_ratings;
  actor_id uuid := public.current_person_id();
begin
  select * into rating from public.trip_ratings where rating_id = target_rating_id for update;
  if rating.rating_id is null or not public.can_manage_dispatch(rating.tenant_id) then
    raise exception 'rating moderation access is required';
  end if;
  if target_status not in ('visible', 'hidden') then raise exception 'invalid moderation status'; end if;
  if target_status = 'hidden' and nullif(btrim(reason_value), '') is null then
    raise exception 'moderation reason is required';
  end if;
  update public.trip_ratings set
    moderation_status = target_status,
    moderation_reason = case when target_status = 'hidden' then btrim(reason_value) else null end,
    moderated_by_person_id = case when target_status = 'hidden' then actor_id else null end,
    moderated_at = case when target_status = 'hidden' then now() else null end
  where rating_id = target_rating_id;
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (
    rating.tenant_id, 'reputation.rating_moderated', 'person', actor_id, '{}',
    coalesce(nullif(btrim(reason_value), ''), 'Rating restored to visible.'), gen_random_uuid(),
    'trip_rating', rating.rating_id::text, jsonb_build_object('status', target_status)
  );
  return true;
end;
$$;

revoke all on function public.submit_my_rider_trip_rating(uuid, integer, integer, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.submit_my_driver_trip_rating(uuid, integer, integer, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.my_rider_reputation(text) from public, anon, authenticated;
revoke all on function public.my_driver_reputation() from public, anon, authenticated;
revoke all on function public.moderate_trip_rating(uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_my_rider_trip_rating(uuid, integer, integer, integer, integer, text)
  to authenticated;
grant execute on function public.submit_my_driver_trip_rating(uuid, integer, integer, integer, integer, text)
  to authenticated;
grant execute on function public.my_rider_reputation(text) to authenticated;
grant execute on function public.my_driver_reputation() to authenticated;
grant execute on function public.moderate_trip_rating(uuid, text, text) to authenticated;
