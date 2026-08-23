# Product Workspace Foundation

ESH identity and tenant membership are shared platform relationships. Product access is separate.
A person may belong to Yahooemail while operating Transportation, Community, both, or neither.

Authorization follows this conjunction:

`active identity + active tenant membership + enabled workspace + active workspace enrollment + explicit workspace role + enabled capability`

No factor substitutes for another. In particular:

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

Migration `20260823000300_product_workspace_foundation.sql` performs a one-time Transportation
compatibility backfill for existing active tenant owners/admins. It deliberately creates zero
Community enrollments. Future tenant roles do not trigger product enrollment.

The legacy `tenant_community_role_assignments` table is retained for deployment compatibility, but
`has_community_permission` no longer reads it. Community permission evaluation uses the generic
workspace enrollment and role records exclusively.

Application navigation will use `my_workspace_access()` to show only authorized product workspaces.
The physical Transportation and Community admin surfaces can then evolve independently without
turning one tenant dashboard into a mixed operational menu.
