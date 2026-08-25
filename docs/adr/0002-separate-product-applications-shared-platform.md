# 0002: Separate Product Applications on Shared Platform Infrastructure

## Status

Accepted

## Context

ESH began with Transportation and later introduced Community as a second tenant-enabled product.
A combined tenant dashboard can technically expose both products, but it creates operational
ambiguity: an administrator can confuse tenant, product, draft, notification, or high-impact action
context. Adding further products would make that dashboard progressively harder to operate safely.

The platform already has the correct reusable primitives: neutral person identity, tenants,
memberships, product capabilities, explicit workspace enrollment and roles, audit, storage,
notifications, maps, payments, and tenant-aware RLS. Those shared primitives do not require a
shared operational interface.

## Decision

ESH products are operationally independent applications built on shared platform infrastructure.

- `admin.eshapp.com` is the neutral Platform/Tenant governance control plane. It provisions
  tenants, enables products, manages product enrollment, and exposes governance audit. It does not
  perform Transportation dispatch or Community publishing/moderation.
- Transportation operations live in a separately deployed Transportation Admin application.
- Community operations live in a separately deployed Community Admin application.
- Community members use a separate Community application; Rider and Driver remain separate
  Transportation applications.
- Future products must receive their own application boundary, product roles, lifecycle, routes,
  deployment, operational tests, and product session.

One shared ESH identity may be eligible for multiple products, but eligibility is not simultaneous
operation. A person may hold roles in several products while having at most one active operational
product session. Entering another product explicitly ends or invalidates the prior product context.
Stale tabs must fail server/database authorization and redirect rather than silently switching.

Product-session enforcement must be server-authoritative. It cannot rely on a browser-only active
workspace value. Every privileged operation verifies active identity, tenant relationship, enabled
product, explicit enrollment, product role/capability, and the active product-session lease.

The deployed `/`, `/transportation`, and `/community` routes inside the current Admin application
are a transitional validation surface. They proved enrollment and role separation but are not the
final combined operating experience. The independent Transportation Admin application exists at
`apps/transportation` and passed its parallel production proof. The independent Community Admin
shell now exists at `apps/community-admin`; its legacy Admin route remains only as a rollback
surface until the separate deployment passes production validation. After that observation window,
`admin.eshapp.com` is reduced to governance only.

## Consequences

Benefits:

- operational navigation and terminology stay product-specific;
- new products can be added without expanding an omnibus dashboard;
- authorization, deployment, drafts, notifications, and failures remain product-scoped;
- shared platform services are reused without creating domain dependencies; and
- administrators cannot accidentally operate Transportation and Community simultaneously.

Tradeoffs:

- additional deployable applications, domains, environment configuration, release workflows, and
  monitoring are required;
- shared UI/auth packages need stable contracts and version discipline;
- exclusive product-session leasing and stale-tab handling must be implemented and tested; and
- migration from the transitional Admin routes must preserve existing Transportation access.

## Rejected Alternatives

- **One dashboard containing every product:** rejected because operational complexity and
  cross-product error risk grow with every product.
- **A visual workspace switch with simultaneous tabs:** rejected because display separation alone
  does not prevent stale-context mutations.
- **Completely unrelated identity systems:** rejected because it duplicates authentication,
  tenant governance, security, audit, and account recovery while weakening the platform model.
