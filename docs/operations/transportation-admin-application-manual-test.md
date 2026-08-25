# Transportation Admin Application — Production Manual Test

## Production Result — 2026-08-25

**PASS.** The independent application is deployed at `https://transportation.eshapp.com`.
Transportation-specific admission, authorized Yahooemail entry, unrelated-account denial,
same-origin backend rewrites, operational reads and a reversible settings write, prohibited-route
isolation, exclusive-session invalidation, and Mapbox rendering passed. Browser Network requests
returned `200`; no Mapbox `401` or `403` remained after adding the custom origin to the public-token
restrictions. The legacy Admin Transportation route remains available temporarily as rollback
protection.

## Deployment Gate

1. Confirm `git status --short --branch` is clean after the owner commit/push.
2. Create or select the Vercel project whose Root Directory is `apps/transportation`.
3. Add only the six variables from `apps/transportation/.env.example`. Set
   `NEXT_PUBLIC_ADMIN_SURFACE` exactly to `transportation`, set
   `NEXT_PUBLIC_TRANSPORTATION_ADMIN_URL` to `https://transportation.eshapp.com`, and set
   `TRANSPORTATION_BACKEND_URL` to the existing Admin Vercel project's stable production origin.
   Do not copy service-role, Stripe, Resend, notification, VAPID-private, or Twilio secrets.
4. Add the same `NEXT_PUBLIC_TRANSPORTATION_ADMIN_URL` to the existing Admin Vercel project.
5. Add `https://transportation.eshapp.com` to the Mapbox public-token URL restrictions.
6. Deploy both projects and attach `transportation.eshapp.com` to Transportation Admin. There is no
   Supabase migration for this feature.

## Product-Specific Authentication

1. Sign out of all ESH products and open `https://transportation.eshapp.com`.
2. Confirm the page says **ESH Transportation** and **Transportation Administration**. It must not
   show Platform, tenant-governance, Community, Rider, or Driver navigation.
3. Sign in using an account that is only a Community member/admin. Expect:
   `This account does not have access to ESH Transportation Administration.`
4. Refresh. Confirm the denied account was not retained as signed in.
5. Sign in using the Yahooemail Transportation administrator.
6. Confirm only enabled Transportation tenants with an explicit `transportation_admin` role appear.
7. Choose Yahooemail and click **Open Transportation**. Confirm the browser moves to
   `/transportation` and the familiar Transportation tabs load in alphabetical order.

## Operational Regression

Using clearly identified production test data, verify read access to Dashboard, Dispatch, Drivers,
Service Areas, Vehicles, and Notifications. Perform one safe reversible update, refresh, and verify
it persisted. Restore the original value. Do not leave a Driver online or a booking unfinished.

In browser Network tools, inspect one `/api/tenant-admin/*` operation. The browser-facing request
must remain same-origin on `transportation.eshapp.com`, return successfully through the rewrite, and
contain the ESH bearer credential. No privileged backend secret may appear in the browser.

Confirm these paths redirect to the Transportation entry page and expose no corresponding UI:

- `/platform`
- `/governance`
- `/community`
- `/invite/example`
- `/api/cron/driver-notifications`

## Product Exclusivity

1. Leave Transportation operations open in Tab A.
2. In Tab B, enter Community or open `https://admin.eshapp.com/governance` using the same person.
3. Return to Tab A and wait up to 60 seconds.
4. Confirm operational data clears and the browser returns to Transportation entry.
5. Confirm reopening `/transportation` does not silently create a new lease.
6. Explicitly open Transportation again and confirm access returns.

## Control-Plane Regression

1. Open `https://admin.eshapp.com` in a fresh browser context.
2. Confirm it remains ESH Platform/Tenant governance and does not display Transportation operations.
3. Click the Transportation product launcher. Confirm it opens
   `https://transportation.eshapp.com`, not `/transportation` on the Admin domain.
4. Confirm Platform and tenant governance remain available only on `admin.eshapp.com`.

## Pass Criteria

- Transportation has a dedicated domain, deployment, sign-in, storage namespace, and route set.
- Shared credentials alone do not grant Transportation admission.
- Explicit enrollment and `transportation_admin` role are required.
- Opening Transportation creates its exclusive product lease on its own origin.
- A superseding product/governance context invalidates the stale Transportation tab.
- Existing Transportation operations and Admin governance remain functional and visually separate.
- The parallel interface uses the existing backend and contains no duplicated privileged handlers or secrets.
