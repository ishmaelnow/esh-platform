# Product Workspace Foundation

ESH identity and tenant membership are shared platform relationships. Product access is separate.
A person may belong to Yahooemail while operating Transportation, Community, both, or neither.

Authorization follows this conjunction:

`active identity + active tenant membership + platform product entitlement + enabled workspace + active workspace enrollment + explicit workspace role + enabled capability`

No factor substitutes for another. In particular:

- Tenant ownership cannot grant a Platform product entitlement.

- Rider or Driver status never enrolls a person in Community.
- General tenant membership never enrolls a person in a product workspace.
- `tenant_owner` is a governance role that may grant/revoke workspace access; it does not itself
  confer Community operational permissions.
- `tenant_admin` no longer implies Community administration.
- Emergency publishing remains a separately assigned Community role.

The `tenant_product_workspaces` table enables or suspends a product for a tenant.
`tenant_workspace_enrollments` records a person's explicit entry into that product, and
`tenant_workspace_role_assignments` records operational authority within it. All assignments are
tenant-bound, expirable, non-destructively revoked, and audited through controlled RPCs.

The preceding Platform authority layer is defined in
`docs/architecture/platform-product-entitlements.md`. Tenant governance receives only entitled
products in its read model and cannot enable an unentitled product.

Migration `20260823000300_product_workspace_foundation.sql` performs a one-time Transportation
compatibility backfill for existing active tenant owners/admins. It deliberately creates zero
Community enrollments. Future tenant roles do not trigger product enrollment.

The legacy `tenant_community_role_assignments` table is retained for deployment compatibility, but
`has_community_permission` no longer reads it. Community permission evaluation uses the generic
workspace enrollment and role records exclusively.

Application navigation will use `my_workspace_access()` to show only authorized product workspaces.
The physical Transportation and Community admin surfaces can then evolve independently without
turning one tenant dashboard into a mixed operational menu.

The Admin implementation uses `/` as the tenant-aware workspace launcher, `/transportation` for the
existing Transportation application, and `/community` for the isolated Community administration
foundation. Direct routes recheck workspace role authorization. Tenant owners receive a governance
panel that calls reason-required audited RPCs; the UI never inserts enrollment or role rows.

`workspace_admin_snapshot()` is a narrow read model. Tenant owners/platform administrators receive
active membership and enrollment details needed to govern access. Other callers receive only their
own active workspace access and never the tenant member directory.

## Control Plane And Product Applications

The visible workspace launcher is transitional. The accepted target architecture is recorded in
`docs/adr/0002-separate-product-applications-shared-platform.md`:

- `admin.eshapp.com` becomes governance-only;
- Transportation Admin and Community Admin become independently deployed applications;
- shared identity establishes eligibility, not simultaneous operation; and
- one person may operate at most one product session at a time.

Product-session exclusivity is an additional authorization factor to be implemented before
Community activation. A stale product tab must be denied by the server/database even when its UI
has not refreshed. Product applications must use distinct storage/draft namespaces, visual identity,
notification copy, environment configuration, release gates, and observability.

That factor is implemented locally in Migration 5 and specified in
`docs/architecture/exclusive-product-sessions.md`. It remains disabled in production until the
owner applies the migration and deploys the paired Admin integration.
