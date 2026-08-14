# Session Handoff

Last updated: 2026-08-13

## Current objective

Complete Manual Ledger Reversals V1 without weakening immutable ledger or domain financial state.

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
Driver Transfers V1 is deployed through commits `b8e0705` and `6f6008a`, its corrected migration is
applied, and production passed end to end. The $41.05 Driver share created exactly one Stripe
transfer, reduced cash clearing and the Driver payable by $41.05, moved the Driver wallet amount
from Collected to Transferred to Stripe, and left the old-sandbox $39.51 untouched.

Driver Bank Payout Reconciliation V1 is implemented locally. It records signature-verified
connected-account `payout.created`, `payout.updated`, `payout.paid`, and `payout.failed` lifecycle
without a second ledger posting, and exposes Driver/Admin status. Driver tests, Driver/Admin/
Supabase typechecks, Admin tests, both production builds, and diff checks pass. The migration dry-run
lists only `20260813000200_driver_payout_reconciliation_v1.sql`. It needs webhook event selection,
owner commit/deployment, migration application, and production test.

During the payout manual test, **Manage payout account** replaced the Driver page with Stripe
Express and provided no ESH return control. A local UX fix now opens only the Express Dashboard link
in a separate tab while preserving the current-tab hosted-onboarding return flow. It needs Driver
owner commit/deployment; Driver tests, typecheck, and diff checks pass.

The owner requested an Admin Ledger redesign before financial records scale to many Drivers. A local
workspace redesign separates Overview, Driver balances, Rider payments, Bank payouts, Journal, and
Manual journal. Operational lists are searchable and paginated; journal entries and processor IDs
are collapsed by default. Admin tests pass 54/54; Admin typecheck, production build, and diff checks
pass. It needs owner commit/deployment and production UI verification.

Production review found the Driver balances table labeled Stripe capability as `Transfers` and did
not show transferred money. The local follow-up now derives and displays Pending, Collected,
Transferred to Stripe, and Amount owed per Driver, and renames the status column to Transfer
capability. It uses existing trips, paid payment attempts, immutable transfer records, and ledger
balances rather than storing duplicate totals.
Admin tests pass 54/54; Admin typecheck and diff checks pass. It needs owner commit/deployment and
production UI verification.

Pre-trip Rider Refunds V1 commit `b95cbc9` and migration
`20260813000300_pretrip_rider_refunds_v1.sql` are deployed. Rider and authorized Admin cancellation
use server-only Stripe refunds; ESH cancels only after Stripe accepts, marks the attempt refunded,
and posts a balanced prepayment/cash reversal. A database trigger blocks trip start while Stripe is
processing the refund. Completed/in-progress refunds and transferred earnings are deliberately
excluded. A
production $10.59 cancellation passed Stripe, Admin payment status, refund record, and ledger
verification, but the Rider card showed only `Cancelled` and the original fare. The local follow-up
loads the Rider-authorized refund record and permanently displays the refund amount and state on its
booking. Rider tests pass 4/4; Rider typecheck, production build, and `git diff --check` pass. The
existing Supabase realtime and Next ESLint-plugin build warnings remain non-blocking. Next: owner
commit/deploy and refresh that cancelled Rider trip.

The Rider-visible refund follow-up is deployed through commit `4bceb84` and the production $10.59
trip permanently shows its full refund. Rider Payments and Receipts V1 is now implemented locally:
the Payments tab reads existing Rider-RLS payment/refund records, associates finalized payments with
trip addresses, and requests Stripe-hosted receipts individually through an authenticated server
route. It requires no migration or new environment variable. Next: validate, owner commit/deploy,
and run `docs/operations/rider-payments-receipts-manual-test.md`. Rider tests pass 4/4; Rider
typecheck, production build, and `git diff --check` pass. The existing Supabase realtime dynamic
dependency and Next ESLint-plugin warnings remain non-blocking.

Production payment/refund history passed after commit `de62b55`, but **View Stripe receipt** appeared
to do nothing because its asynchronous popup-dependent launch was unreliable. The local follow-up
loads the authorized receipt first, then renders a normal new-tab link and sanitized payment-method
summary; retrieval errors remain visible. Next: validate, owner commit/deploy, and retry the current-
sandbox $10.59 receipt. Rider tests pass 4/4; Rider typecheck, production build, and `git diff
--check` pass. Existing Supabase realtime and Next ESLint-plugin warnings remain non-blocking.

