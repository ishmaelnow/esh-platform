-- Read model for the Admin workspace launcher and owner-controlled access governance.

create or replace function public.workspace_admin_snapshot(target_tenant_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when not public.can_manage_workspace_access(target_tenant_id) then
      jsonb_build_object(
        'can_manage', false,
        'workspaces', coalesce((
          select jsonb_agg(jsonb_build_object(
            'workspace_key', access.workspace_key,
            'display_name', access.workspace_name,
            'status', 'enabled',
            'roles', to_jsonb(access.role_keys)
          ) order by access.workspace_key)
          from public.my_workspace_access() access
          where access.tenant_id = target_tenant_id
        ), '[]'::jsonb),
        'memberships', '[]'::jsonb,
        'enrollments', '[]'::jsonb
      )
    else jsonb_build_object(
      'can_manage', true,
      'workspaces', coalesce((
        select jsonb_agg(jsonb_build_object(
          'workspace_key', workspace.workspace_key,
          'display_name', catalog.display_name,
          'description', catalog.description,
          'status', workspace.status,
          'roles', coalesce((
            select jsonb_agg(role.role_key order by role.role_key)
            from public.tenant_workspace_enrollments enrollment
            join public.tenant_memberships membership
              on membership.membership_id = enrollment.membership_id
             and membership.tenant_id = enrollment.tenant_id
            join public.tenant_workspace_role_assignments role
              on role.enrollment_id = enrollment.enrollment_id
             and role.status = 'active'
             and (role.expires_at is null or role.expires_at > now())
            where enrollment.tenant_id = workspace.tenant_id
              and enrollment.workspace_key = workspace.workspace_key
              and enrollment.status = 'active'
              and membership.person_id = public.current_person_id()
          ), '[]'::jsonb)
        ) order by catalog.sort_order)
        from public.tenant_product_workspaces workspace
        join public.product_workspace_catalog catalog using (workspace_key)
        where workspace.tenant_id = target_tenant_id
      ), '[]'::jsonb),
      'memberships', coalesce((
        select jsonb_agg(jsonb_build_object(
          'membership_id', membership.membership_id,
          'person_id', membership.person_id,
          'display_name', coalesce(profile.display_name, profile.normalized_email),
          'email', profile.normalized_email
        ) order by coalesce(profile.display_name, profile.normalized_email))
        from public.tenant_memberships membership
        join public.person_profiles profile on profile.person_id = membership.person_id
        where membership.tenant_id = target_tenant_id
          and membership.status = 'active'
          and (membership.expires_at is null or membership.expires_at > now())
      ), '[]'::jsonb),
      'enrollments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'enrollment_id', enrollment.enrollment_id,
          'membership_id', enrollment.membership_id,
          'workspace_key', enrollment.workspace_key,
          'status', enrollment.status,
          'display_name', coalesce(profile.display_name, profile.normalized_email),
          'email', profile.normalized_email,
          'roles', coalesce((
            select jsonb_agg(role.role_key order by role.role_key)
            from public.tenant_workspace_role_assignments role
            where role.enrollment_id = enrollment.enrollment_id
              and role.status = 'active'
              and (role.expires_at is null or role.expires_at > now())
          ), '[]'::jsonb)
        ) order by enrollment.workspace_key, coalesce(profile.display_name, profile.normalized_email))
        from public.tenant_workspace_enrollments enrollment
        join public.tenant_memberships membership
          on membership.membership_id = enrollment.membership_id
         and membership.tenant_id = enrollment.tenant_id
        join public.person_profiles profile on profile.person_id = membership.person_id
        where enrollment.tenant_id = target_tenant_id
          and enrollment.status = 'active'
          and (enrollment.expires_at is null or enrollment.expires_at > now())
      ), '[]'::jsonb)
    )
  end;
$$;

revoke all on function public.workspace_admin_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.workspace_admin_snapshot(uuid) to authenticated;

comment on function public.workspace_admin_snapshot(uuid) is
  'Returns only the caller workspace access unless the caller is a tenant owner/platform admin; governance details never grant access.';
