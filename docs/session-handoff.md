# Session Handoff

Last updated: 2026-08-18

## Current objective

Complete the Capacitor mobile app shell foundation for Rider and Driver; SMS production verification
waits on Twilio billing ticket `#29018616`, and the Stripe sandbox dispute retry issue remains
deferred.

## Repository and deployment state

- Hybrid toll fallback commit `728ae13` is deployed and requires `GOOGLE_MAPS_API_KEY` in the Rider
  Production environment. Migration `20260816000300_google_toll_estimates_v1.sql` must be applied
  before a successful Google-backed quote can be persisted. A local diagnostic follow-up is
  validated by Rider tests and typecheck; it will expose only Google's HTTP status and safe error
  status/message in server logs. Owner must deploy it, then inspect the reported status.
- Actual-distance adjustment schema is present in migration
  `20260817000100_actual_distance_adjustments_v1.sql`, but the Driver completion flow does not ask
  users to enter distance. Future candidates must come from trusted server-calculated route/GPS
  data; no automatic fare, payment, refund, or Driver-earnings movement occurs yet. The temporary
  manual-input UI was removed before the follow-up deploy.
- Production route-metrics work is now implemented locally in migration
  `20260817000200_trip_route_metrics_v1.sql`. It aggregates consented in-trip Driver location
  updates into distance/duration on the booking, retains no point history, and captures metrics at
  completion. The migration dry-run lists only this migration. It still needs owner apply, type/
  production validation, and the final fare-adjustment/payment workflow before any fare changes are
  enabled.
- Production manual testing found a separate lifecycle hardening issue: a Driver can currently
  complete an in-progress trip without measurable movement. Leave this behavior unchanged during
  route-metrics validation; later add no-movement/insufficient-telemetry detection and operational
  review rather than silently recalculating the fare to zero.

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

Preset Toll Pricing V1 is implemented locally as a generic database-backed catalog with DRPA as the
initial Philadelphia authority. The trusted quote route keeps Mapbox traffic-aware distance and
duration, performs a metadata-only driving request for named toll collection points, resolves
catalog aliases and effective-dated rates for westbound passenger/SUV crossings, validates rate
references inside the service-role quote RPC, and rejects unknown toll facilities rather than
undercharging. Toll amount, rate references, aliases, and source details are stored in the locked
quote snapshot and shown in the Rider quote. Maps tests pass 12/12; Rider tests pass 8/8; Rider and
Supabase typechecks pass; Rider production build passes after adding the generated relationship
metadata for the new catalog view and rebuilding with a fresh Next ESLint cache. The migration has
been dry-run and applied successfully after correcting ambiguous catalog seed references. It
preserves the deployed 10-argument quote RPC during rollout and adds the required 12-argument
toll-aware RPC. Commit `1851c72` is deployed. Next: run
`docs/operations/preset-tolls-manual-test.md` in production.

The first production toll test exposed a matcher false negative: Mapbox reported a detected toll
facility, but its descriptive metadata type did not match the catalog's stored `mapbox_type`. The
local follow-up now treats the normalized facility alias as the pricing identity and retains the
Mapbox type only as metadata. Maps tests pass 13/13; Rider tests pass 8/8; Maps build, Rider
typecheck, and diff checks pass. It needs owner commit/deploy before retesting the DRPA route.

The deployed diagnostic then confirmed the DRPA route returns an unnamed `toll_booth`. A local
coordinate-matching follow-up now captures Mapbox toll intersection coordinates, stores trusted
coordinates for the four DRPA facilities, and matches unnamed booths within a bounded radius. It
adds migration `20260816000200_toll_facility_coordinates_v1.sql`. Maps tests pass 14/14; Rider
tests pass 8/8; Maps/Rider/Supabase typechecks and diff checks pass. Next: dry-run and apply only
that migration, owner commit/deploy, then rerun the DRPA production test.

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