Payment and Payout Notifications V1 is implemented locally on the durable notification outbox. It
adds independent Rider payment and Driver earnings email preferences; idempotent notifications for
payment, refund, earnings, transfer, and bank-payout state; minimal financial payloads; and Payments/
Earnings deep links. It introduces migration `20260813000400_payment_payout_notifications_v1.sql`
and requires Admin/Rider/Driver deployment plus database application. Next: validate all layers,
dry-run only the intended migration, then hand off the production manual test. Admin tests pass
57/57; Rider tests pass 4/4; Driver tests pass 9/9; Admin, Rider, Driver, and Supabase typechecks
pass; all three production builds pass; `git diff --check` passes; and the remote migration dry run
lists only `20260813000400_payment_payout_notifications_v1.sql`. Existing Supabase realtime and
Next ESLint-plugin warnings remain non-blocking.

The first production notification test booked successfully and sent the existing Driver offer email,
but Rider showed a false `Payment status could not be loaded` alongside the successful paid-trip
recovery message, and financial emails had not yet arrived. Repository evidence showed the Stripe
return parameters could retrigger recovery and the shared delivery cron ran only once daily. The
local fix consumes the return parameters before recovery, treats an already-booked trip as success,
and documents immediate delivery through Admin Notifications. A sub-daily Vercel cron was rejected
from the design because Hobby deployments permit only once-daily schedules. Next: validate and
deploy Rider, then deliver the already queued financial notifications from Admin.
Rider tests pass 4/4; Rider typecheck, production build, and `git diff --check` pass. Existing
Supabase realtime and Next ESLint-plugin warnings remain non-blocking.

Production retest still showed the safer recovery warning. The root sequencing issue is now
identified: Stripe-return recovery could run after authentication but before `tenantSlug` had been
selected, causing the service-area context call to fail with an empty tenant even though payment and
booking were valid. The local correction waits for session, Supabase, and tenant selection before
consuming the one-time Stripe return parameters.
Rider tests pass 4/4; Rider typecheck and production build pass after this final guard correction.

The Stripe-return guard is deployed through commit `ca77fef`. Financial notifications still require
Admin **Deliver queued** or the once-daily Hobby cron, which is too slow for transactional email.
Automatic Transactional Email Delivery V1 is now implemented locally without a migration. Trusted
Rider and Driver server routes request tenant-scoped Admin outbox delivery after authoritative
payment, refund, trip-completion earnings, transfer, and connected-account payout transitions.
Admin refunds invoke the delivery service directly. A Driver-authenticated server bridge handles
browser-initiated trip completion. The Admin endpoint accepts only a tenant ID and uses a shared,
server-only high-entropy credential; Resend secrets remain Admin-only. Requests are time-bounded and
best-effort, so delivery failure cannot reverse or falsely fail a financial operation. Durable
outbox retries, manual Admin delivery, and the daily cron remain recovery paths. Next: validate all
three apps, configure the shared delivery secret and Rider/Driver Admin URL, deploy Admin then Rider
and Driver, and run the automatic-delivery manual test.

Validation is complete: Admin tests pass 57/57, Rider tests pass 4/4, Driver tests pass 9/9; all
three typechecks and production builds pass; and `git diff --check` passes. The existing Supabase
Realtime dynamic-dependency and missing Next ESLint-plugin warnings remain non-blocking. No database
migration is introduced by this delivery follow-up.

Automatic Transactional Email Delivery V1 is committed at `97a4ae8`; the repository was clean when
Driver Earnings Statements V1 began. Statements are now implemented locally as a date-bounded
projection of the existing role-derived Driver wallet and bank-payout activity. They show locked
fares, earnings, platform fees, pending/collected/transferred totals, and separately reported paid
bank payouts; provide local CSV download and print output; and explicitly avoid unproven
transfer-to-payout allocation or tax-form claims. The pure calculation/export module has unit tests.
No migration or environment variable is required. Next: complete Driver validation, then owner
commit/deploy and run `docs/operations/driver-earnings-statements-manual-test.md`.

