-- Native delivery supplements existing outbox events/preferences. No historical replay.
create table public.native_push_registrations (
  registration_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(tenant_id),
  person_id uuid not null references public.person_profiles(person_id),
  auth_user_id uuid not null references auth.users(id),
  auth_session_id uuid not null,
  rider_profile_id uuid,
  driver_profile_id uuid,
  installation_id uuid not null,
  product text not null check (product in ('rider','driver')),
  platform text not null check (platform in ('ios','android')),
  device_token text not null check (length(device_token) between 32 and 2048),
  status text not null default 'active' check (status in ('active','disabled','expired')),
  created_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),
  disabled_at timestamptz,
  unique (tenant_id, registration_id),
  foreign key (tenant_id,rider_profile_id) references public.rider_profiles(tenant_id,rider_profile_id),
  foreign key (tenant_id,driver_profile_id) references public.driver_profiles(tenant_id,driver_profile_id),
  check ((product='rider' and rider_profile_id is not null and driver_profile_id is null)
    or (product='driver' and driver_profile_id is not null and rider_profile_id is null))
);
create unique index native_push_active_installation on public.native_push_registrations(product,installation_id)
  where status='active';
create unique index native_push_active_token on public.native_push_registrations(product,platform,device_token)
  where status='active';
create table public.native_push_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(tenant_id),
  notification_id uuid not null,
  registration_id uuid not null,
  status text not null default 'pending' check (status in ('pending','sending','accepted','failed','expired')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  claim_id uuid,
  claimed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  expires_at timestamptz not null,
  response_status integer,
  failure_code text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(notification_id,registration_id),
  foreign key (tenant_id,notification_id) references public.notification_outbox(tenant_id,notification_id),
  foreign key (tenant_id,registration_id) references public.native_push_registrations(tenant_id,registration_id)
);
create index native_push_due on public.native_push_attempts(next_attempt_at) where status in ('pending','failed','sending');
alter table public.native_push_registrations enable row level security;
alter table public.native_push_attempts enable row level security;
revoke all on public.native_push_registrations,public.native_push_attempts from public,anon,authenticated;
grant all on public.native_push_registrations,public.native_push_attempts to service_role;

create function public.set_my_native_push(
  product_value text, installation_value uuid, platform_value text,
  enabled_value boolean, token_value text default null, tenant_slug_value text default null,
  owner_auth_user_value uuid default null
) returns boolean language plpgsql security definer set search_path=public as $$
declare actor_id uuid := public.current_person_id(); tenant_value uuid; rider_id uuid; driver_id uuid;
  current_registration public.native_push_registrations; session_value uuid;
begin
  if actor_id is null or auth.uid() is null or owner_auth_user_value is distinct from auth.uid() or installation_value is null
    or product_value is null or platform_value is null
    or product_value not in ('rider','driver') or platform_value not in ('ios','android')
    or enabled_value is null then raise exception 'Native device access is required'; end if;
  -- Serialize rotation, account rebinding and disable for a single installation.
  perform pg_advisory_xact_lock(hashtextextended(product_value||installation_value::text,0));
  if not enabled_value then
    update public.native_push_registrations set status='disabled',disabled_at=now()
    where product=product_value and installation_id=installation_value and person_id=actor_id and status='active';
    insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,
      reason,correlation_id,resource_type,resource_id,metadata)
    select tenant_id,'native_push.disabled','person',actor_id,'{}','Owner disabled device alerts.',
      gen_random_uuid(),'native_push_registration',registration_id::text,'{}'::jsonb
    from public.native_push_registrations where product=product_value and installation_id=installation_value
      and person_id=actor_id and disabled_at=now();
    return false;
  end if;
  if product_value='rider' then
    select tenant_id into tenant_value from public.tenant_configurations where tenant_slug=lower(btrim(tenant_slug_value));
    rider_id := public.current_rider_profile_id(tenant_value);
    if rider_id is null then raise exception 'Rider access is required'; end if;
  else
    driver_id := public.current_driver_profile_id();
    select tenant_id into tenant_value from public.driver_profiles where driver_profile_id=driver_id;
    if driver_id is null then raise exception 'Driver access is required'; end if;
  end if;
  if not exists(select 1 from public.tenants where tenant_id=tenant_value and status='active') then
    raise exception 'Active tenant access is required'; end if;
  session_value := nullif(auth.jwt()->>'session_id','')::uuid;
  if session_value is null or not exists(select 1 from auth.sessions where id=session_value and user_id=auth.uid()
    and (not_after is null or not_after>now())) then raise exception 'An active sign-in session is required'; end if;
  if token_value is null or length(token_value) not between 32 and 2048
    or (platform_value='ios' and token_value !~ '^[0-9a-fA-F]{64,200}$')
    or (platform_value='android' and token_value !~ '^[A-Za-z0-9_:\-]+$') then
    raise exception 'Invalid native registration'; end if;
  -- Never reveal a previous owner's subscription. Refresh only an identical binding.
  perform pg_advisory_xact_lock(hashtextextended(product_value||platform_value||token_value,1));
  select * into current_registration from public.native_push_registrations
    where product=product_value and installation_id=installation_value and status='active' for update;
  if current_registration.person_id=actor_id and current_registration.tenant_id=tenant_value
    and current_registration.auth_session_id=session_value and current_registration.device_token=token_value
    and current_registration.platform=platform_value then
    update public.native_push_registrations set refreshed_at=now() where registration_id=current_registration.registration_id;
    return true;
  end if;
  update public.native_push_registrations set status='disabled',disabled_at=now()
  where product=product_value and status='active' and (installation_id=installation_value
    or (platform=platform_value and device_token=token_value));
  insert into public.native_push_registrations(tenant_id,person_id,auth_user_id,auth_session_id,rider_profile_id,
    driver_profile_id,installation_id,product,platform,device_token)
  values(tenant_value,actor_id,auth.uid(),session_value,rider_id,driver_id,installation_value,product_value,platform_value,token_value)
  returning * into current_registration;
  insert into public.tenant_audit_events(tenant_id,event_name,actor_type,actor_person_id,actor_platform_roles,
    reason,correlation_id,resource_type,resource_id,metadata)
  values(tenant_value,'native_push.enabled','person',actor_id,'{}','Owner enabled device alerts.',gen_random_uuid(),
    'native_push_registration',current_registration.registration_id::text,jsonb_build_object('product',product_value,'platform',platform_value));
  return true;
