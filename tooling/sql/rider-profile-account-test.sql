-- Owner-run disposable/local database only; all migrations required. No real file uploads.
-- psql -v ON_ERROR_STOP=1 -f tooling/sql/rider-profile-account-test.sql
begin;
create function pg_temp.rider_assert(label text, condition boolean) returns void
language plpgsql as $$ begin
  if condition is not true then raise exception 'Rider profile test failed: %', label; end if;
end; $$;
do $$ declare
  tenant uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  owner_id uuid := gen_random_uuid(); membership uuid := gen_random_uuid();
  rider_a uuid := gen_random_uuid(); rider_b uuid := gen_random_uuid();
begin
  perform set_config('app.rider_test_tenant', tenant::text, true);
  perform set_config('app.rider_test_a', a::text, true);
  perform set_config('app.rider_test_b', b::text, true);
  perform set_config('app.rider_test_profile', rider_a::text, true);
  perform set_config('app.rider_test_other', rider_b::text, true);
  perform set_config('app.rider_test_slug', 'rider-test-' || tenant, true);
  insert into auth.users(id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, 'authenticated', 'authenticated', 'rider-test-' || u || '@example.invalid', now(), now(), now()
  from unnest(array[a,b,owner_id]) u;
  insert into public.person_profiles(person_id, auth_user_id, status, display_name,
    primary_email, normalized_email, activated_at)
  select u, u, 'active', 'Rider fixture', 'rider-test-' || u || '@example.invalid',
    'rider-test-' || u || '@example.invalid', now() from unnest(array[a,b,owner_id]) u;
  insert into public.tenants(tenant_id,status) values(tenant,'provisioning');
  insert into public.tenant_configurations(tenant_id,tenant_slug,legal_name,display_name,
    default_time_zone,support_contact_email)
  values(tenant,current_setting('app.rider_test_slug'),'Rider fixture','Rider fixture',
    'America/Chicago','rider-test@example.invalid');
  insert into public.tenant_memberships(membership_id,tenant_id,person_id,status,activated_at)
  values(membership,tenant,owner_id,'active',now());
  insert into public.tenant_role_assignments(tenant_id,membership_id,role_key,status,assigned_at)
  values(tenant,membership,'tenant_owner','active',now());
  update public.tenants set status='active',activated_at=now() where tenant_id=tenant;
  insert into public.tenant_capabilities(tenant_id,capability_key,enabled,enabled_at)
  values(tenant,'driver.management',true,now()) on conflict(tenant_id,capability_key)
  do update set enabled=true,enabled_at=now(),disabled_at=null;
  insert into public.rider_profiles(rider_profile_id,tenant_id,person_id,display_name,email)
  values(rider_a,tenant,a,'Rider A','rider-test-' || a || '@example.invalid'),
    (rider_b,tenant,b,'Rider B','rider-test-' || b || '@example.invalid');
  perform set_config('app.rider_test_path',tenant || '/' || rider_a || '/' || gen_random_uuid() || '.jpg',true);
  perform set_config('app.rider_test_foreign',tenant || '/' || rider_b || '/' || gen_random_uuid() || '.jpg',true);
  insert into storage.objects(bucket_id,name) values
    ('rider-profile-photos',current_setting('app.rider_test_path')),
    ('rider-profile-photos',current_setting('app.rider_test_foreign'));
end; $$;
set local role anon;
do $$ begin
  begin
    perform public.update_my_rider_profile(current_setting('app.rider_test_slug'),'Forbidden');
    raise exception 'Anonymous update succeeded' using errcode='XX000';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('app.rider_test_a'),true);
set local role authenticated;
select public.update_my_rider_profile(current_setting('app.rider_test_slug'),'Edited A','+15555550123','Test notes');
select pg_temp.rider_assert('Own profile updated',(select display_name='Edited A' and phone='+15555550123'
  from public.rider_profiles where rider_profile_id=current_setting('app.rider_test_profile')::uuid));
select pg_temp.rider_assert('Other rider hidden',not exists(select 1 from public.rider_profiles
  where rider_profile_id=current_setting('app.rider_test_other')::uuid));
do $$ begin
  begin
    perform public.update_my_rider_profile(current_setting('app.rider_test_slug'),' ');
    raise exception 'Blank name accepted' using errcode='XX000';
  exception when raise_exception then null; end;
  begin
    perform public.update_my_rider_profile('missing-provider','Forbidden');
    raise exception 'Unknown tenant accepted' using errcode='XX000';
  exception when raise_exception then null; end;
  begin
    perform public.set_my_rider_profile_photo(current_setting('app.rider_test_slug'),
      current_setting('app.rider_test_foreign'),'image/jpeg');
    raise exception 'Foreign photo accepted' using errcode='XX000';
  exception when raise_exception then null; end;
  begin
    update public.rider_profiles set display_name='Direct write';
    raise exception 'Direct write accepted' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name) values('rider-profile-photos','forbidden.jpg');
    raise exception 'Browser storage write accepted' using errcode='XX000';
  exception when insufficient_privilege then null; end;
end; $$;
select public.set_my_rider_profile_photo(current_setting('app.rider_test_slug'),
  current_setting('app.rider_test_path'),'image/jpeg');
select pg_temp.rider_assert('Own photo persisted',(select photo_storage_path=current_setting('app.rider_test_path')
  from public.rider_profiles where rider_profile_id=current_setting('app.rider_test_profile')::uuid));
select public.set_my_rider_profile_photo(current_setting('app.rider_test_slug'),null,null);
select pg_temp.rider_assert('Photo removed',(select photo_storage_path is null and photo_mime_type is null
  from public.rider_profiles where rider_profile_id=current_setting('app.rider_test_profile')::uuid));
reset role;
select pg_temp.rider_assert('Other record unchanged',(select display_name='Rider B' and photo_storage_path is null
  from public.rider_profiles where rider_profile_id=current_setting('app.rider_test_other')::uuid));
select pg_temp.rider_assert('Private bucket',(select not public from storage.buckets where id='rider-profile-photos'));
select pg_temp.rider_assert('Audit contains no contact or path',
  (select count(*)=3 and bool_and(metadata::text not like '%15555550123%'
    and metadata::text not like '%' || current_setting('app.rider_test_path') || '%')
   from public.tenant_audit_events where tenant_id=current_setting('app.rider_test_tenant')::uuid
     and event_name in ('rider.profile_updated','rider.profile_photo_updated','rider.profile_photo_removed')));
update auth.users set email_confirmed_at=null where id=current_setting('app.rider_test_a')::uuid;
set local role authenticated;
do $$ begin
  begin
    perform public.update_my_rider_profile(current_setting('app.rider_test_slug'),'Unverified');
    raise exception 'Unverified update accepted' using errcode='XX000';
  exception when raise_exception then null; end;
end; $$;
reset role;
rollback;
