-- Rider Account editing and optional private photo. No Auth/session policy changes.
alter table public.rider_profiles
  add column photo_storage_path text,
  add column photo_mime_type text,
  add constraint rider_profile_photo_pair check (
    (photo_storage_path is null and photo_mime_type is null) or
    (photo_storage_path is not null and photo_mime_type is not null
      and photo_mime_type in ('image/jpeg', 'image/png'))
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rider-profile-photos', 'rider-profile-photos', false, 1000000,
  array['image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
-- No client object read/write policy: own-photo API verifies identity before server storage access.

create or replace function public.update_my_rider_profile(
  target_tenant_slug text, display_name_value text, phone_value text default null,
  accessibility_notes_value text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  rider public.rider_profiles;
  target_tenant uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null
  ) then raise exception 'verified email authentication is required'; end if;
  if nullif(btrim(display_name_value), '') is null or length(btrim(display_name_value)) > 120
    or coalesce(length(btrim(phone_value)), 0) > 32
    or coalesce(length(accessibility_notes_value), 0) > 1000 then
    raise exception 'Enter a name up to 120 characters, phone up to 32 and notes up to 1000';
  end if;
  select config.tenant_id into target_tenant from public.tenant_configurations config
    join public.tenants tenant using (tenant_id)
    join public.tenant_capabilities capability using (tenant_id)
    where config.tenant_slug = lower(btrim(target_tenant_slug)) and tenant.status = 'active'
      and capability.capability_key = 'driver.management' and capability.enabled;
  select * into rider from public.rider_profiles profile
    where profile.tenant_id = target_tenant
      and profile.rider_profile_id = public.current_rider_profile_id(target_tenant) for update;
  if rider.rider_profile_id is null then raise exception 'active rider profile is required'; end if;
  update public.rider_profiles set display_name = btrim(display_name_value),
    phone = nullif(btrim(phone_value), ''),
    accessibility_notes = nullif(btrim(accessibility_notes_value), '')
    where rider_profile_id = rider.rider_profile_id and tenant_id = rider.tenant_id;
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (rider.tenant_id, 'rider.profile_updated', 'person', rider.person_id, '{}',
    'Rider updated their own contact profile.', gen_random_uuid(), 'rider_profile',
    rider.rider_profile_id::text, jsonb_build_object('contact_phone_changed',
      rider.phone is distinct from nullif(btrim(phone_value), '')));
  -- Contact storage never grants/transfers SMS consent or number verification.
  return rider.rider_profile_id;
end;
$$;
revoke all on function public.update_my_rider_profile(text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_my_rider_profile(text, text, text, text) to authenticated;

create or replace function public.set_my_rider_profile_photo(
  target_tenant_slug text, storage_path_value text default null, mime_type_value text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rider public.rider_profiles;
  target_tenant uuid;
  expected_prefix text;
begin
  if auth.uid() is null or not exists (
    select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null
  ) then raise exception 'verified email authentication is required'; end if;
  select config.tenant_id into target_tenant from public.tenant_configurations config
    join public.tenants tenant using (tenant_id)
    join public.tenant_capabilities capability using (tenant_id)
    where config.tenant_slug = lower(btrim(target_tenant_slug)) and tenant.status = 'active'
      and capability.capability_key = 'driver.management' and capability.enabled;
  select * into rider from public.rider_profiles profile
    where profile.tenant_id = target_tenant
      and profile.rider_profile_id = public.current_rider_profile_id(target_tenant) for update;
  if rider.rider_profile_id is null then raise exception 'active rider profile is required'; end if;
  expected_prefix := rider.tenant_id::text || '/' || rider.rider_profile_id::text || '/';
  if storage_path_value is null then
    if mime_type_value is not null then raise exception 'invalid photo'; end if;
  elsif mime_type_value is null or mime_type_value not in ('image/jpeg', 'image/png')
    or left(storage_path_value, length(expected_prefix)) <> expected_prefix
    or substring(storage_path_value from length(expected_prefix) + 1) !~
      '^[0-9a-f-]{36}\.(jpg|png)$'
    or not exists (select 1 from storage.objects object
      where object.bucket_id = 'rider-profile-photos' and object.name = storage_path_value) then
    raise exception 'owned uploaded photo is required';
  end if;
  update public.rider_profiles set photo_storage_path = storage_path_value,
    photo_mime_type = mime_type_value where rider_profile_id = rider.rider_profile_id
      and tenant_id = rider.tenant_id;
  insert into public.tenant_audit_events (
    tenant_id, event_name, actor_type, actor_person_id, actor_platform_roles, reason,
    correlation_id, resource_type, resource_id, metadata
  ) values (rider.tenant_id,
    case when storage_path_value is null then 'rider.profile_photo_removed' else 'rider.profile_photo_updated' end,
    'person', rider.person_id, '{}', 'Rider maintained their optional private photo.',
    gen_random_uuid(), 'rider_profile', rider.rider_profile_id::text, '{}'::jsonb);
  return jsonb_build_object('previousPath', rider.photo_storage_path);
end;
$$;
revoke all on function public.set_my_rider_profile_photo(text, text, text) from public, anon, authenticated;
grant execute on function public.set_my_rider_profile_photo(text, text, text) to authenticated;
