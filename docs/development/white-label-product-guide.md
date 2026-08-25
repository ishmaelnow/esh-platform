# White-Label Product Applications — A Guide for My Future Self

## The Simple Idea

Build the product engine once, then place small branded application shells around it.

```text
Shared product engine
        ├── ESH-branded application
        ├── Partner A application
        └── Partner B application
```

A white-label application changes presentation and approved configuration. It does not create a
second database, weaken authorization, copy secrets, or fork the business rules.

The independent Transportation Admin deployment proved this pattern. `apps/transportation` supplies
its own application boundary, sign-in, domain, metadata, and routing while compiling the proven
Transportation interface from `apps/admin`. Its privileged requests are forwarded to the existing
backend rather than reimplemented.

## Vocabulary

- **Product engine:** reusable screens, workflows, types, and business behavior.
- **Application shell:** the small deployable that provides brand, routes, authentication namespace,
  environment configuration, and product admission.
- **Backend:** the trusted server APIs and database authorization. A new shell does not automatically
  need a new backend.
- **Tenant:** the customer data boundary. Branding never replaces tenant isolation.
- **Product admission:** the explicit entitlement, enrollment, and role checks required after sign-in.

## What Should Be Shared

Share behavior that must remain consistent:

- operational components and workflows;
- domain types and validation;
- API contracts;
- authorization helpers;
- maps, payments, notifications, and audit contracts; and
- automated tests for product behavior.

Keep these specific to each shell:

- application name, logo, icons, colors, and typography;
- domain and deployment project;
- browser auth-storage key;
- product entry and denial copy;
- support contacts and legal links;
- enabled feature flags; and
- public environment configuration.

## Junior Developer Walkthrough

The following example creates a white-label shell named `partner-transportation`.

### 1. Identify the proven interface

Do not begin by copying files. Find the existing top-level component and its dependencies. The ESH
Transportation example uses:

```text
apps/admin/src/components/tenant-admin/AdminTenantApp.tsx
```

Confirm the existing application and tests pass before extracting anything.

### 2. Create a thin application directory

Create:

```text
apps/partner-transportation/
  package.json
  next.config.ts
  tsconfig.json
  .env.example
  src/app/layout.tsx
  src/app/page.tsx
  src/app/transportation/page.tsx
  src/middleware.ts
```

The shell should contain routes and configuration, not a copied product engine.

### 3. Make the existing source importable

During an incremental extraction, map an import alias to the proven source in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["../admin/src/*"]
    }
  }
}
```

Then render the existing component:

```tsx
import { AdminTenantApp } from "@/components/tenant-admin/AdminTenantApp";

export default function TransportationPage() {
  return <AdminTenantApp />;
}
```

This is source-level reuse. It does not import the old deployment, session, environment values, or
secrets. Next.js compiles the referenced source into the new application.

### 4. Give the shell an independent identity

Set its metadata and import the approved shared styles in `layout.tsx`. Give the browser auth client
a unique storage key, for example:

```text
partner-transportation-auth
```

Never reuse another product's storage key. Separate storage prevents a login in one application
from silently becoming a login in another application.

### 5. Enforce product admission after authentication

A valid password proves identity only. After sign-in, check all required factors:

```text
active identity
+ active tenant membership
+ product entitlement
+ enabled product workspace
+ explicit workspace enrollment
+ required product role
+ active product session
```

If admission fails, sign out the shell locally and show a neutral denial. Do not reveal tenant names,
roles, or private product data.

### 6. Reuse the proven backend

If the shell is only a parallel interface, do not copy privileged route handlers or backend secrets.
Use a server-side rewrite in `next.config.ts`:

```ts
const backend = process.env.TRANSPORTATION_BACKEND_URL;

const nextConfig = {
  rewrites() {
    return Promise.resolve([
      {
        source: "/api/tenant-admin/:path*",
        destination: `${backend}/api/tenant-admin/:path*`,
      },
    ]);
  },
};
```

The browser calls its own origin. Vercel forwards the request and bearer authorization to the proven
backend. This avoids CORS complexity and keeps privileged secrets out of the shell.

Before using this pattern, verify that every forwarded operation authenticates the bearer token and
enforces tenant, role, capability, and active-product-session authorization. A rewrite is routing,
not security.

### 7. Add only required environment variables

For the Transportation interface proof, the shell requires:

```text
NEXT_PUBLIC_ADMIN_SURFACE
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
NEXT_PUBLIC_TRANSPORTATION_ADMIN_URL
TRANSPORTATION_BACKEND_URL
```

Do not copy service-role, Stripe, Resend, Twilio, private VAPID, or notification-delivery secrets
into an interface-only deployment.

Commit `.env.example` with names and safe placeholders only. Never commit populated values.

### 8. Restrict routes

The shell should expose only its product routes. Redirect attempts to reach Platform, governance,
Community, invitations, password recovery, internal delivery, cron, or unrelated APIs.

UI hiding is not sufficient. Backend authorization must still reject calls from the wrong product
session.

### 9. Deploy in parallel

Create a separate Vercel project from the same repository and select the new app as its Root
Directory. Use the generated `*.vercel.app` production URL first. Do not move the final custom domain
until validation passes.

Keep the proven interface available as rollback protection during the observation period.

### 10. Test before cutover

At minimum verify:

1. Product name, branding, and routes are correct.
2. An unrelated account is denied and not retained locally.
3. An explicitly enrolled product administrator is admitted.
4. Tenant data matches the proven interface.
5. Read and safe reversible write operations succeed through the backend rewrite.
6. No CORS, redirect-loop, 401, 403, 404, or 500 errors occur.
7. No privileged secret appears in browser code or Network tools.
8. Entering another product invalidates the stale product tab.
9. Maps and other origin-restricted providers accept the new deployment origin.
10. The old interface remains functional for rollback.

### 11. Promote gradually

After the parallel test passes:

1. Attach the intended custom domain.
2. Update launch links to the new domain.
3. Observe authentication, API errors, audit events, and critical workflows.
4. Preserve the old interface temporarily.
5. Retire the old interface only after the rollback window closes.

Do not move or rename the proven backend merely because the interface changes. Give it a stable
service origin before repointing any public domain previously used by that backend.

## From Extraction Bridge to Long-Term Package

Importing source directly from another app is useful for a low-risk transition, but applications
should not remain permanently coupled this way. Once the new deployment is proven, move reusable
product code into a neutral workspace package, for example:

```text
packages/products/transportation-admin/
```

Then application shells import the package:

```tsx
import { TransportationAdminApp } from "@esh-platform/transportation-admin";

export default function Page() {
  return <TransportationAdminApp brand={partnerBrand} />;
}
```

Keep authorization and business rules inside trusted shared contracts. Treat `brand` as presentation
configuration, never as proof of tenant or product access.

## Common Mistakes

- Copying the entire application and creating two diverging codebases.
- Giving an interface-only deployment every backend secret.
- Assuming shared login means shared product permission.
- Using a logo, hostname, or tenant slug as authorization.
- Deploying duplicate payment, notification, or cron handlers unintentionally.
- Moving DNS before testing the generated deployment URL.
- Pointing a backend rewrite at a public domain that will later be reassigned.
- Removing the proven interface before the rollback period ends.
- Calling a product “white label” when tenant isolation and audit are not enforced.

## The Rule to Remember

```text
Reuse the engine.
Isolate the shell.
Centralize the trusted backend.
Enforce access on the server.
Deploy in parallel.
Cut over only after proof.
```
