-- Active tenant preference is intentionally mutable: one person can select a different active
-- membership. The shared tenant-id immutability trigger was incorrectly attached to this pointer.

drop trigger if exists active_tenant_preferences_prevent_tenant_id_change
  on public.active_tenant_preferences;

create or replace function public.protect_active_tenant_preference_person()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.person_id is distinct from old.person_id then
    raise exception 'active tenant preference person_id cannot be changed';
  end if;
  return new;
end;
$$;

create trigger active_tenant_preferences_protect_person
  before update on public.active_tenant_preferences
  for each row execute function public.protect_active_tenant_preference_person();

revoke all on function public.protect_active_tenant_preference_person()
  from public, anon, authenticated;

comment on function public.protect_active_tenant_preference_person() is
  'Keeps preference ownership immutable while allowing its tenant and membership pointer to switch together.';
