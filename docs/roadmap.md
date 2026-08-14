# Product and Platform Roadmap

This roadmap tracks delivery order without changing the architectural boundaries in the detailed design
documents. Transportation is the first product domain built on ESH Platform; reusable foundations must
remain independent of transportation-specific workflows.

## Delivered Foundations

- Modular pnpm/Turborepo workspace and shared platform packages.
- Tenant foundation, memberships, roles, capabilities, audit, RLS, and tenant selection.
- Platform tenant provisioning and invitation acceptance.
- Resend invitation delivery and signed delivery webhooks.
- Driver Management V1 with tenant lifecycle, authorization, and audit.
- Driver applications, file submission, draft-profile creation, and onboarding checklists.

## Current Milestone: Driver Evidence and Compliance MVP

Status: **implemented and rolled out to production**.

Scope:

- Tenant-scoped evidence metadata and activation requirements.
- Server-mediated private uploads with type and size validation.
- Short-lived signed evidence viewing after tenant authorization.
- Evidence approval, rejection, notes, expiration dates, reviewer attribution, and audit.
- Derived document-compliance status.
- Database enforcement preventing activation before onboarding and evidence approval.

Deferred from this milestone:

- OCR and automatic classification.
- External identity or background-check providers.
- Dispatch eligibility and location.

Scheduled expiration reminders, fleet records, and vehicle-specific compliance were originally
deferred from this milestone and were delivered under the later milestones below.

## Current Stabilization Focus

- Make evidence review operate only on the newest upload for each document type.
- Show the exact driver or vehicle document blocking service availability.
- Verify eligible drivers can move online and offline without weakening database enforcement.
- Add automated browser coverage for the core availability transition.
- Keep test credentials isolated from production and return test drivers offline after verification.

## Next Milestones

1. **Driver Identity and Application Access**
   - Verify applicant email ownership before collecting evidence.
   - Bind applications to authenticated Supabase identities.
   - Add driver account activation and self-service application status.
   - Current delivery: approved applicants can activate the existing identity link and view driver,
     onboarding, and document-compliance status in the Driver app.
   - Current delivery: drivers can see requirement-level evidence status and submit private
     replacements for administrator review.
   - Current delivery: administrator-triggered activation and evidence-status notification outbox,
     Resend delivery, retry controls, and webhook-tracked delivery state.
   - Current delivery: driver-controlled expiration reminders at 30 days, 7 days, and expiration,
     with automatic daily delivery and retry.
   - Current delivery: requirement-driven expiration rules with enforced future dates during review.
   - Remaining: additional delivery channels and tenant-configurable reminder schedules.
2. **Fleet and Vehicle Management**
   - Tenant-scoped vehicle identity and lifecycle.
   - Driver/vehicle assignment history.
   - Current delivery: private vehicle photos, tenant-admin lifecycle controls, one active
     driver/vehicle assignment with preserved history, and assigned-vehicle display in the Driver
     portal.
   - Current delivery: configurable registration, insurance, inspection, and operating-permit
     requirements; assigned-driver uploads; tenant-admin review; derived vehicle compliance; and
     scheduled expiration reminders.
3. **Notification Foundation**
   - Generalize invitation delivery into reusable notification contracts.
   - Current delivery in progress: preference-controlled Rider payment/refund and Driver earnings,
     transfer, and bank-payout lifecycle emails through the durable outbox, with event-driven
     delivery and daily/manual recovery.
   - Current delivery: durable driver notification contracts, templates, retries, history, and
     webhook-tracked delivery.
   - Current delivery: driver expiration-reminder preferences and scheduled compliance reminders.
   - Remaining: additional delivery channels and tenant-configurable reminder schedules.
4. **Realtime and Service Areas**
   - Privacy and consent contracts.
   - Driver availability, service areas, and location exposure policy.
   - Current delivery: driver-controlled online/offline availability, database-enforced driver and
     vehicle compliance eligibility, tenant-admin visibility, and availability audit history.
   - Current delivery: tenant-managed circular service areas, active/inactive lifecycle,
     tenant-wide or selected-driver coverage, preserved assignment history, and available-area
     visibility in the Driver portal.
   - Current delivery: driver choice of one authorized operating area, automatic choice when only
     one area is available, offline-only switching, and area-aware availability visibility.
   - Current delivery: explicit Driver-controlled current-location sharing, circular-boundary
     validation, tenant-dispatch visibility, active-trip Rider exposure, freshness/accuracy status,
     automatic clearing, and no route-history retention.
   - Remaining: polygon boundaries and route-aware presence.