end; $$;

create function public.my_native_push_enabled(product_value text,installation_value uuid,tenant_slug_value text default null)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.native_push_registrations r
    where r.product=product_value and r.installation_id=installation_value and r.person_id=public.current_person_id()
      and r.status='active' and r.auth_session_id::text=auth.jwt()->>'session_id'
      and exists(select 1 from public.tenants t where t.tenant_id=r.tenant_id and t.status='active')
      and exists(select 1 from auth.sessions s where s.id=r.auth_session_id and s.user_id=r.auth_user_id
        and (s.not_after is null or s.not_after>now()))
      and ((r.product='driver' and r.driver_profile_id=public.current_driver_profile_id())
      or (r.product='rider' and r.rider_profile_id=public.current_rider_profile_id(r.tenant_id)
        and exists(select 1 from public.tenant_configurations c where c.tenant_id=r.tenant_id and c.tenant_slug=tenant_slug_value))))
$$;

create function public.queue_native_push_attempts() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.rider_profile_id is null and new.driver_profile_id is null then return new; end if;
  insert into public.native_push_attempts(tenant_id,notification_id,registration_id,expires_at,next_attempt_at)
  select new.tenant_id,new.notification_id,r.registration_id,
    case when new.notification_type='dispatch_offer_created' then coalesce(
      (select o.expires_at from public.dispatch_offers o where o.offer_id::text=new.payload->>'offer_id'
        and o.tenant_id=new.tenant_id and o.driver_profile_id=new.driver_profile_id),now())
      else greatest(now(),new.available_at)+interval '15 minutes' end,
    greatest(now(),new.available_at)
  from public.native_push_registrations r where r.tenant_id=new.tenant_id and r.status='active'
    and ((r.product='rider' and r.rider_profile_id=new.rider_profile_id)
      or (r.product='driver' and new.rider_profile_id is null and r.driver_profile_id=new.driver_profile_id))
  on conflict do nothing;
  return new;
end; $$;
create trigger notification_outbox_native_push after insert on public.notification_outbox
  for each row execute function public.queue_native_push_attempts();

-- Independent bounded claims, even when email is already sent. No token returned to app clients.
create function public.claim_native_push_attempts(tenant_value uuid default null,notification_value uuid default null,
  limit_value integer default 20,platforms_value text[] default array['ios','android'])
returns jsonb language plpgsql security definer set search_path=public as $$
declare attempt public.native_push_attempts; registration public.native_push_registrations;
  notification public.notification_outbox; result jsonb := '[]'; new_claim uuid;
