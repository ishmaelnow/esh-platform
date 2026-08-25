# Admin Control Plane Safe Cleanup

## Purpose

This is the future cleanup reminder for `https://admin.eshapp.com`. Do not remove, rename, or
repurpose that deployment merely because the independent product applications are working.

The desired end state is:

- `admin.eshapp.com` exposes only neutral ESH Platform and tenant governance;
- `transportation.eshapp.com` owns Transportation administration;
- `community-admin.eshapp.com` owns Community administration;
- `community.eshapp.com` remains the Community member application; and
- Rider and Driver remain independent Transportation applications.

Shared infrastructure does not mean shared operational UI. A person may be eligible for several
products, but each product retains its own admission, role, browser session, routes, and exclusive
operational lease.

## Important Current Dependency

`admin.eshapp.com` is not only a visible control plane today. It is also the trusted host for the
existing privileged Admin API routes. The independent Transportation application sends browser
requests to its own `/api/tenant-admin/*` paths, and Vercel rewrites those requests to the Admin
backend selected by `TRANSPORTATION_BACKEND_URL`.

Therefore:

- do not delete the Admin Vercel project;
- do not remove its `/api/*` handlers;
- do not rename or disconnect `admin.eshapp.com`; and
- do not change `TRANSPORTATION_BACKEND_URL`

until a stable replacement backend origin is deployed, configured, and production-tested.

## Safe Cleanup Sequence

Perform these phases in order. Stop after any failed gate and preserve the last working deployment.

### 1. Record The Known-Good Baseline

- Confirm Transportation Admin passes its production manual test at
  `https://transportation.eshapp.com`.
- Confirm Community Admin passes its production manual test at
  `https://community-admin.eshapp.com`.
- Confirm Community member, Rider, and Driver applications still admit only their intended users.
- Confirm `https://admin.eshapp.com/platform` and `/governance` remain operational.
- Record the current working Vercel deployments and environment configuration without copying
  secret values into documentation.

### 2. End The Rollback Observation Window

Do not retire the legacy routes immediately after one successful deployment. First verify normal
production use, sign-out, direct-link denial, stale-session invalidation, and at least one safe
reversible operation in each independent Admin application.

The rollback window ends only when both independent product applications are accepted as the
primary operational interfaces.

### 3. Retire Only The Legacy Product UI Routes

Remove or permanently redirect:

- `admin.eshapp.com/transportation` to `https://transportation.eshapp.com`; and
- `admin.eshapp.com/community` to `https://community-admin.eshapp.com`.

At this phase, preserve:

- `/platform`;
- `/governance`;
- invitation acceptance and account recovery routes;
- the neutral control-plane entry route; and
- every trusted `/api/*` route still used by a product application or scheduled operation.

Validate that the Admin domain contains no Transportation dispatch or Community moderation UI.

### 4. Give The Trusted Backend A Stable Internal Origin

Before changing the public Admin domain, create a stable production origin for the trusted Admin
backend. Prefer a dedicated Vercel production hostname or deliberately named internal backend
domain rather than a temporary preview deployment URL.

The backend origin must preserve:

- the existing authenticated `/api/tenant-admin/*` behavior;
- Supabase bearer-token and tenant/product authorization;
- exclusive product-session enforcement;
- service-role, payment, notification, storage, and scheduled-operation secrets;
- audit behavior; and
- CORS/rewrite behavior expected by the independent applications.

Do not copy privileged backend secrets into Transportation or Community browser applications.

### 5. Repoint And Prove Every Backend Consumer

- Change `TRANSPORTATION_BACKEND_URL` in the Transportation Vercel project to the stable backend
  origin.
- Identify any additional product rewrites, webhooks, cron jobs, or external integrations that
  still target `admin.eshapp.com` and repoint them deliberately.
- Redeploy the affected applications.
- In browser Network tools, verify `/api/tenant-admin/*` remains same-origin from the user's
  perspective and returns successful responses.
- Run read tests plus one safe reversible write, then restore the original value.
- Confirm no privileged secret appears in the browser.

Do not proceed if any consumer still depends on the public Admin hostname as its backend.

### 6. Revalidate The Control Plane

Confirm `admin.eshapp.com` now performs only neutral responsibilities:

- Platform tenant provisioning and product entitlements;
- tenant membership, invitations, and product-access governance;
- governance audit; and
- account recovery or invitation flows that are intentionally platform-wide.

Product operations must remain absent. Product access changes must continue to name one tenant and
one product explicitly.

### 7. Decide The Public Control-Plane Name

Only after the backend dependency is removed should the owner decide whether to keep
`admin.eshapp.com` or rename it to a clearer Platform/Governance domain. A rename is a product and
operations decision, not cosmetic cleanup.

If renamed:

- attach and verify the new DNS/domain first;
- update authentication redirect allowlists and public application URLs;
- update invitation, recovery, and launcher links;
- redeploy and test the new domain;
- keep the old Admin domain as a temporary redirect; and
- remove the old domain only after logs show no legitimate remaining traffic.

## Final Validation Checklist

- Platform administrators can provision tenants and product entitlements.
- Tenant owners can govern memberships and product access without seeing product operations.
- Transportation Admin can read and safely mutate Transportation data.
- Community Admin can perform authorized Community administration.
- Community members, Riders, and Drivers retain their independent admission boundaries.
- Entering one operational product invalidates a stale tab for another product.
- Legacy Admin product URLs redirect and expose no operational UI.
- No deployed application, webhook, scheduled job, or documented environment setting still uses
  the retired Admin hostname as an unrecorded backend dependency.
- Audit records and tenant isolation remain intact.

## Rollback Rule

At every phase, rollback means restoring the prior deployment or environment value—not weakening
authorization, RLS, product enrollment, or exclusive-session enforcement. Never solve a routing or
domain failure by exposing privileged handlers directly to a product frontend.
