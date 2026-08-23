# Admin Workspace Selector And Access Governance — Manual Test

## Deployment order

Owner runs `pnpm exec supabase db push --dry-run` and confirms only
`20260823000400_workspace_admin_read_model.sql`, then applies it before deploying the Admin app.

## Safe production test

1. Open `https://admin.eshapp.com` and sign in as the Yahooemail tenant owner.
2. Confirm the landing page says **Choose a workspace** and shows separate Transportation and
   Community cards.
3. Confirm Transportation is enabled, shows the current Transportation administrator role, and
   **Open Transportation** loads the existing Administration UI at `/transportation`.
4. Confirm **All workspaces** returns to the selector without signing out or changing tenant.
5. Confirm Community is disabled and cannot be opened. Do not enable it during this dark test.
6. Confirm the governance section shows existing active Transportation enrollments and available
   tenant members. Do not remove production access.
7. Open `/community` directly. Expect **Community workspace access required**.
8. Open an incognito browser or a user without Transportation enrollment and confirm direct
   `/transportation` access is denied. Do not change the production owner's enrollment.
9. Confirm Rider and Driver portals remain unchanged.

## Read-only SQL

```sql
select event_name, reason, resource_type, resource_id, occurred_at
from public.tenant_audit_events
where event_name like 'workspace.%'
order by occurred_at desc
limit 20;
```

The existing migration backfill event may appear. The UI dark test must create no new workspace
mutation events.

Pass when routing is separated, direct access is role-gated, Community stays disabled, existing
Transportation remains operational, and no unintended enrollment/audit mutation occurs.