begin
  update public.native_push_attempts set status='expired',claim_id=null,failure_code='retry_limit'
  where status='sending' and attempt_count>=5 and claimed_at<now()-interval '2 minutes'
    and (tenant_value is null or tenant_id=tenant_value);
  for attempt in select * from public.native_push_attempts a
    where (tenant_value is null or a.tenant_id=tenant_value)
      and (notification_value is null or a.notification_id=notification_value)
      and a.attempt_count<5 and a.next_attempt_at<=now()
      and exists(select 1 from public.native_push_registrations r
        where r.registration_id=a.registration_id and r.platform=any(platforms_value))
      and (a.status in ('pending','failed') or (a.status='sending' and a.claimed_at<now()-interval '2 minutes'))
    order by a.next_attempt_at limit least(greatest(limit_value,1),50) for update skip locked
  loop
    select * into registration from public.native_push_registrations where registration_id=attempt.registration_id;
    select * into notification from public.notification_outbox where notification_id=attempt.notification_id;
    if attempt.expires_at<=now() or registration.status<>'active' or notification.delivery_status='cancelled'
      or not exists(select 1 from public.tenants t where t.tenant_id=registration.tenant_id and t.status='active')
      or registration.refreshed_at<now()-interval '30 days'
      or not exists(select 1 from auth.sessions s where s.id=registration.auth_session_id and s.user_id=registration.auth_user_id
        and (s.not_after is null or s.not_after>now()))
      or not exists(select 1 from public.person_profiles p where p.person_id=registration.person_id and p.status='active'
        and p.auth_user_id=registration.auth_user_id)
      or (registration.product='rider' and not exists(select 1 from public.rider_profiles p
        where p.rider_profile_id=registration.rider_profile_id and p.status='active' and p.person_id=registration.person_id))
      or (registration.product='driver' and not exists(select 1 from public.driver_profiles p
        where p.driver_profile_id=registration.driver_profile_id and p.status='active' and p.person_id=registration.person_id))
      or (notification.notification_type='dispatch_offer_created' and not exists(select 1 from public.dispatch_offers o
        where o.offer_id::text=notification.payload->>'offer_id' and o.tenant_id=notification.tenant_id
          and o.driver_profile_id=registration.driver_profile_id and o.status='pending' and o.expires_at>now())) then
      update public.native_push_attempts set status='expired',claim_id=null,failure_code='no_longer_eligible' where attempt_id=attempt.attempt_id;
      continue;
    end if;
    if not (registration.platform=any(platforms_value)) then continue; end if;
    new_claim := gen_random_uuid();
    update public.native_push_attempts set status='sending',claim_id=new_claim,claimed_at=now(),
      attempt_count=attempt_count+1 where attempt_id=attempt.attempt_id;
    result := result||jsonb_build_array(jsonb_build_object('attemptId',attempt.attempt_id,'claimId',new_claim,
      'registrationId',registration.registration_id,'token',registration.device_token,'platform',registration.platform,
      'product',registration.product,'notificationType',notification.notification_type,
      'tenantSlug',(select tenant_slug from public.tenant_configurations where tenant_id=registration.tenant_id),
      'expiresAt',attempt.expires_at));
  end loop;
  return result;
end; $$;

create function public.finish_native_push_attempt(attempt_value uuid,claim_value uuid,status_value text,response_value integer default null,
  failure_value text default null,expire_registration boolean default false)
returns boolean language plpgsql security definer set search_path=public as $$
declare registration_value uuid;
begin
  if status_value not in ('accepted','failed','expired') then raise exception 'Invalid delivery state'; end if;
  update public.native_push_attempts set status=case when status_value='failed' and attempt_count>=5 then 'expired' else status_value end,
    response_status=response_value,failure_code=left(failure_value,80),claim_id=null,
    next_attempt_at=now()+interval '15 seconds'*power(2,attempt_count),
    accepted_at=case when status_value='accepted' then now() else null end
  where attempt_id=attempt_value and claim_id=claim_value and status='sending' returning registration_id into registration_value;
  if registration_value is null then return false; end if;
  if expire_registration then update public.native_push_registrations set status='expired',disabled_at=now()
    where registration_id=registration_value; end if;
  return true;
end; $$;

revoke all on function public.set_my_native_push(text,uuid,text,boolean,text,text,uuid) from public,anon,authenticated;
revoke all on function public.my_native_push_enabled(text,uuid,text) from public,anon,authenticated;
revoke all on function public.queue_native_push_attempts() from public,anon,authenticated;
revoke all on function public.claim_native_push_attempts(uuid,uuid,integer,text[]) from public,anon,authenticated;
revoke all on function public.finish_native_push_attempt(uuid,uuid,text,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.set_my_native_push(text,uuid,text,boolean,text,text,uuid) to authenticated;
grant execute on function public.my_native_push_enabled(text,uuid,text) to authenticated;
grant execute on function public.claim_native_push_attempts(uuid,uuid,integer,text[]) to service_role;
grant execute on function public.finish_native_push_attempt(uuid,uuid,text,integer,text,boolean) to service_role;
