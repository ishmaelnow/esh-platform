# Platform Product Entitlements

## Contract

A tenant is an organization/customer boundary. Transportation and Community are independent ESH
products a tenant may be permitted to operate. Product permission has three separate layers:

1. Platform entitlement — ESH Platform Administration grants the product to the tenant.
2. Tenant activation — the tenant enables or suspends its entitled workspace.
3. Person access — an active tenant member receives explicit product enrollment and role.

No layer substitutes for another. A tenant owner cannot grant a product entitlement, and a Platform
Admin grant does not activate the workspace or enroll anyone.

Granting Community provisions its six required product capabilities as one Platform-managed bundle
so a Community-only tenant never needs a Transportation interface for setup. Suspension or
revocation disables that bundle. Tenant activation and person enrollment remain separate actions.

`tenant_product_entitlements` is the Platform-owned current-state record. Its status is `granted`,
`suspended`, or `revoked`. Only `platform_owner` and `platform_admin` may change it through the
reason-required `set_tenant_product_entitlement` RPC. Direct authenticated writes are unavailable.
Every transition creates tenant audit evidence. Suspension or revocation immediately disables or
suspends the tenant workspace and ends active operational sessions for that tenant/product.

## Compatibility rollout

Migration `20260824000100_platform_product_entitlements.sql` grants a migration-sourced entitlement
only for a product workspace already enabled at deployment time. Existing Transportation tenants
therefore retain Transportation without role, workspace, session, or application interruption.
Disabled Community workspaces receive no Community entitlement, enrollment, or role.

New tenants receive neutral disabled workspace records from the existing catalog trigger but no
product entitlement. Platform Administration deliberately grants Transportation, Community, or a
future product after tenant provisioning. Tenant governance shows only granted or Platform-suspended
products, preventing irrelevant products from cluttering the tenant interface.

This supports Transportation-only, Community-only, and deliberately multi-product tenants while
preserving independent applications, roles, admission, and operational sessions.
