# Environment variables

Do not commit populated `.env` files. For local development, put application runtime values in the relevant `apps/<app>/.env.local`; `apps/admin/.env.example` is the canonical Admin template. The root `.env.example` is the complete inventory and is useful for tooling and tests, but Next.js does not automatically load a root monorepo `.env` for an app whose working directory is `apps/<app>`.

For Vercel, define values in each Vercel project's **Settings → Environment Variables** and select Production, Preview, and Development as appropriate. Secrets must never use a `NEXT_PUBLIC_` prefix.

## Application runtime

| Variable                        | Required by         | Local file              | Vercel project(s)    | Purpose                                                                      |
| ------------------------------- | ------------------- | ----------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | All apps            | each app's `.env.local` | Admin, Rider, Driver | Supabase project URL exposed to the browser.                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All apps            | each app's `.env.local` | Admin, Rider, Driver | Publishable/anonymous Supabase key; authorization remains enforced by RLS.   |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | Live trip maps     | each app's `.env.local` | Admin, Rider, Driver | Public, URL-restricted Mapbox token for permanent geocoding, road routes, maps, and ETA. |
| `SUPABASE_SERVICE_ROLE_KEY`     | Privileged server routes | app-specific `.env.local` | Admin, Rider | Privileged server-side Supabase access. Never expose to client code.         |
| `STRIPE_SECRET_KEY`            | Rider payment and Admin refund routes | app-specific `.env.local` | Rider, Admin | Creates Stripe Checkout Sessions and authorized pre-trip refunds. Server-only. |
| `STRIPE_WEBHOOK_SECRET`        | Rider Stripe webhook | `apps/rider/.env.local` | Rider only | Verifies Stripe webhook signatures. Server-only. |
| `STRIPE_SECRET_KEY`            | Driver payout routes | `apps/driver/.env.local` | Driver only | Creates Stripe Express accounts and hosted links. Server-only. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Driver Connect webhook | `apps/driver/.env.local` | Driver only | Verifies connected-account events. Distinct from the Rider webhook secret. |
| `RESEND_API_KEY`                | Admin server routes | `apps/admin/.env.local` | Admin only           | Sends invitation and password-reset email.                                   |
| `RESEND_WEBHOOK_SECRET`         | Admin webhook route | `apps/admin/.env.local` | Admin only           | Verifies Resend webhook signatures.                                          |
| `INVITATION_FROM_EMAIL`         | Admin server routes | `apps/admin/.env.local` | Admin only           | Verified Resend sender, for example `ESH Platform <onboarding@example.com>`. |
| `INVITATION_BASE_URL`           | Admin server routes | `apps/admin/.env.local` | Admin only           | Public Admin origin used in invitation links; no trailing path.              |
| `TENANT_ADMIN_BASE_URL`         | Admin server routes | `apps/admin/.env.local` | Admin only           | Public tenant/Rider origin used after invitation acceptance.                 |
| `NEXT_PUBLIC_DRIVER_APP_URL`    | Admin notifications | `apps/admin/.env.local` | Admin only           | Driver portal origin used in driver notification links.                      |
| `NEXT_PUBLIC_RIDER_APP_URL`     | Admin notifications | `apps/admin/.env.local` | Admin only           | Rider portal origin used in Rider trip notification links.                   |
| `CRON_SECRET`                   | Scheduled jobs | app-specific `.env.local` | Admin, Rider | Authenticates Vercel's daily notification and recurring-autopay requests. Use a server-only high-entropy value. |
| `NOTIFICATION_DELIVERY_URL`     | Transactional notification request | app-specific `.env.local` | Rider, Driver | Exact Admin internal delivery endpoint; server-only despite being a URL. |
| `NOTIFICATION_DELIVERY_SECRET`  | Transactional notification request | app-specific `.env.local` | Admin, Rider, Driver | Shared high-entropy server credential authorizing event-driven outbox delivery. Never expose publicly. |
| `VAPID_SUBJECT` | Web Push identity | `apps/admin/.env.local` | Admin only | Contact URI such as `mailto:support@eshapp.com` used to identify the push sender. |
| `VAPID_PUBLIC_KEY` | Web Push sender | `apps/admin/.env.local` | Admin only | Public half of the Web Push VAPID pair used by the sender. |
| `VAPID_PRIVATE_KEY` | Web Push sender | `apps/admin/.env.local` | Admin only | Private VAPID signing key. Never expose to browsers or other apps. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Browser push subscription | app-specific `.env.local` | Rider, Driver | Public VAPID key used only to create browser subscriptions. |

`NODE_ENV` is set by Next.js/Vercel and normally should not be entered manually. `NEXT_PUBLIC_APP_ENV` (`local`, `staging`, or `production`) and `LOG_LEVEL` (`debug`, `info`, `warn`, or `error`) have defaults but may be set per app when shared configuration consumes them.

The Rider deployment requires `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
`SUPABASE_SERVICE_ROLE_KEY` for payment collection. Configure the Stripe webhook endpoint as
`https://rider.eshapp.com/api/webhooks/stripe`. Never place these values in public variables.
The Driver deployment requires `STRIPE_SECRET_KEY`, `STRIPE_CONNECT_WEBHOOK_SECRET`, and
`SUPABASE_SERVICE_ROLE_KEY`. Its Connect destination is
`https://driver.eshapp.com/api/webhooks/stripe-connect` and uses its own signing secret.

## Tests and tooling

These variables are not production deployment settings:

- `PLAYWRIGHT_BASE_URL` optionally points Playwright at a running Admin deployment; it defaults to `http://127.0.0.1:3000`.
- Driver availability E2E uses `PLAYWRIGHT_BASE_URL` for the Driver deployment plus
  `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, `E2E_DRIVER_EMAIL`, and
  `E2E_DRIVER_PASSWORD`. Use an isolated, fully compliant test driver; the test always returns the
  driver to offline.
- The manually dispatched `Driver Availability E2E` GitHub Actions workflow reads
  `DRIVER_APP_URL` from the production environment variables and the four `E2E_*` values from
  production environment secrets. Protect that GitHub environment with required reviewers so the
  workflow cannot change production driver state without approval.
- `RUN_SUPABASE_RLS_TESTS=true` enables local database RLS integration tests. `SUPABASE_TEST_DB_HOST`, `SUPABASE_TEST_DB_PORT`, `SUPABASE_TEST_DB_USER`, `SUPABASE_TEST_DB_PASSWORD`, and `SUPABASE_TEST_DB_NAME` override the local Supabase database defaults.
- `RUN_SUPABASE_ADMIN_TESTS=true` enables Admin integration tests and requires `ADMIN_INTEGRATION_SUPABASE_URL` plus `ADMIN_INTEGRATION_SUPABASE_SERVICE_ROLE_KEY` in the shell running the tests.
- `CI` is supplied automatically by CI providers and changes Playwright retry, worker, and reporter behavior.

## Local setup

Copy `apps/admin/.env.example` to `apps/admin/.env.local`. Create equivalent `.env.local` files in `apps/rider` and `apps/driver` containing the two public Supabase variables. Values printed by `pnpm supabase:status` can be used with the local Supabase stack.

Keep production and preview values separate in Vercel. In particular, preview `INVITATION_BASE_URL` and `TENANT_ADMIN_BASE_URL` must point to stable, authorized origins if invitation flows are tested there; do not put secrets in `vercel.json`.
