-- Disposable/local database only. All fixture changes roll back. No external delivery.
begin;
create function pg_temp.native_assert(label text,condition boolean) returns void language plpgsql as $$
begin if condition is not true then raise exception 'Native push test failed: %',label; end if; end; $$;
do $$ declare
  t uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); owner_id uuid:=gen_random_uuid();
  membership uuid:=gen_random_uuid(); rider_a uuid:=gen_random_uuid(); rider_b uuid:=gen_random_uuid();
  session_a uuid:=gen_random_uuid(); session_b uuid:=gen_random_uuid(); install uuid:=gen_random_uuid();
begin
  perform set_config('app.native_tenant',t::text,true); perform set_config('app.native_a',a::text,true);
  perform set_config('app.native_b',b::text,true); perform set_config('app.native_session_a',session_a::text,true);
  perform set_config('app.native_session_b',session_b::text,true); perform set_config('app.native_install',install::text,true);
  perform set_config('app.native_rider_a',rider_a::text,true); perform set_config('app.native_rider_b',rider_b::text,true);
  perform set_config('app.native_slug','native-test-'||t,true);
  insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at)
  select u,'authenticated','authenticated','native-test-'||u||'@example.invalid',now(),now(),now()
  from unnest(array[a,b,owner_id]) u;
  insert into auth.sessions(id,user_id,created_at,updated_at) values(session_a,a,now(),now()),(session_b,b,now(),now());
  insert into public.person_profiles(person_id,auth_user_id,status,display_name,primary_email,normalized_email,activated_at)
  select u,u,'active','Native fixture','native-test-'||u||'@example.invalid','native-test-'||u||'@example.invalid',now()
  from unnest(array[a,b,owner_id]) u;
  insert into public.tenants(tenant_id,status) values(t,'provisioning');
  insert into public.tenant_configurations(tenant_id,tenant_slug,legal_name,display_name,default_time_zone,support_contact_email)
  values(t,current_setting('app.native_slug'),'Native fixture','Native fixture','America/Chicago','native-test@example.invalid');
  insert into public.tenant_memberships(membership_id,tenant_id,person_id,status,activated_at) values(membership,t,owner_id,'active',now());
  insert into public.tenant_role_assignments(tenant_id,membership_id,role_key,status,assigned_at) values(t,membership,'tenant_owner','active',now());
  update public.tenants set status='active',activated_at=now() where tenant_id=t;
  insert into public.rider_profiles(rider_profile_id,tenant_id,person_id,display_name,email)
  values(rider_a,t,a,'Native A','native-test-'||a||'@example.invalid'),(rider_b,t,b,'Native B','native-test-'||b||'@example.invalid');
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('app.native_a'),
  'role','authenticated','session_id',current_setting('app.native_session_a'))::text,true);
select set_config('request.jwt.claim.sub',current_setting('app.native_a'),true);
set local role authenticated;
select pg_temp.native_assert('Register owned device',public.set_my_native_push('rider',current_setting('app.native_install')::uuid,
  'ios',true,repeat('a',64),current_setting('app.native_slug'),current_setting('app.native_a')::uuid));
select pg_temp.native_assert('Owned enabled status',public.my_native_push_enabled('rider',current_setting('app.native_install')::uuid,current_setting('app.native_slug')));
do $$ begin
  begin perform public.set_my_native_push('rider',gen_random_uuid(),'ios',true,repeat('a',64),'foreign-provider',current_setting('app.native_a')::uuid);
    raise exception 'Foreign provider allowed' using errcode='XX000'; exception when raise_exception then null; end;
  begin perform public.set_my_native_push('driver',gen_random_uuid(),'ios',true,repeat('a',64),null,current_setting('app.native_a')::uuid);
    raise exception 'Rider granted Driver subscription' using errcode='XX000'; exception when raise_exception then null; end;
  begin perform public.set_my_native_push('rider',gen_random_uuid(),'ios',true,repeat('a',64),current_setting('app.native_slug'),current_setting('app.native_b')::uuid);
    raise exception 'Stale account allowed' using errcode='XX000'; exception when raise_exception then null; end;
  begin perform * from public.native_push_registrations;
    raise exception 'Raw device token readable' using errcode='XX000'; exception when insufficient_privilege then null; end;
  begin perform public.claim_native_push_attempts();
    raise exception 'Client claimed delivery' using errcode='XX000'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
