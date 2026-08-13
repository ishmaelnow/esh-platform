# Session Handoff

Last updated: 2026-08-12

## Current objective

Complete Driver Transfers V1 on the verified unified Connect sandbox payment and Driver account.

## Repository and deployment state

- Branch: `main`
- Admin session stabilization is deployed and passed production testing. DFW Metroplex and
  Philadelphia service areas were created successfully; Realtime Driver Location passed its live
  production test.
- Live Trip Maps commit `bba70b8`, regional geocoding commit `7b3dcd9`, pre-booking validation commit
  `a3f9ccb`, and migrations through `20260809000200_rider_geocoding_context.sql` are pushed and
  deployed. `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is required in all three Vercel projects.
- Atomic Rider booking/geocoding commit `7ed2442`, regional autocomplete commit `7973e26`, and
  migration `20260810000100_atomic_rider_geocoded_booking.sql` are deployed.
- Automatic Driver Matching commit `72c3f93` is deployed; production manual testing passed.
- Realtime Driver Location commit `7121a36` and migration
  `20260801001300_realtime_driver_location.sql` are deployed to production.
- Trigger hotfix commit `6da5ba0` and migration
  `20260802000100_fix_location_stop_triggers.sql` are deployed; Rider booking creation retest passed.
- Confirm migration state with a dry run rather than assuming it from this handoff.
- Reputation V1 commit `e87655e`, Rider layout fix `75505f7`, and migration
  `20260810000200_trip_reputation.sql` are pushed and deployed.
- Ledger commits through `e54a1b3` and migrations through
  `20260811000200_fix_ledger_currency_summary.sql` are deployed.
- Trip Pricing V1 and completed-fare ledger fixes are deployed through commit `eed38f6`; production
  booking, lifecycle completion, and the $48.94 Rider fare display passed.
- Driver Earnings and Wallet V1, its migration fix, and the Admin six-account validation fix are
  deployed through commit `9e61228`; production wallet and ledger reconciliation passed.
- Rider Payments and Collection V1 is implemented locally in
  `20260812000200_rider_payments_collection_v1.sql`; it is deployed through commit `ee21e67`, and
  paid-trip recovery fix `688693b` is deployed.
- Driver Connect Onboarding V1 is deployed through commit `9eb69ee`, and migration
  `20260812000300_driver_connect_onboarding_v1.sql` is applied. Production showed the Driver wallet
  and payout setup control. Compatibility fixes are deployed through commit `b1c1729`. Production
  Stripe-hosted onboarding passed, the verified Connect webhook synchronized the account to
  `enabled`, and **Manage payout account** is available.

## Delivered capabilities relevant to the test

- Verified Rider email access and tenant-scoped Rider profiles.
- Ride-now self-service booking and cancellation.
- Manual Admin Dispatch and Driver trip lifecycle.
- Driver offer deadlines, expiration recovery, alerts, and email.
- Rider lifecycle emails and Rider-controlled trip-email preference.
- Tenant-time-zone scheduled pickup selection.
- Tenant-controlled minimum notice, maximum advance window, dispatch lead, and reminder lead.
- Scheduled bookings remain unavailable to drivers until dispatch activation.
- Database-native one-minute scheduled activation using `pg_cron`.
- Scheduled confirmation, reminder, and dispatch-started Rider emails.

## Current test checkpoint

Live Trip Maps, Routing, and ETA passed production manual testing across Rider, Driver, and Admin.
The successful Philadelphia trip normalized both selected addresses and initially rendered a
plausible 28-minute, 15-mile road route. Driver acceptance, shared-map parity, consented live Driver
marker, refreshed ETA, authorized Rider/Admin visibility, explicit stop-sharing, marker removal, and
saved-route persistence all passed.

Regional autocomplete, required suggestion selection, permanent re-geocoding, atomic booking and
coordinate persistence, and rejection of invalid/mapless booking creation are deployed. Mapping
tests pass 9/9; maps and Rider lint/typechecks plus the Rider production build passed before release.

Reputation V1 has role-derived Rider and Driver submission RPCs, a 30-day submission window,
seven-day/both-submitted disclosure, tenant RLS, audited Admin moderation, and Rider, Driver, and
Admin UI. Production manual testing passed, including the corrected Rider layout and Driver rating
submission experience.

## Temporary production settings

The test plan recommends temporarily using:

- Minimum notice: 15 minutes
- Maximum advance window: 90 days, or temporarily 1 day for boundary testing
- Dispatch lead: 5 minutes
- Reminder lead: 1 hour

These values are recommendations, not a confirmed statement of current production configuration.
Record the actual values here when the owner reports them.

## Confirmed recent production results

- Rider production portal loads at `https://rider.eshapp.com`.
- Existing Rider identity was recovered successfully in another browser when the magic link was
  requested and opened in that same browser.
