# Session Handoff

Last updated: 2026-08-12

## Current objective

Complete Driver Stripe Connect Onboarding V1 on deployed Rider collection and Driver earnings.

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
- Driver Connect Onboarding V1 is implemented locally in
  `20260812000300_driver_connect_onboarding_v1.sql`; it is not committed or deployed.

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
production. Driver Connect Onboarding V1 needs owner Connect sandbox setup, commit/deployment,
migration application, and manual testing. It creates
Stripe Express accounts with transfers capability, uses Stripe-hosted onboarding and dashboard
links, verifies a distinct connected-account webhook, and exposes collected versus uncollected
earnings. It does not create transfers or payouts.
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

Owner configures Driver server-only Stripe/Supabase secrets, commits and pushes the listed files,
creates the connected-account webhook, applies the single verified migration, and runs the Connect
manual test.

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