5. **Dispatch and Trip Core**
   - Booking/trip lifecycle, offers, assignments, reassignment, and operational audit.
   - Current delivery: tenant-admin manual booking creation, area-aware eligible-driver offers,
     driver acceptance or decline, reassignment, cancellation, and accepted → arrived →
     in-progress → completed trip execution.
   - Current delivery: 90-second offer deadlines, server-enforced expiration, automatic Driver and
     Admin refresh, live countdowns, new-offer alerts, reassignment recovery, and driver email
     delivery through the notification outbox.
   - Current delivery: verified-email Rider access, tenant-scoped rider profiles, service-area trip
     requests, rider cancellation before trip start, booking history/status, and post-acceptance
     driver and vehicle disclosure.
   - Current delivery: preference-controlled Rider trip emails for booking receipt, continued
     driver search, acceptance, arrival, trip start, completion, and cancellation, using the shared
     durable outbox, retries, delivery history, and Resend webhook tracking.
   - Current delivery: tenant-time-zone scheduled Rider trips, configurable notice/advance,
     dispatch-lead and reminder windows, delayed dispatch activation, upcoming-trip cancellation,
     confirmation/reminder emails, and Admin visibility without advance driver reservation.
   - Current delivery: tenant-controlled automatic matching, deterministic eligible-Driver ranking,
     sequential time-bounded offers, decline/expiration progression, attempt visibility, database-
     native expiration processing, audit, and safe manual fallback.
   - Current delivery: region-aware pickup/destination autocomplete, permanent geocoding with atomic
     Rider booking persistence, embedded Admin/Driver/Rider maps, traffic-aware road routes, live
     Driver markers, distance/ETA, privacy enforcement, and graceful mapping-provider fallback.
   - Current delivery in progress: Stripe-hosted Rider checkout, verified payment state, paid-only
     booking finalization, and immutable collection settlement.
   - Remaining: recurring bookings and SMS/push delivery.
6. **Reputation**
   - Current delivery: tenant-isolated post-trip Rider and Driver ratings, product-
     specific criteria, 30-day submission windows, retaliation-resistant delayed disclosure,
     audited Admin moderation, and portal experiences for both sides.
   - Production manual verification passed across Rider and Driver submission and disclosure.
   - Remaining: notifications, appeals, aggregate public profiles, and any deliberate rating-based
     matching policy.
7. **Money and Ledger**
   - Current delivery: fixed tenant operating currency, integer minor-unit semantics,
     immutable balanced double-entry postings, generic operating accounts, idempotency, tenant RLS,
     audit, and Admin balances/journal visibility.
   - Current delivery: configurable Driver fare share, per-Driver payable accounts,
     immutable completed-trip allocation, ledger-derived Driver wallet, and locked trip history.
   - Current delivery in progress: Rider payment attempts, Stripe collection, prepayment accounting,
     completed-trip receivable settlement, and Admin payment visibility.
   - Current delivery in progress: Stripe Express Driver onboarding, payout readiness, collected-
     earnings availability, signed Connect status updates, and Admin visibility.
   - Current delivery in progress: Driver-initiated, per-trip Stripe transfers with source-payment
     provenance validation, idempotent settlement, and immutable payable clearing.
   - Current delivery in progress: connected-account bank payout lifecycle reconciliation with
     verified Stripe events and Driver/Admin operational status.
   - Current delivery: scalable Admin financial workspace with separated overview, Driver balances,
     Rider payments, bank payouts, filtered journal, pagination, and manual adjustments.
   - Current delivery in progress: full, idempotent Stripe refunds for paid pre-trip cancellations
     with immutable prepayment reversal, Rider/Admin controls, and persistent Rider refund status.
   - Current delivery in progress: Rider payment/refund history with RLS-authorized, server-mediated
     access to Stripe-hosted receipts.
   - Current delivery: Driver date-range earnings statements with pending, collected,
     transferred, and separately reconciled bank-payout totals plus local CSV/print output.
   - Current delivery in progress: automatic Stripe payout-to-transfer reconciliation with verified
     connected-account balance activity, matched/unmatched totals, and Driver/Admin visibility.
   - Remaining: production verification, Rider wallet, reversals,
     payouts, statements, and reconciliation.
8. **Pricing and Billing**
   - Current delivery: tenant route-based trip rates, trusted pre-booking Rider quotes,
     15-minute fare locking, shared Rider/Driver/Admin display, pricing snapshots, audit, and
     completed-trip ledger posting.
   - Remaining: actual-distance adjustments, taxes/tolls/discounts,
     subscriptions, usage metering, and tenant billing.
9. **Optimization**
   - Demand intelligence, performance, levels, loyalty, and incentives.

## Release Gates for the Current Milestone

- Dry-run and apply only the intended ledger migration.
- Confirm all postings contain at least two entries and balanced minor-unit totals.
- Confirm transactions and entries cannot be updated or deleted.
- Confirm external-key replay is idempotent and mismatched replay is rejected.
- Confirm tenant administrators cannot read or post another tenant's ledger.
- Confirm ledger initialization and posting create tenant audit events.
- Confirm no card, bank, processor secret, or mutable stored balance enters the ledger schema.