Capacitor Mobile App Shell V1 is implemented locally. Rider and Driver each have separate Capacitor
configuration, Android and iOS projects, native bundle IDs, secure HTTPS hosted URLs, and App,
Browser, Geolocation, and Push Notifications plugin registration. The shell preserves the existing
Next.js backend and web UI; no server secrets enter the bundle. Native push credentials, store
signing, and background-location review remain follow-up work. Rider Android now uses the verified
HTTPS App Link `https://rider.eshapp.com/auth/callback?tenant=<tenantSlug>` with
`apps/rider/public/.well-known/assetlinks.json` and retains `com.esh.rider://auth/callback` as a
fallback. Its native callback handler accepts both PKCE codes and token fragments before restoring
the Supabase session. Driver Android now has the corresponding verified
`https://driver.eshapp.com/auth/callback` App Link, `com.esh.driver://auth/callback` fallback,
browser callback route, and idempotent native session restoration. Rider and Driver tests,
typechecks, and production builds pass. Next: owner commit/deploy the Driver App Links change,
verify the public Driver assetlinks endpoint, then build and install the Driver debug APK using
`docs/operations/mobile-app-shell-manual-test.md`.

Driver embedded navigation is now implemented locally on the Android native boundary. The Driver
dependency uses Mapbox Navigation SDK 3.26.0 with the secret Downloads:Read token remaining in the
owner's global Gradle properties. A Capacitor `EmbeddedNavigation` plugin launches an Android
Mapbox navigation screen with the verified pickup/destination coordinates and the public runtime
token. Web, iOS, and older APKs retain the existing Google Maps fallback. The native screen now
also renders the current written maneuver announcement in a high-contrast banner while retaining
Mapbox voice guidance. Driver web tests pass 16/16 and typecheck/diff checks pass. The native
Android build and device test are still required; do not claim embedded turn-by-turn is
production-ready until the APK visibly opens the Mapbox screen, obtains location permission,
draws a route, follows the Driver location, and displays written maneuver updates.

Admin trip termination is implemented locally in migration `20260818000100_admin_end_in_progress_trip_v1.sql`.
It adds a tenant-authorized `admin_complete_in_progress_trip` RPC, requires a 3–500 character
reason, records the Admin person and completion reason on the booking, and writes an audit event.
The Admin Dispatch panel now shows **End trip as Admin** only for `in_progress` bookings. Admin
tests pass 63/63; Admin and Supabase typechecks plus diff checks pass. Next: owner dry-run/apply the
migration, commit/deploy, and test an in-progress trip from Admin while confirming Rider/Driver
status and financial completion behavior.

Rider/Driver trip-surface cleanup is implemented locally: completed and cancelled Rider bookings
are collapsed into a compact Trip history section while active bookings remain prominent; Driver
pickup navigation is shown only before arrival, and destination navigation remains available after
arrival. Driver tests/typecheck pass (16/16); Rider tests pass (11/11), but Rider typecheck still
reports the pre-existing `google-tolls.test.ts` tuple/body typing error. These are web UI changes
and do not require a native rebuild. The Rider booking form is also disabled while a live trip is
requested, offered, accepted, arrived, or in progress; future scheduled bookings do not block a
new request.

Rider pickup convenience now supports a one-time current-location lookup through Capacitor
Geolocation (with browser fallback) and Mapbox reverse geocoding. The resolved street address is
shown for confirmation and remains editable through the normal verified-address search; raw
coordinates are not persisted by this convenience flow. This is a hosted web change and does not
require a native rebuild because the Geolocation plugin is already present in the Rider shell.

Vehicle service choices are now implemented locally. Vehicles default to `standard` and Admin can
classify each fleet vehicle as `standard`, `larger`, `premium`, or `accessible`; Rider booking
passes the selected type through the priced-booking RPC, and automatic matching requires an active
assigned vehicle of that type. Rider cards use the provided Camry, Sienna, Tahoe, and Chrysler WAV
images. Migrations `20260819000100_vehicle_service_types_v1.sql` and
`20260819000200_premium_vehicle_service_type_v1.sql` still need owner dry-run/apply, commit,
deployment, and production matching validation.

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

The owner deployed Manual Ledger Reversals V1 at commit `5f18488`. The first production test exposed
a client-only post-success error: `postJournal` accessed React's `event.currentTarget` after awaiting
the database call, when it was null. The ledger posting itself likely succeeded. A local hotfix now
captures the form element before the await and resets that stable reference. Next: validate and
deploy the hotfix, refresh Journal before posting again, then continue the reversal test using the
single existing test journal if present.

