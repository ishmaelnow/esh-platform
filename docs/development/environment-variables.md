# Environment variables

Do not commit populated `.env` files. For local development, put application runtime values in the relevant `apps/<app>/.env.local`; `apps/admin/.env.example` is the canonical Admin template. The root `.env.example` is the complete inventory and is useful for tooling and tests, but Next.js does not automatically load a root monorepo `.env` for an app whose working directory is `apps/<app>`.

For Vercel, define values in each Vercel project's **Settings → Environment Variables** and select Production, Preview, and Development as appropriate. Secrets must never use a `NEXT_PUBLIC_` prefix.

## Application runtime

| Variable                        | Required by         | Local file              | Vercel project(s)    | Purpose                                                                      |
| ------------------------------- | ------------------- | ----------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | All apps            | each app's `.env.local` | Admin, Rider, Driver | Supabase project URL exposed to the browser.                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All apps            | each app's `.env.local` | Admin, Rider, Driver | Publishable/anonymous Supabase key; authorization remains enforced by RLS.   |
| `SUPABASE_SERVICE_ROLE_KEY`     | Admin server routes | `apps/admin/.env.local` | Admin only           | Privileged server-side Supabase access. Never expose to client code.         |
| `RESEND_API_KEY`                | Admin server routes | `apps/admin/.env.local` | Admin only           | Sends invitation and password-reset email.                                   |
| `RESEND_WEBHOOK_SECRET`         | Admin webhook route | `apps/admin/.env.local` | Admin only           | Verifies Resend webhook signatures.                                          |
| `INVITATION_FROM_EMAIL`         | Admin server routes | `apps/admin/.env.local` | Admin only           | Verified Resend sender, for example `ESH Platform <onboarding@example.com>`. |
| `INVITATION_BASE_URL`           | Admin server routes | `apps/admin/.env.local` | Admin only           | Public Admin origin used in invitation links; no trailing path.              |
| `TENANT_ADMIN_BASE_URL`         | Admin server routes | `apps/admin/.env.local` | Admin only           | Public tenant/Rider origin used after invitation acceptance.                 |
| `NEXT_PUBLIC_DRIVER_APP_URL`    | Admin notifications | `apps/admin/.env.local` | Admin only           | Driver portal origin used in driver notification links.                      |

`NODE_ENV` is set by Next.js/Vercel and normally should not be entered manually. `NEXT_PUBLIC_APP_ENV` (`local`, `staging`, or `production`) and `LOG_LEVEL` (`debug`, `info`, `warn`, or `error`) have defaults but may be set per app when shared configuration consumes them.

The shared Stripe package requires `STRIPE_SECRET_KEY` when a runtime creates a Stripe client and `STRIPE_WEBHOOK_SECRET` when it verifies a Stripe webhook. No current application imports that package, so these are conditional rather than deployment requirements today. Add them only to the Vercel project that begins using Stripe.

## Tests and tooling

These variables are not production deployment settings:

- `PLAYWRIGHT_BASE_URL` optionally points Playwright at a running Admin deployment; it defaults to `http://127.0.0.1:3000`.
- `RUN_SUPABASE_RLS_TESTS=true` enables local database RLS integration tests. `SUPABASE_TEST_DB_HOST`, `SUPABASE_TEST_DB_PORT`, `SUPABASE_TEST_DB_USER`, `SUPABASE_TEST_DB_PASSWORD`, and `SUPABASE_TEST_DB_NAME` override the local Supabase database defaults.
- `RUN_SUPABASE_ADMIN_TESTS=true` enables Admin integration tests and requires `ADMIN_INTEGRATION_SUPABASE_URL` plus `ADMIN_INTEGRATION_SUPABASE_SERVICE_ROLE_KEY` in the shell running the tests.
- `CI` is supplied automatically by CI providers and changes Playwright retry, worker, and reporter behavior.

## Local setup

Copy `apps/admin/.env.example` to `apps/admin/.env.local`. Create equivalent `.env.local` files in `apps/rider` and `apps/driver` containing the two public Supabase variables. Values printed by `pnpm supabase:status` can be used with the local Supabase stack.

Keep production and preview values separate in Vercel. In particular, preview `INVITATION_BASE_URL` and `TENANT_ADMIN_BASE_URL` must point to stable, authorized origins if invitation flows are tested there; do not put secrets in `vercel.json`.