select pg_temp.native_assert('No token in audit',(select bool_and(metadata::text not like '%'||repeat('a',64)||'%')
  from public.tenant_audit_events where tenant_id=current_setting('app.native_tenant')::uuid));
insert into public.notification_outbox(tenant_id,person_id,rider_profile_id,notification_type,recipient_email,payload,dedupe_key,delivery_status)
values(current_setting('app.native_tenant')::uuid,current_setting('app.native_a')::uuid,current_setting('app.native_rider_a')::uuid,
  'rider_driver_arrived','native-test@example.invalid','{}',gen_random_uuid()::text,'sent');
set local role service_role;
select set_config('app.native_claim',public.claim_native_push_attempts(current_setting('app.native_tenant')::uuid)::text,true);
select pg_temp.native_assert('Claims sent email independently',jsonb_array_length(current_setting('app.native_claim')::jsonb)=1);
select pg_temp.native_assert('No concurrent duplicate claim',jsonb_array_length(public.claim_native_push_attempts(current_setting('app.native_tenant')::uuid))=0);
select pg_temp.native_assert('Wrong claim cannot finish',not public.finish_native_push_attempt(
  (current_setting('app.native_claim')::jsonb->0->>'attemptId')::uuid,gen_random_uuid(),'accepted',200));
select pg_temp.native_assert('Retry saved',public.finish_native_push_attempt(
  (current_setting('app.native_claim')::jsonb->0->>'attemptId')::uuid,
  (current_setting('app.native_claim')::jsonb->0->>'claimId')::uuid,'failed',503,'provider_unavailable'));
reset role;
update public.native_push_attempts set next_attempt_at=now()-interval '1 second' where tenant_id=current_setting('app.native_tenant')::uuid;
set local role service_role;
select set_config('app.native_claim',public.claim_native_push_attempts(current_setting('app.native_tenant')::uuid)::text,true);
select pg_temp.native_assert('Retry claim survives email success',jsonb_array_length(current_setting('app.native_claim')::jsonb)=1);
select public.finish_native_push_attempt((current_setting('app.native_claim')::jsonb->0->>'attemptId')::uuid,
  (current_setting('app.native_claim')::jsonb->0->>'claimId')::uuid,'accepted',200);
reset role;
set local role authenticated;
select public.set_my_native_push('rider',current_setting('app.native_install')::uuid,'ios',false,null,null,current_setting('app.native_a')::uuid);
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('app.native_b'),
  'role','authenticated','session_id',current_setting('app.native_session_b'))::text,true);
select set_config('request.jwt.claim.sub',current_setting('app.native_b'),true);
set local role authenticated;
select pg_temp.native_assert('Other account cannot inherit opt-in',not public.my_native_push_enabled('rider',current_setting('app.native_install')::uuid,current_setting('app.native_slug')));
select public.set_my_native_push('rider',current_setting('app.native_install')::uuid,'ios',true,repeat('a',64),current_setting('app.native_slug'),current_setting('app.native_b')::uuid);
reset role;
select pg_temp.native_assert('Single active binding',(select count(*)=1 and bool_and(person_id=current_setting('app.native_b')::uuid)
  from public.native_push_registrations where installation_id=current_setting('app.native_install')::uuid and status='active'));
insert into public.notification_outbox(tenant_id,person_id,rider_profile_id,notification_type,recipient_email,payload,dedupe_key)
values(current_setting('app.native_tenant')::uuid,current_setting('app.native_b')::uuid,current_setting('app.native_rider_b')::uuid,
  'rider_driver_arrived','native-test@example.invalid','{}',gen_random_uuid()::text);
update public.native_push_attempts set expires_at=now()-interval '1 second' where status='pending' and tenant_id=current_setting('app.native_tenant')::uuid;
set local role service_role;
select pg_temp.native_assert('Expired notifications not sent',jsonb_array_length(public.claim_native_push_attempts(current_setting('app.native_tenant')::uuid))=0);
reset role;
select pg_temp.native_assert('Expired attempts recorded',(select count(*)=1 from public.native_push_attempts where status='expired' and tenant_id=current_setting('app.native_tenant')::uuid));
rollback;