The manual-journal reset hotfix is deployed through commit `afdae77`, and production verification of
Manual Ledger Reversals V1 passed. Two test journals remained immutable, each received exactly one
linked inverse with the required reason, and the entries displayed the correct swapped sides.

Completed-Trip Refund and Driver Recovery V1 is implemented locally. An authorized finance manager
can fully refund a paid completed trip. If its Driver earning was transferred but has not entered an
active or paid bank payout, Admin reverses that exact Stripe transfer first, persists a retry
checkpoint, then creates the full Rider refund. One database transaction posts the transfer recovery
when applicable, Driver-earning reversal, and Rider refund; updates payment, refund, transfer, and
booking state; and audits the recovery without rewriting original history. Stable processor
idempotency keys make retries safe. Rider history and the existing refund notification reuse the
durable refund record. Driver wallet/history retains the trip, labels the reversed earning, and
excludes it from active pending, collected, and transferred totals. Migration
`20260814000200_completed_trip_refund_recovery_v1.sql`, Admin recovery UI/API, Driver presentation,
client types, architecture, and production test are included. Next: complete validation, dry-run
only the intended migration, then owner apply/deploy and production manual test.

Validation is complete: Admin tests pass 57/57, Driver tests pass 13/13, Admin, Driver, and Supabase
typechecks pass, both production builds pass, and `git diff --check` passes. The existing Supabase
Realtime dynamic-dependency and missing Next ESLint-plugin warnings remain non-blocking. The remote
migration dry run lists only `20260814000200_completed_trip_refund_recovery_v1.sql`.

Completed-Trip Refund and Driver Recovery V1 is committed at `538f135`, and the remote database is
up to date through `20260814000200_completed_trip_refund_recovery_v1.sql`. Production manual-test
results have not yet been reported.

Rider Payment Disputes V1 is implemented locally. The existing signature-verified Rider Stripe
webhook accepts dispute created, updated, closed, funds-withdrawn, and funds-reinstated events. A
tenant/Rider-isolated dispute record supports multiple disputes per payment, stores bounded lifecycle
state and deadlines, and posts the disputed principal exactly once when Stripe withdraws funds and
the exact inverse if Stripe reinstates them. Admin has a searchable Disputes workspace and flags
successful Driver transfers for reviewed recovery; Rider Payments shows the dispute without changing
the underlying successful PaymentIntent state. V1 deliberately does not submit evidence, account for
Stripe fees unrelated to the dispute, or silently reverse Driver transfers. Migration
`20260814000300_rider_payment_disputes_v1.sql`, client types, architecture, webhook setup, unit tests,
and production test are included. Next: finish validation and dry-run only the intended migration.

Validation is complete: Rider tests pass 6/6, Admin tests pass 57/57, Rider, Admin, and Supabase
typechecks pass, both production builds pass, and `git diff --check` passes. The existing Supabase
Realtime dynamic-dependency and missing Next ESLint-plugin warnings remain non-blocking. The remote
migration dry run lists only `20260814000300_rider_payment_disputes_v1.sql`.

The first production dispute exposed a valid out-of-order webhook case. Stripe delivered
`charge.dispute.funds_withdrawn` before `checkout.session.completed`, so ESH could not yet resolve the
PaymentIntent and returned 400. A later automatic retry of `charge.dispute.created` succeeded, but
the initial implementation did not inspect that event's included balance transactions; Admin showed
the $104.04 dispute as not finalized/not withdrawn. A local recovery migration and webhook update now
process authoritative balance transactions from every dispute event, backfill the later booking,
and post the exact $119.04 Stripe withdrawal ($104.04 principal plus $15.00 dispute fee) once. After
deployment, resend the successful `charge.dispute.created` event to recover this production record.

Recovery validation is complete: Rider tests pass 6/6; Rider, Admin, and Supabase typechecks pass;
both production builds pass; and `git diff --check` passes. The existing Supabase Realtime and Next
ESLint-plugin warnings remain non-blocking. The remote dry run lists only
`20260814000400_dispute_event_order_recovery.sql`.

