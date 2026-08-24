# Independent Transportation Admin Application

## Boundary

Transportation operations are deployed from `apps/transportation` and served at
`https://transportation.eshapp.com`. `admin.eshapp.com` remains the neutral Platform and tenant
governance control plane. The Transportation application exposes no Platform, tenant-governance,
Community, invitation-acceptance, password-recovery, or scheduled-job routes.

The application reuses the established Transportation components, Supabase contracts, maps, and
styling from `apps/admin`; this is source reuse, not a shared browser session. Its auth client uses
the dedicated storage key `esh-transportation-admin-auth`. Admin, Community, Rider, and Driver
sessions therefore do not silently sign a browser into Transportation.

The parallel application does not deploy a second copy of the privileged Transportation backend.
Requests under `/api/tenant-admin/*` are same-origin browser requests that Vercel rewrites to the
existing proven Admin deployment identified by `TRANSPORTATION_BACKEND_URL`. Bearer authentication,
tenant authorization, product-session enforcement, server secrets, payments, notification
delivery, and storage operations remain in that existing backend. The new deployment receives no
service-role, Stripe, Resend, VAPID-private, Twilio, or notification-delivery secret.

## Admission And Sessions

Successful authentication is only identity verification. The entry application retains the local
session only when `my_workspace_access()` returns an enabled Transportation enrollment with the
`transportation_admin` role. Otherwise it signs out locally and shows a neutral denial without
exposing tenant names or operations.

An admitted administrator explicitly chooses a Transportation tenant. Entry persists that tenant
preference, calls `enter_my_product_session(..., 'transportation')`, and then opens the operations
route. The existing one-minute heartbeat and database authorization remain authoritative. Entering
another product or governance invalidates the Transportation lease; the stale app clears its data
and returns to its own entry screen.

The Admin control plane no longer creates a Transportation lease. Its Transportation launcher only
navigates to `NEXT_PUBLIC_TRANSPORTATION_ADMIN_URL`, ensuring the product authenticates and enters
within its own origin.

## Deployment

Create a separate Vercel project from the same repository with Root Directory
`apps/transportation`. Set `NEXT_PUBLIC_ADMIN_SURFACE=transportation`, set
`TRANSPORTATION_BACKEND_URL` to the existing Admin project's stable production origin, and configure
the public variables listed in `apps/transportation/.env.example`. Add
`transportation.eshapp.com` to that project and add its Mapbox origin restriction before production
testing.

No database migration accompanies this extraction. It relies on the already-deployed product
entitlement, workspace enrollment, role, and exclusive-session contracts.

The legacy `admin.eshapp.com/transportation` route remains temporarily as a rollback surface. It is
removed only after the independent deployment passes production admission, operations, stale-tab,
and control-plane regression tests.
