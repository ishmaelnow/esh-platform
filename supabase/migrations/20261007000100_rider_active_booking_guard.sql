-- One active ride per person across providers; future reservations remain available.
-- Derived private slots make competing activations atomic without changing existing rides.
create table public.rider_active_booking_slots (
  person_id uuid primary key references public.person_profiles(person_id) on delete restrict,
  tenant_id uuid not null,
  booking_id uuid not null unique,
  foreign key (tenant_id,booking_id) references public.dispatch_bookings(tenant_id,booking_id) on delete cascade
);
alter table public.rider_active_booking_slots enable row level security;
revoke all on public.rider_active_booking_slots from public,anon,authenticated;
grant all on public.rider_active_booking_slots to service_role;

-- Preserve legacy duplicates instead of cancelling or rewriting financial records.
insert into public.rider_active_booking_slots(person_id,tenant_id,booking_id)
select distinct on (r.person_id) r.person_id,b.tenant_id,b.booking_id
from public.dispatch_bookings b join public.rider_profiles r
  on r.rider_profile_id=b.rider_profile_id and r.tenant_id=b.tenant_id
where b.status in ('requested','offered','accepted','arrived','in_progress')
order by r.person_id,b.created_at,b.booking_id;

create function public.enforce_rider_active_booking()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_id uuid; continuing boolean := false;
begin
  if tg_op='UPDATE' and old.status in ('requested','offered','accepted','arrived','in_progress')
    and (old.rider_profile_id is distinct from new.rider_profile_id or old.tenant_id<>new.tenant_id) then
    raise exception 'An active ride cannot be moved to another Rider or provider.' using errcode='P5501';
  end if;
  if new.rider_profile_id is null then return new; end if;
  select person_id into owner_id from public.rider_profiles
    where rider_profile_id=new.rider_profile_id and tenant_id=new.tenant_id;
  if owner_id is null then return new; end if; -- Existing foreign keys reject invalid ownership.
  if tg_op='UPDATE' then
    continuing := old.status in ('requested','offered','accepted','arrived','in_progress');
  end if;
  if new.status in ('requested','offered','accepted','arrived','in_progress') then
    if continuing then return new; end if; -- Let preexisting rides finish, including legacy duplicates.
    if exists(select 1 from public.dispatch_bookings b join public.rider_profiles r
      on r.rider_profile_id=b.rider_profile_id and r.tenant_id=b.tenant_id
      where r.person_id=owner_id and b.booking_id<>new.booking_id
        and b.status in ('requested','offered','accepted','arrived','in_progress')) then
      raise exception 'Finish or cancel your current ride before requesting another.' using errcode='P5501';
    end if;
    begin
      insert into public.rider_active_booking_slots values(owner_id,new.tenant_id,new.booking_id);
    exception when unique_violation then
      raise exception 'Finish or cancel your current ride before requesting another.' using errcode='P5501';
    end;
  else
    delete from public.rider_active_booking_slots where booking_id=new.booking_id;
    -- If legacy duplicates existed, retain a slot for the remaining active ride.
    insert into public.rider_active_booking_slots(person_id,tenant_id,booking_id)
    select owner_id,b.tenant_id,b.booking_id from public.dispatch_bookings b join public.rider_profiles r
      on r.rider_profile_id=b.rider_profile_id and r.tenant_id=b.tenant_id
      where r.person_id=owner_id and b.status in ('requested','offered','accepted','arrived','in_progress')
      order by b.created_at,b.booking_id limit 1 on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function public.enforce_rider_active_booking() from public,anon,authenticated;
create trigger rider_active_booking_guard after insert or update of status,rider_profile_id,tenant_id
  on public.dispatch_bookings for each row execute function public.enforce_rider_active_booking();

create function public.my_rider_has_active_booking()
returns boolean language plpgsql stable security definer set search_path=public as $$
declare owner_id uuid := public.current_person_id();
begin
  if auth.uid() is null or owner_id is null then raise exception 'Sign in to check your current ride.'; end if;
  return exists(select 1 from public.dispatch_bookings b join public.rider_profiles r
    on r.rider_profile_id=b.rider_profile_id and r.tenant_id=b.tenant_id
    where r.person_id=owner_id and b.status in ('requested','offered','accepted','arrived','in_progress'));
end; $$;
revoke all on function public.my_rider_has_active_booking() from public,anon,authenticated;
grant execute on function public.my_rider_has_active_booking() to authenticated;

-- A blocked scheduled activation waits without rolling back other Riders' due trips.
create function public.activate_unblocked_rider_bookings_internal(tenant_value uuid default null)
returns integer language plpgsql security definer set search_path=public as $$
declare booking_value uuid; activated integer := 0;
begin
  for booking_value in select scheduled.booking_id from public.dispatch_bookings scheduled
    where scheduled.status='scheduled' and scheduled.dispatch_ready_at<=now()
      and (tenant_value is null or scheduled.tenant_id=tenant_value)
      and not exists(select 1 from public.rider_profiles owner join public.rider_profiles other
        on other.person_id=owner.person_id join public.dispatch_bookings active
        on active.rider_profile_id=other.rider_profile_id and active.tenant_id=other.tenant_id
        where owner.rider_profile_id=scheduled.rider_profile_id and owner.tenant_id=scheduled.tenant_id
          and active.status in ('requested','offered','accepted','arrived','in_progress'))
    order by scheduled.dispatch_ready_at,scheduled.created_at,scheduled.booking_id
    limit 100 for update of scheduled skip locked
  loop
    begin
      update public.dispatch_bookings set status='requested' where booking_id=booking_value;
      activated := activated+1;
    exception when sqlstate 'P5501' then null;
    end;
  end loop;
  return activated;
end; $$;
revoke all on function public.activate_unblocked_rider_bookings_internal(uuid) from public,anon,authenticated;
grant execute on function public.activate_unblocked_rider_bookings_internal(uuid) to service_role;

create or replace function public.activate_due_scheduled_bookings(target_tenant_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
begin
  if target_tenant_id is null or not coalesce((auth.role()='service_role' or public.can_manage_dispatch(target_tenant_id)
    or public.current_rider_profile_id(target_tenant_id) is not null
    or exists(select 1 from public.driver_profiles where tenant_id=target_tenant_id
      and driver_profile_id=public.current_driver_profile_id())),false) then
    raise exception 'dispatch access is required';
  end if;
  return public.activate_unblocked_rider_bookings_internal(target_tenant_id);
end; $$;
create or replace function public.activate_all_due_scheduled_bookings()
returns integer language plpgsql security definer set search_path=public as $$
  begin return public.activate_unblocked_rider_bookings_internal(null); end; $$;