A fresh $48.36 dispute reproduced the failure: Stripe delivered dispute creation and withdrawal
before Checkout completion, and both returned 400 as expected at first, but an automatic retry after
Checkout also returned 400. Vercel confirmed correct routing and firewall allowance but exposed no
exception because the webhook catch block returned only its generic public error. A local diagnostic
follow-up now logs only the verified event type/object ID and sanitized error name, message, database
code, details, and hint. It never logs the signature, payload, payment credentials, or secrets and
keeps the public 400 response generic. Next: deploy Rider diagnostics and inspect one automatic retry.

The diagnostic is deployed through commit `b25be36`. No post-deployment Stripe retry has occurred,
so the sandbox dispute issue is explicitly deferred and does not block normal payments or bookings.
Rider Wallet and Credits V1 is now implemented locally. It adds immutable Rider subledger entries,
an aggregate wallet-credit liability, audited Admin credit issuance, role-derived Rider balance and
history, concurrency-safe quote reservations, wallet-only and split wallet/Stripe checkout,
prepayment application, pre-trip restoration, and conservative Driver transfer eligibility. It
introduces `20260814000500_rider_wallet_credits_v1.sql` and requires Supabase, Admin, and Rider
deployment, database application, and the production manual test. Validation is complete: Rider
tests pass 6/6, Admin tests pass 57/57, Rider/Admin/Supabase typechecks pass, both production builds
pass, and `git diff --check` passes. The remote migration dry run lists only
`20260814000500_rider_wallet_credits_v1.sql`. Existing Supabase Realtime and missing Next ESLint-
plugin warnings remain non-blocking.

Rider Wallet and Credits V1 is deployed through commit `53440af`; the owner reported its production
manual test passed. Recurring Rider Bookings V1 is now implemented locally. A tenant-local series
stores one verified route and two to 50 occurrence times without pre-creating bookings or charging
the series. Each occurrence receives a fresh current-price quote and uses the existing wallet/Stripe
payment flow before atomically becoming one normal scheduled booking. Riders can skip one unpaid
occurrence or cancel the remaining unpaid series; paid trips retain the existing individual refund
contract. Admin has read-only operational visibility. Migration
`20260815000100_recurring_rider_bookings_v1.sql`, client types, helper tests, architecture, and the
production test are included. Validation is complete: Rider tests pass 8/8, Admin tests pass 57/57,
Rider/Admin/Supabase typechecks pass, both production builds pass, and `git diff --check` passes.
The remote migration dry run lists only `20260815000100_recurring_rider_bookings_v1.sql`. Existing
Supabase Realtime and missing Next ESLint-plugin warnings remain non-blocking.

Recurring Rider Bookings V1 is deployed through commit `714fcf4`; the owner reported production
series creation, one paid scheduled occurrence, and later unpaid occurrences all display correctly.
Recurring Rider Autopay V2 is now implemented locally. Ordinary Stripe Checkout saves only reusable
Stripe references after explicit card consent. Riders separately enable autopay per active series.
The protected Rider cron prices each due occurrence at current rates, applies wallet credit first,
charges the saved method off-session, atomically creates one scheduled booking, and records bounded
retry or manual-recovery state. Rider and Admin visibility, action-required email, RLS, service-only
mutation, audit, client types, architecture, and the production manual test are included. Migration
`20260815000200_recurring_rider_autopay_v2.sql` requires owner application before the Rider/Admin
deployment. Validation is complete: Rider tests pass 8/8, Admin tests pass 59/59,
Rider/Admin/Supabase typechecks pass, both production builds pass, and `git diff --check` passes.
The remote migration dry run lists only `20260815000200_recurring_rider_autopay_v2.sql`. Existing
Supabase Realtime and missing Next ESLint-plugin warnings remain non-blocking.

Recurring Rider Autopay V2 is deployed through commit `038ec7a`, its migration is applied, and the
existing Rider production schedule detects the saved Stripe method and offers **Enable autopay**.
A local Rider UX follow-up now treats autopay as the primary path: enabled future occurrences show
**Autopay scheduled**, retain quiet **Pay early** and **Skip** recovery controls, hide payment
controls while processing, and promote **Price and pay** only after definitive failure or when
autopay is off. No migration or environment-variable change is required. Rider tests pass 8/8,
Rider typecheck and production build pass, and `git diff --check` passes; the known Supabase
Realtime and missing Next ESLint-plugin warnings remain non-blocking.

