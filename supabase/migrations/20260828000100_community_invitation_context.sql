-- Carry product context through the existing invitation contract.
alter table public.tenant_invitations
  add column if not exists workspace_key text,
  add column if not exists workspace_role_key text;

alter table public.tenant_invitations
  add constraint tenant_invitations_workspace_context_check check (
    (workspace_key is null and workspace_role_key is null)
    or (workspace_key = 'community' and workspace_role_key = 'community_member')
  );

grant select on public.community_join_requests, public.community_public_feedback to authenticated;
create policy community_join_requests_moderator_select on public.community_join_requests for select to authenticated using (public.can_moderate_community(tenant_id));
create policy community_public_feedback_moderator_select on public.community_public_feedback for select to authenticated using (tenant_id is null or public.can_moderate_community(tenant_id));

create or replace function public.apply_community_invitation_enrollment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted'
     and new.workspace_key = 'community' and new.workspace_role_key = 'community_member'
     and new.accepted_by_person_id is not null then
    insert into public.tenant_workspace_enrollments
      (tenant_id, membership_id, workspace_key, status, source, enrolled_by_person_id, reason)
    select new.tenant_id, membership.membership_id, 'community', 'active', 'system', new.invited_by_person_id,
      'Approved Community join request.'
    from public.tenant_memberships membership
    where membership.tenant_id = new.tenant_id and membership.person_id = new.accepted_by_person_id
      and not exists (
      select 1 from public.tenant_workspace_enrollments enrollment
      join public.tenant_memberships membership on membership.membership_id = enrollment.membership_id
      where enrollment.tenant_id = new.tenant_id and membership.person_id = new.accepted_by_person_id
        and enrollment.workspace_key = 'community'
        and enrollment.status = 'active'
    );
    insert into public.tenant_workspace_role_assignments
      (tenant_id, enrollment_id, workspace_key, role_key, status, assigned_by_person_id, reason)
    select enrollment.tenant_id, enrollment.enrollment_id, 'community', 'community_member', 'active', new.invited_by_person_id,
      'Approved Community join request.'
    from public.tenant_workspace_enrollments enrollment
    join public.tenant_memberships membership on membership.membership_id = enrollment.membership_id
    where enrollment.tenant_id = new.tenant_id and membership.person_id = new.accepted_by_person_id
      and enrollment.workspace_key = 'community' and enrollment.status = 'active'
      and not exists (select 1 from public.tenant_workspace_role_assignments role where role.enrollment_id = enrollment.enrollment_id and role.status = 'active');
  end if;
  return new;
end;
$$;

drop trigger if exists tenant_invitations_apply_community_enrollment on public.tenant_invitations;
create trigger tenant_invitations_apply_community_enrollment
  after update on public.tenant_invitations
  for each row execute function public.apply_community_invitation_enrollment();