Driver Earnings Statements validation is complete: the Driver typecheck passes with incremental
output disabled for the restricted workspace, all 11 Driver tests pass (including 2 statement
calculation/export tests), the production build passes, and `git diff --check` passes. The existing
Supabase Realtime dynamic-dependency and missing Next ESLint-plugin warnings remain non-blocking.

The owner deployed Driver Earnings Statements V1 and reported the production manual test passed.
Date filtering, period totals, trip rows, separately reported bank payouts, CSV download, and print
output are therefore accepted as the current production checkpoint.

Transfer-to-Payout Reconciliation V1 is implemented locally. For automatic connected-account
payouts, the signature-verified Driver webhook queries Stripe balance transactions using the payout
filter and connected-account context, then a service-only RPC links only same-tenant, same-Driver,
same-currency successful ESH transfers. A tenant-RLS allocation table and payout-level matched,
unmatched, status, error, and reconciliation timestamps support Driver/Admin visibility. Manual
payouts are explicitly unsupported for automatic allocation; partial/unmatched results are exposed
rather than guessed. Replays replace derived links and audit only changed results. No additional
ledger posting is created. Migration `20260813000500_transfer_payout_reconciliation_v1.sql` and
client types are included. Next: validate, dry-run only that migration, then owner apply/deploy and
run `docs/operations/transfer-payout-reconciliation-manual-test.md`.

Validation is complete: Supabase, Driver, and Admin typechecks pass; Driver tests pass 12/12
(including the balance-transaction reference test); Admin tests pass 57/57; both production builds
pass; and `git diff --check` passes. The remote migration dry run lists only
`20260813000500_transfer_payout_reconciliation_v1.sql`. Existing Supabase Realtime and Next ESLint-
plugin warnings remain non-blocking.

The owner accepted Transfer-to-Payout Reconciliation V1 with live payout-event observation deferred
until Stripe creates the scheduled automatic payout. Commit `5522bea` is pushed and the repository
was clean when Manual Ledger Reversals V1 began.

Manual Ledger Reversals V1 is implemented locally. Authorized tenant finance managers can reverse
only `manual:*` journals through a new RPC and Admin Journal control. The database posts the exact
swapped entries, preserves both immutable transactions, stores an immutable one-to-one link with a
required reason and actor, returns the existing reversal on replay, and audits the correction.
Automated fare, payment, earnings, transfer, payout, refund, and booking-linked journals are rejected
because ledger-only reversal would contradict their domain state. Migration
`20260814000100_manual_ledger_reversals_v1.sql`, client types, architecture, and production test are
included. Next: validate, dry-run only that migration, then owner apply/deploy and manual test.

Validation is complete: Supabase and Admin typechecks pass, Admin tests pass 57/57, the Admin
production build passes, and `git diff --check` passes. The remote migration dry run lists only
`20260814000100_manual_ledger_reversals_v1.sql`. Existing Supabase Realtime and Next ESLint-plugin
warnings remain non-blocking.

## Cleanup still required after testing

- Cancel unfinished test bookings.
- Return test Drivers to Offline.
- Restore the tenant's intended scheduling settings.
- Re-enable Rider trip emails if disabled during preference testing.
- Confirm no test booking remains `requested`, `offered`, `accepted`, `arrived`, or `in_progress`.

## Exact next action

Have the owner commit, apply only `20260814000100_manual_ledger_reversals_v1.sql`, push/deploy Admin,
and run `docs/operations/manual-ledger-reversals-manual-test.md`.

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
- `docs/architecture/driver-payout-reconciliation.md`
- `docs/operations/driver-payout-reconciliation-manual-test.md`
- `docs/architecture/pretrip-rider-refunds.md`
- `docs/operations/pretrip-rider-refunds-manual-test.md`
- `docs/architecture/rider-payments-receipts.md`
- `docs/operations/rider-payments-receipts-manual-test.md`
- `docs/architecture/payment-payout-notifications.md`
- `docs/operations/payment-payout-notifications-manual-test.md`
- `docs/architecture/driver-earnings-statements.md`
- `docs/operations/driver-earnings-statements-manual-test.md`
- `docs/architecture/transfer-payout-reconciliation.md`
- `docs/operations/transfer-payout-reconciliation-manual-test.md`
- `docs/architecture/manual-ledger-reversals.md`
- `docs/operations/manual-ledger-reversals-manual-test.md`