The recurring-autopay control hierarchy is deployed through commit `37fcd7d`; production shows
**Autopay scheduled**, **Pay early**, and **Skip** correctly. Web Push Notifications V1 is now
implemented locally. Rider and Driver explicitly subscribe each browser with one public VAPID key;
Admin holds the private key and supplements existing queued email events with privacy-safe push.
Tenant/profile-scoped subscriptions, independent delivery attempts, expired-endpoint cleanup,
service workers, portal controls, Admin delivery integration, client types, environment templates,
architecture, and the production test are included. Migration
`20260815000300_web_push_notifications_v1.sql` requires owner application before Admin/Rider/Driver
deployment. Validation is complete: Admin tests pass 61/61, Rider tests pass 8/8, Driver tests pass
13/13, all four typechecks and all three production builds pass, and `git diff --check` passes. The
remote migration dry run lists only `20260815000300_web_push_notifications_v1.sql`. Existing
Supabase Realtime and missing Next ESLint-plugin warnings remain non-blocking.

Web Push Notifications V1 is deployed through commit `6e34687`; the owner configured one VAPID
pair and reported Rider and Driver production testing passed. SMS Trip Notifications V1 is now
implemented locally with Twilio Verify ownership checks, explicit Rider/Driver consent and opt-out,
service-only tenant/profile subscriptions, independent idempotent attempts, privacy-safe urgent
copy, channel-specific Admin results, client types, environment templates, architecture, and a
production test. Migration `20260815000400_sms_trip_notifications_v1.sql` requires validation and
owner application before deploying Admin, Rider, and Driver.

SMS validation is complete: Admin tests pass 63/63, Rider tests pass 8/8, Driver tests pass 13/13;
Admin, Rider, Driver, and Supabase typechecks pass; all three production builds pass; and
`git diff --check` passes. The remote migration dry run lists only
`20260815000400_sms_trip_notifications_v1.sql`. Existing Supabase Realtime and missing Next
ESLint-plugin warnings remain non-blocking.

Production verification exposed that Rider SMS success/failure used the distant page-level banner.
The inline-feedback correction is deployed through commit `5ca506e`. The next verification request
reached Twilio but was rejected because the configured account is suspended with an unexplained
negative balance. Twilio billing ticket `#29018616` requests the transaction-level history. SMS
production testing is deferred until Twilio reactivates the account; email and Web Push remain
operational.

## Cleanup still required after testing

- Cancel unfinished test bookings.
- Return test Drivers to Offline.
- Restore the tenant's intended scheduling settings.
- Re-enable Rider trip emails if disabled during preference testing.
- Confirm no test booking remains `requested`, `offered`, `accepted`, `arrived`, or `in_progress`.

## Exact next action

Hybrid Google Routes toll fallback is now implemented locally. Mapbox remains authoritative for
route distance and ETA; catalog-matched tolls remain authoritative; unmatched Mapbox tolls use a
server-only Google Routes estimate only when Google returns a known USD amount, and the quote
snapshot marks it `google_routes` and estimated. Migration `20260816000300_google_toll_estimates_v1.sql`
is dry-run ready and lists as the only pending migration. Rider tests pass 10/10, Maps tests pass
14/14, all relevant typechecks and diff checks pass. Next: owner apply that migration, commit/
deploy with `GOOGLE_MAPS_API_KEY` configured in Rider Production, then retest the DRPA route.

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
- `docs/architecture/mobile-app-shell.md`
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
- `docs/architecture/completed-trip-refund-recovery.md`
- `docs/operations/completed-trip-refund-recovery-manual-test.md`
- `docs/architecture/rider-payment-disputes.md`
- `docs/operations/rider-payment-disputes-manual-test.md`
- `docs/architecture/rider-wallet-credits.md`
- `docs/operations/rider-wallet-credits-manual-test.md`
- `docs/architecture/recurring-rider-bookings.md`
- `docs/operations/recurring-rider-bookings-manual-test.md`
- `docs/architecture/recurring-rider-autopay.md`
- `docs/operations/recurring-rider-autopay-manual-test.md`
- `docs/architecture/web-push-notifications.md`
- `docs/operations/web-push-notifications-manual-test.md`
- `docs/architecture/sms-trip-notifications.md`
- `docs/operations/sms-trip-notifications-manual-test.md`
