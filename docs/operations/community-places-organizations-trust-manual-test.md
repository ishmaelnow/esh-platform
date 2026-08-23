# Community Places, Organizations, And Trust Manual Test

## Purpose

Verify Migration 2 installed the dark Community domain foundation without enabling Community,
creating tenant data, exposing verification evidence, or changing existing applications.

## Migration

Run `pnpm exec supabase db push --dry-run` and confirm only
`20260823000200_community_places_organizations_trust.sql` is listed. After owner approval, run the
real database push once.

## Read-Only SQL Checks

### Tables and RLS

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'community_areas','community_groups','community_group_memberships',
  'community_organizations','community_organization_memberships','community_provider_profiles',
  'community_organization_verifications','community_provider_verifications'
)
order by c.relname;
```

Expected: eight rows and every `rls_enabled` value is true.

### Empty dark rollout

```sql
select
  (select count(*) from public.community_areas) as areas,
  (select count(*) from public.community_groups) as groups,
  (select count(*) from public.community_group_memberships) as group_memberships,
  (select count(*) from public.community_organizations) as organizations,
  (select count(*) from public.community_organization_memberships) as organization_memberships,
  (select count(*) from public.community_provider_profiles) as providers,
  (select count(*) from public.community_organization_verifications) as organization_verifications,
  (select count(*) from public.community_provider_verifications) as provider_verifications;
```

Expected: all eight values are zero before pilot enablement.

### New permissions

```sql
select permission_key, required_capability_key, privileged
from public.community_permission_catalog
where permission_key in (
  'community.organizations.create',
  'community.organizations.manage_own',
  'community.verifications.submit'
)
order by permission_key;
```

Expected: three rows, all non-privileged. Verification review remains the existing privileged
`community.verifications.manage` permission.

### Community remains disabled

```sql
select count(*) as enabled_community_capabilities
from public.tenant_capabilities
where capability_key in (
  'app.community','community.content','community.groups','community.services',
  'community.moderation','community.broadcasts'
) and enabled;
```

Expected: zero.

### No side effects

```sql
select
  (select count(*) from public.tenant_community_role_assignments where status = 'active') as active_roles,
  (select count(*) from public.notification_outbox where notification_type like 'community_%') as notifications;
```

Expected: both zero.

## UI Regression Check

Admin, Rider, and Driver must load normally. No Community navigation, groups, organization,
provider, or verification UI should appear yet. Community-related console errors fail the check;
unrelated known favicon/session-lock observations are recorded separately.

## Pass Criteria

All eight tables exist with RLS, all are empty, three new member permissions exist, Community
remains disabled, no role/notification side effects occurred, and existing applications are
unaffected. Do not create production organizations or providers until a deliberate pilot and UI are
available.

## Production Result — 2026-08-23

**PASS.** Migration 2 commit `7aedf3d` passed the complete production dark-rollout validation:

- all eight domain tables existed and had RLS enabled;
- all eight tables contained zero records;
- all three new member permissions existed, required `community.content`, and were non-privileged;
- enabled Community capabilities: `0`;
- active Community role assignments: `0`;
- Community notifications: `0`; and
- Admin, Rider, and Driver remained operational with no Community UI or Community-related errors.

Admin separately reported the Supabase auth `Navigator LockManager` contention message. The Admin
application remained usable, and the error referenced neither Community schema nor Migration 2.
It is recorded as a non-Community stabilization follow-up and did not change this PASS.
