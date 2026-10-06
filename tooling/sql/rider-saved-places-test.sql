-- Owner-run disposable/local database only, with all migrations applied.
-- psql -v ON_ERROR_STOP=1 -f tooling/sql/rider-saved-places-test.sql
-- All fixtures and audit events are rolled back. No real emails or map requests.
begin;
create function pg_temp.place_assert(label text, condition boolean) returns void language plpgsql as $$
begin if condition is not true then raise exception 'Saved place test failed: %',label; end if; end; $$;
do $$ declare
  tenant uuid:=gen_random_uuid(); other_tenant uuid:=gen_random_uuid();
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); manager uuid:=gen_random_uuid();
  rider uuid:=gen_random_uuid(); other_rider uuid:=gen_random_uuid(); other_provider_rider uuid:=gen_random_uuid();
  t uuid; membership uuid;
begin
  perform set_config('app.place_tenant',tenant::text,true);
  perform set_config('app.place_a',a::text,true); perform set_config('app.place_b',b::text,true);
  perform set_config('app.place_manager',manager::text,true);
  perform set_config('app.place_rider',rider::text,true);
  perform set_config('app.place_other',other_rider::text,true);
  perform set_config('app.place_provider_rider',other_provider_rider::text,true);
  perform set_config('app.place_slug','place-test-'||tenant,true);
  perform set_config('app.place_other_slug','place-test-'||other_tenant,true);
  insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at)
    select u,'authenticated','authenticated','place-test-'||u||'@example.invalid',now(),now(),now()
    from unnest(array[a,b,manager]) u;
  insert into public.person_profiles(person_id,auth_user_id,status,display_name,primary_email,normalized_email,activated_at)
    select u,u,'active','Saved place fixture','place-test-'||u||'@example.invalid',
      'place-test-'||u||'@example.invalid',now() from unnest(array[a,b,manager]) u;
  foreach t in array array[tenant,other_tenant] loop
    membership:=gen_random_uuid();
    insert into public.tenants(tenant_id,status) values(t,'provisioning');
    insert into public.tenant_configurations(tenant_id,tenant_slug,legal_name,display_name,default_time_zone,support_contact_email)
      values(t,'place-test-'||t,'Saved place fixture','Saved place fixture','America/Chicago','place-test@example.invalid');
    insert into public.tenant_memberships(membership_id,tenant_id,person_id,status,activated_at)
      values(membership,t,manager,'active',now());
    insert into public.tenant_role_assignments(tenant_id,membership_id,role_key,status,assigned_at)
      values(t,membership,'tenant_owner','active',now());
    update public.tenants set status='active',activated_at=now() where tenant_id=t;
    insert into public.tenant_capabilities(tenant_id,capability_key,enabled,enabled_at)
      values(t,'driver.management',true,now()) on conflict(tenant_id,capability_key)
      do update set enabled=true,enabled_at=now(),disabled_at=null;
  end loop;
  insert into public.rider_profiles(rider_profile_id,tenant_id,person_id,display_name,email)
    values(rider,tenant,a,'Rider A','place-test-'||a||'@example.invalid'),
      (other_rider,tenant,b,'Rider B','place-test-'||b||'@example.invalid'),
      (other_provider_rider,other_tenant,a,'Rider A elsewhere','place-test-'||a||'@example.invalid');
end; $$;
set local role anon;
do $$ begin
  begin perform public.my_rider_saved_places(current_setting('app.place_slug'));
    raise exception 'Anonymous RPC allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.rider_saved_places;
    raise exception 'Anonymous read allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('app.place_a'),true);