- Continued-search Rider email was automatically delivered after an unresolved Driver offer.
- Rider Trip Notifications manual verification produced successful results before scheduled
  booking testing began.

## Known operational detail

Supabase PKCE magic-link exchange must be completed in the same browser/device that initiated that
specific sign-in attempt. The Rider account is portable, but each new browser must request and open
its own link in that browser. Email-app embedded browsers and link scanners can consume or disrupt
one-time links.

## Open issues

Rider payment collection, the $49.39 paid-trip recovery flow, booking, and trip completion passed in
production. Driver Connect infrastructure, payout settings, connected-account webhook, deployment,
migration, hosted onboarding, and status synchronization also passed. The Driver account is
`enabled`; wallet totals remained $85.57 pending, $39.51 collected, $0.00 paid, and $125.08 owed.
The sandbox payout bank selected during onboarding ends in `2227`, Stripe's insufficient-funds test
fixture; it did not prevent account enablement but should be changed to the success fixture ending
`6789` before eventual payout execution testing.

The existing $39.51 collected earning cannot be used for a Stripe transfer: its Rider charge was
created in the original RideEasy sandbox, while the Driver connected account was created in the
separate RideEasy Connect Test sandbox. Rider and Driver must use the same Connect-enabled platform
environment for new collection and transfer activity. This version still creates no transfers or
payouts. A new $51.31 Rider payment in RideEasy Connect Test completed successfully; its $41.05
Driver share is the intended first transfer test. Local Driver Transfers V1 now implements a
per-trip, source-payment-verified, idempotent Stripe transfer and balanced payable settlement.
Driver tests, typecheck, production build, diff checks, and the migration dry-run pass; the dry-run
lists only `20260813000100_driver_transfers_v1.sql`. The first production application stopped at
the initial `create table` because `rider_payment_attempts` lacked composite uniqueness for the
tenant-scoped foreign key; no migration statements were applied. The local migration now adds
`unique (tenant_id, payment_attempt_id)` first and needs owner commit/deployment, a fresh dry-run,
migration retry, and production test.
Supabase, Stripe, Driver, and Admin typechecks pass; Driver and Admin lint pass; Driver tests pass
9/9; Admin tests pass 54/54; both production builds pass; `git diff --check` passes; and the required
remote dry-run lists only `20260812000300_driver_connect_onboarding_v1.sql`. Existing Next/Supabase
dynamic dependency and ESLint-plugin warnings remain non-blocking.

## Cleanup still required after testing

- Cancel unfinished test bookings.
- Return test Drivers to Offline.
- Restore the tenant's intended scheduling settings.
- Re-enable Rider trip emails if disabled during preference testing.
- Confirm no test booking remains `requested`, `offered`, `accepted`, `arrived`, or `in_progress`.

## Exact next action

Validate Driver Transfers V1, then have the owner commit/push and deploy it. Dry-run and apply only
`20260813000100_driver_transfers_v1.sql`, then transfer only the $41.05 earning for booking
`b133d49b-a359-4c11-afcc-bfebc994655e`. Confirm the old $39.51 cannot pass Stripe provenance
verification.

## Required reading for recovery

- `AGENTS.md`
- `docs/roadmap.md`
- `docs/architecture/scheduled-rider-bookings.md`
- `docs/architecture/rider-trip-notifications.md`
- `docs/architecture/verified-rider-booking.md`
- `docs/architecture/manual-dispatch-trip-core.md`
- `docs/architecture/automatic-driver-matching.md`
- `docs/architecture/realtime-driver-location.md`
- `docs/architecture/trip-reputation.md`
- `docs/architecture/ledger-foundation.md`
- `docs/operations/ledger-foundation-manual-test.md`
- `docs/architecture/trip-pricing.md`
- `docs/operations/trip-pricing-manual-test.md`
- `docs/architecture/driver-earnings-wallet.md`
- `docs/operations/driver-earnings-wallet-manual-test.md`
- `docs/architecture/rider-payments-collection.md`
- `docs/operations/rider-payments-collection-manual-test.md`
- `docs/architecture/driver-connect-onboarding.md`
- `docs/operations/driver-connect-onboarding-manual-test.md`
- `docs/architecture/driver-transfers.md`
- `docs/operations/driver-transfers-manual-test.md`
