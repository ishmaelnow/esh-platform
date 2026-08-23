# Community Authorization Foundation Manual Test

## Purpose

Verify the first Community migration without enabling a feed, exposing content, or sending
notifications. This test confirms catalogs, disabled defaults, tenant settings, role separation,
RLS, and audit behavior.

## Preconditions

- Migration `20260823000100_community_authorization_foundation.sql` is committed and deployed.
- Two clearly identified test tenants and test memberships are available.
- Test accounts include a Tenant A owner/admin, member, moderator candidate, emergency-publisher
  candidate, suspended member, and Tenant B member.
- No real Community broadcast channel is configured or exercised.

## Migration Verification

```bash
pnpm exec supabase db push --dry-run
```

Expected: only `20260823000100_community_authorization_foundation.sql` is listed.

After review, the owner applies it:

```bash
pnpm exec supabase db push
```

Expected: the migration succeeds and no Community capability is enabled automatically.

## Test Cases

### 1. Catalog and defaults

Confirm the capability catalog retains the existing capabilities and adds `app.community`,
`community.content`, `community.groups`, `community.services`, `community.moderation`, and
`community.broadcasts`. Every existing tenant must have all six disabled plus one conservative
`tenant_community_settings` row.

### 2. Disabled module

As an active Tenant A member, call the Community authorization helpers before enablement.

Expected: read/create/moderate/broadcast helpers return false, Tenant B remains inaccessible, and
no member-facing Community record exists.

### 3. Baseline member

For the test tenant only, enable `app.community` and `community.content`.

Expected for an active member:

- read and ordinary-content creation return true while member posting is enabled;
- moderation and every broadcast severity return false; and
- settings are readable but cannot be updated.

### 4. Community Admin

Enable `community.moderation` and `community.broadcasts`, then enable Important and Urgent test
settings while keeping Emergency disabled.

Expected for a tenant owner/admin:

- moderation returns true;
- Important and Urgent require their setting; and
- Emergency remains false because Community Admin does not inherit emergency authority.

### 5. Moderator assignment

Use `assign_community_role` to assign `community_moderator` with a clear test reason.

Expected: moderation becomes true, broadcast authority remains false, the assignment is audited,
and the moderator cannot grant roles.

### 6. Emergency publisher

Enable the Emergency test setting and assign `emergency_publisher` with a clear reason.

Expected: Emergency becomes true for that actor, moderation remains false, the tenant owner/admin
still lacks Emergency unless separately assigned, and Tenant B remains denied.

### 7. Suspended and cross-tenant denial

Expected: suspended membership receives no permission, Tenant A cannot act in Tenant B, caller-
provided identity values create no authority, and direct client writes to assignments are denied.

### 8. Revocation and audit

Use `revoke_community_role` with a clear reason.

Expected: permission disappears immediately, the assignment remains as revoked history, a
`community.role_revoked` event is appended, and clients cannot rewrite history.

## Cleanup

- Revoke temporary role assignments.
- Restore every changed Community setting.
- Disable all six Community capabilities for the test tenant.
- Confirm no Community notification was queued or delivered.
- Preserve role and audit history; do not delete it for cleanup.

## Pass Criteria

Disabled defaults, membership lifecycle, tenant isolation, role separation, RLS, audit, and cleanup
must all pass. Do not begin Community content rollout if any negative authorization case fails.

## Production Result — 2026-08-23

**PASS — Community Authorization Foundation verified in production.** All 17 configured tenants
had exactly six disabled Community capability rows (102 total), all 17 settings rows matched the
conservative defaults, all 20 permission classifications were correct, emergency permissions
belonged only to `emergency_publisher`, automatic role assignments and Community notifications
were both zero, and Admin/Rider/Driver remained operational without Community UI or Community-
related console errors. Rider/Driver favicon 404s and an Admin Supabase Navigator LockManager error
were observed separately and did not affect this result. The test Driver must remain Offline after
testing unless actively providing service.