set local role authenticated;
select pg_temp.place_assert('Empty initially',public.my_rider_saved_places(current_setting('app.place_slug'))='[]'::jsonb);
select public.save_my_rider_place(current_setting('app.place_slug'),current_setting('app.place_rider')::uuid,'home','Fixture Home',32.79,-96.81);
select public.save_my_rider_place(current_setting('app.place_slug'),current_setting('app.place_rider')::uuid,'work','Fixture Work',32.80,-96.82);
select pg_temp.place_assert('Two places',jsonb_array_length(public.my_rider_saved_places(current_setting('app.place_slug')))=2);
select public.save_my_rider_place(current_setting('app.place_slug'),current_setting('app.place_rider')::uuid,'home','Edited fixture Home',32.81,-96.83);
select pg_temp.place_assert('Update does not duplicate',(select count(*)=2 from public.rider_saved_places));
select pg_temp.place_assert('Other provider empty',public.my_rider_saved_places(current_setting('app.place_other_slug'))='[]'::jsonb);
do $$ begin
  begin perform public.save_my_rider_place(current_setting('app.place_slug'),current_setting('app.place_other')::uuid,'home','Forbidden',0,0);
    raise exception 'Other rider accepted' using errcode='XX000'; exception when raise_exception then null; end;
  begin perform public.save_my_rider_place(current_setting('app.place_other_slug'),current_setting('app.place_rider')::uuid,'home','Forbidden',0,0);
    raise exception 'Other provider identity accepted' using errcode='XX000'; exception when raise_exception then null; end;
  begin perform public.save_my_rider_place(current_setting('app.place_slug'),current_setting('app.place_rider')::uuid,'office','Forbidden',0,0);
    raise exception 'Invalid key accepted' using errcode='XX000'; exception when raise_exception then null; end;
  begin perform public.save_my_rider_place(current_setting('app.place_slug'),current_setting('app.place_rider')::uuid,'home','Forbidden','NaN'::float8,0);
    raise exception 'NaN accepted' using errcode='XX000'; exception when raise_exception then null; end;
  begin perform public.save_my_rider_place(current_setting('app.place_slug'),current_setting('app.place_rider')::uuid,'home',' ',0,0);
    raise exception 'Blank address accepted' using errcode='XX000'; exception when raise_exception then null; end;
  begin update public.rider_saved_places set address_label='Direct write';
    raise exception 'Direct update allowed' using errcode='XX000'; exception when insufficient_privilege then null; end;
  begin delete from public.rider_saved_places;
    raise exception 'Direct delete allowed' using errcode='XX000'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('app.place_b'),true);
set local role authenticated;
select pg_temp.place_assert('Other rider sees no rows',(select count(*)=0 from public.rider_saved_places));
select pg_temp.place_assert('Other rider RPC empty',public.my_rider_saved_places(current_setting('app.place_slug'))='[]'::jsonb);
do $$ begin
  begin perform public.remove_my_rider_place(current_setting('app.place_slug'),current_setting('app.place_rider')::uuid,'home');
    raise exception 'Other rider removed Home' using errcode='XX000'; exception when raise_exception then null; end;
end; $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('app.place_manager'),true);
set local role authenticated;
select pg_temp.place_assert('Manager has no saved address read policy',(select count(*)=0 from public.rider_saved_places));
reset role;
select set_config('request.jwt.claim.sub',current_setting('app.place_a'),true);
set local role authenticated;
select public.remove_my_rider_place(current_setting('app.place_slug'),current_setting('app.place_rider')::uuid,'home');
select pg_temp.place_assert('Only Work remains',public.my_rider_saved_places(current_setting('app.place_slug'))->0->>'key'='work');
reset role;
select pg_temp.place_assert('Audit omits addresses and coordinates',
  (select count(*)=4 and bool_and(metadata ? 'place_key' and not(metadata ? 'label') and not(metadata ? 'latitude')
    and metadata::text not like '%Fixture%' and metadata::text not like '%32.8%')
   from public.tenant_audit_events where tenant_id=current_setting('app.place_tenant')::uuid
    and event_name in ('rider.saved_place_updated','rider.saved_place_removed')));
update auth.users set email_confirmed_at=null where id=current_setting('app.place_a')::uuid;
set local role authenticated;
do $$ begin
  begin perform public.my_rider_saved_places(current_setting('app.place_slug'));
    raise exception 'Unverified access allowed' using errcode='XX000'; exception when raise_exception then null; end;
end; $$;
reset role;
update auth.users set email_confirmed_at=now() where id=current_setting('app.place_a')::uuid;
update public.rider_profiles set status='suspended' where rider_profile_id=current_setting('app.place_rider')::uuid;
set local role authenticated;
do $$ begin
  begin perform public.remove_my_rider_place(current_setting('app.place_slug'),current_setting('app.place_rider')::uuid,'work');
    raise exception 'Inactive profile write allowed' using errcode='XX000'; exception when raise_exception then null; end;
end; $$;
reset role;
rollback;
