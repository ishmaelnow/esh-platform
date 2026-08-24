# Platform Product Entitlements — Production Manual Test

## Deployment gate

Run the Supabase dry run and confirm it lists only:

```text
20260824000100_platform_product_entitlements.sql
```

Apply the migration before deploying the paired Platform and Tenant Governance UI.

## Backward-compatibility SQL

Confirm every currently enabled workspace has exactly one granted entitlement and no disabled
Community workspace was granted:

```sql
select workspace.workspace_key, workspace.status, entitlement.status as entitlement_status,
  count(*)
from public.tenant_product_workspaces workspace
left join public.tenant_product_entitlements entitlement
  using (tenant_id, workspace_key)
group by workspace.workspace_key, workspace.status, entitlement.status
order by workspace.workspace_key, workspace.status, entitlement.status;

select count(*) as disabled_community_with_entitlement
from public.tenant_product_workspaces workspace
join public.tenant_product_entitlements entitlement using (tenant_id, workspace_key)
where workspace.workspace_key = 'community'
  and workspace.status = 'disabled';
```

Expected before the pilot: existing enabled Transportation rows are `granted`; the second query is
zero. Existing Transportation Admin, Rider, and Driver applications must remain operational.

## Platform authority and clean tenant creation

1. Sign into `/platform` as Platform Owner/Admin.
2. Confirm existing tenants display a grandfathered Transportation entitlement and no Community
   entitlement unless one was already enabled before migration.
3. Create a clearly named temporary Community pilot tenant. Tenant creation must not grant either
   product automatically.
4. Grant only Community with a specific reason.
5. Confirm the tenant shows Community `granted`, Transportation `not granted`, and all six
   Community capabilities enabled as the Platform-managed product bundle.
6. Sign in as the invited tenant owner and open Tenant Governance.
7. Confirm only Community is shown; Transportation must be absent.
8. Enable the Community workspace and enroll the intended Community administrator/member
   separately. No Transportation interface should be required.

## Enforcement

1. Confirm an unentitled workspace cannot be enabled through the RPC.
2. Enter the entitled product, then suspend its entitlement as Platform Admin.
3. Confirm the workspace is suspended, its active product session is ended, and product operations
   are denied.
4. Restore the entitlement. Confirm the tenant must deliberately enable the workspace again before
   operations resume.
5. Review `tenant_audit_events` for `product_entitlement.status_changed` and the supplied reasons.

Do not revoke an existing production Transportation entitlement during testing. Use only the
clearly identified pilot tenant for suspension/restoration tests.
