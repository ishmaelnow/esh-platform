# Exclusive Operational Product Sessions

## Contract

One ESH person may have roles in several products but may operate only one product at a time.
`product_operational_sessions` is the server-authoritative lease. Its active-row uniqueness is per
person, so a second browser or device cannot bypass exclusivity.

Entry requires an active tenant, enabled product workspace, active workspace enrollment, and an
appropriate workspace role. The database derives person and Supabase Auth session IDs; clients
cannot nominate either identity. Entry serializes on the person, supersedes the previous lease,
creates the next lease, and audits both changes in one transaction.

Leases expire after 30 minutes without a heartbeat. Product applications refresh once per minute.
Entering governance ends the operational lease. A stale tab fails `has_active_product_session`,
cannot renew, loses its loaded operational state, and must return to governance.

Transportation's legacy operational authorization derives from `has_tenant_role`. Migration
`20260823000500_exclusive_product_sessions.sql` separates the underlying tenant-governance role
check into `has_foundation_tenant_role`, then requires an active Transportation lease from
`has_tenant_role`. Neutral workspace governance uses the foundation helper directly. This preserves
tenant-owner governance while denying Transportation RPCs from Community or stale contexts.

Production applies migrations before deploying Git. To avoid locking out the preceding Admin
bundle during that window, the tenant-role gate retains compatibility only while the product-session
table has never received a row. The first explicit product entry—available only in the paired new
UI—permanently activates enforcement. No administrative toggle can later weaken it.

Community permission checks already depend on explicit Community workspace roles. Community UI
also requires the active Community lease. Every future product must integrate its operational
authorization helper with `has_active_product_session`; a route check alone is insufficient.

## Transitional UI

The current Admin selector explicitly enters a product before navigating. Loading the selector
enters governance and ends any operational lease. Transportation and Community routes never create
a lease automatically, preventing old bookmarks or stale tabs from stealing product context.

The product-entry route exposes only enabled products for which the current person has an
operational role. It contains no product enablement, enrollment, or governance controls. Those
controls live on the separate `/governance` control-plane route, which is restricted to tenant
owners and platform administrators. Direct or stale product links return to product entry with an
explanation; the user must still select **Open** to create a new lease. This makes denial
recoverable without weakening explicit entry or silently changing product context.

The final independent product applications will retain these RPC contracts and heartbeat behavior.
They may use different domains and deployments, but exclusivity remains person-wide and
server-authoritative.
