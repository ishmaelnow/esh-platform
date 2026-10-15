-- Disabled independent product foundation. No enrollment, entitlement or dispatch backfill.
insert into public.product_workspace_catalog (workspace_key, display_name, description, sort_order)
values ('student_transportation', 'Student Transportation',
  'Independent student enrollment, authorized handoff and shared school routes.', 30);

insert into public.workspace_role_catalog
  (workspace_key, role_key, display_name, description, assignable)
values
  ('student_transportation', 'student_transport_admin', 'Student transportation administrator', 'Reviews student service operations.', false),
  ('student_transportation', 'student_transport_operator', 'Student transportation operator', 'Operates explicitly assigned eligible student routes.', false),
  ('student_transportation', 'student_transport_guardian', 'Student guardian', 'Manages only explicitly authorized children.', false),
  ('student_transportation', 'student_transport_school_admin', 'School transportation coordinator', 'Coordinates explicitly authorized school records.', false);

insert into public.tenant_product_workspaces (tenant_id, workspace_key, status)
select tenant_id, 'student_transportation', 'disabled' from public.tenants;

-- Service-only foundation metadata, not student information. A later reviewed migration is
-- required to relax the false constraint and implement actual activation/operational policies.
create table public.student_transportation_launch_controls (
  tenant_id uuid primary key references public.tenants (tenant_id) on delete restrict,
  operations_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  constraint student_transportation_not_launched check (operations_enabled = false)
);
alter table public.student_transportation_launch_controls enable row level security;
revoke all on public.student_transportation_launch_controls from public, anon, authenticated;
grant select, insert, update, delete on public.student_transportation_launch_controls to service_role;
-- No authenticated policies: tenant membership/ownership alone never exposes product records.

create function public.guard_student_transportation_activation()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.workspace_key = 'student_transportation' then
    if (tg_table_name = 'tenant_product_workspaces' and new.status = 'enabled')
      or (tg_table_name = 'tenant_product_entitlements' and new.status = 'granted') then
      raise exception 'Student Transportation is not available for activation in this foundation release';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_student_transportation_activation() from public, anon, authenticated;
create trigger student_transportation_workspace_activation_guard
before insert or update on public.tenant_product_workspaces
for each row execute function public.guard_student_transportation_activation();
create trigger student_transportation_entitlement_activation_guard
before insert or update on public.tenant_product_entitlements
for each row execute function public.guard_student_transportation_activation();

create function public.has_student_transportation_operational_access(
  target_tenant_id uuid, required_roles text[]
)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    required_roles <@ array['student_transport_admin', 'student_transport_operator']::text[]
    and cardinality(required_roles) > 0
    and exists (select 1 from public.student_transportation_launch_controls
      where tenant_id = target_tenant_id and operations_enabled)
    and public.has_active_product_entitlement(target_tenant_id, 'student_transportation')
    and public.has_workspace_role(target_tenant_id, 'student_transportation', required_roles)
    and public.has_active_product_session(target_tenant_id, 'student_transportation'), false);
$$;
revoke all on function public.has_student_transportation_operational_access(uuid, text[]) from public, anon;
grant execute on function public.has_student_transportation_operational_access(uuid, text[]) to authenticated, service_role;
comment on function public.has_student_transportation_operational_access(uuid, text[]) is
  'Fail-closed future operational gate. Does not authorize guardian access or student records. Foundation always denies.';
