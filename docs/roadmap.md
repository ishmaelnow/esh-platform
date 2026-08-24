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

## Next Product Domain: Community Platform

Status: **Community Migrations 1–6 deployed; platform entitlement separation implemented locally**.

Community is the second product domain built on ESH Platform. It will be a tenant-enabled module
that reuses platform identity, tenant membership, capabilities, RLS, audit, maps, storage, and
notification delivery without depending on Rider or Driver business identities.

Approved direction:

- operationally independent product applications on shared ESH infrastructure, with
  `admin.eshapp.com` reserved for neutral tenant/product governance;
- a separate Community member application and separately deployed Community Admin application;
- one active operational product session per person, enforced server-side rather than by display;
- a shared content envelope with typed post, announcement, event, alert, help, opportunity,
  resource, and later poll records;
- a dedicated provider/service directory, with promotional feed items linked to listings;
- normal member publishing separated from official publication and mass broadcast authority;
- tenant, Community-area, and group targeting in V1;
- explicit moderation, reporting, verification, announcement submission, and append-only audit;
- chronological/relevance ordering rather than engagement-maximizing ranking; and
- in-app notifications first, with external Community broadcast channels deferred until their
  delivery and operational controls are production-verified.

Implementation order:

1. Community capability/permission catalogs and conservative settings are deployed and passed the
   production authorization-foundation test.
2. Community places, groups, organizations, providers, and private trust evidence are deployed and
   passed the production dark-rollout SQL and UI regression test.
3. Product Workspace separation is implemented locally in
   `20260823000300_product_workspace_foundation.sql`: shared identity, separate product enrollment,
   separate operational roles, no Rider/Driver coupling, and a one-time Transportation admin
   compatibility backfill. Production validation passed with all 17 Transportation workspaces
   enabled, all 17 Community workspaces disabled, four Transportation admin assignments, and zero
   Community enrollments.
4. The transitional Admin workspace selector, isolated routes, direct-route role gates, and
   owner-controlled enrollment are deployed in commit `22fcafe`; Migration 4 is applied. It proved
   the access boundary but is not the final combined operating experience.
5. ADR 0002 establishes governance-only Admin plus independently deployed product applications.
   Exclusive server-authoritative product sessions and stale-tab denial are deployed in Migration
   `20260823000500_exclusive_product_sessions.sql`. Product-entry stabilization is implemented
   locally: only enabled and assigned products appear operationally, tenant governance is isolated
   at `/governance`, and inactive direct links return to explicit product entry instead of leaving
   a dead end. Production deployment and the revised two-tab validation remain.
6. Independent `apps/community` member application is implemented locally with isolated auth,
   explicit product-session entry, chronological feed, and ordinary member posting. Community
   Admin and Transportation Admin extraction remain.
7. Core content, typed records, targets, actions, lifecycle, and search indexes are implemented
   and deployed in `20260823000600_community_core_content.sql`; the independent Community app is
   deployed at `community.eshapp.com` with strict product-specific admission.
8. Platform-controlled tenant product entitlement is implemented locally in
   `20260824000100_platform_product_entitlements.sql`. Existing enabled products are grandfathered;
   new tenants receive no product automatically; Tenant Governance sees only Platform-granted
   products. Production rollout precedes the Community-only pilot tenant.
9. Comments, reactions, private media, blocks, mutes, and reports.
10. Service directory and provider-owned listings.
11. Moderation and submit-for-announcement workflow.
12. Person-based in-app notifications and compatible delivery generalization.
13. Lifecycle automation, read models, discovery UI, and production pilot gates.

Architecture: `docs/architecture/community-platform.md`.
Migration plan: `docs/architecture/community-platform-migration-plan.md`.
Product boundary decision: `docs/adr/0002-separate-product-applications-shared-platform.md`.

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
   - Current delivery in progress: tenant-selectable guaranteed, metered, or protected-flexible fare
     contracts; immutable Rider disclosure; trusted actual-route reconciliation; capped increases;
     and a separate 250-foot arrival/completion proximity contract.
   - Current delivery in progress: Stripe-hosted Rider checkout, verified payment state, paid-only
     booking finalization, and immutable collection settlement.
   - Current delivery in progress: tenant-local recurring Rider schedules with verified routes,
     individually priced/paid occurrences, one-occurrence and remaining-unpaid-series cancellation,
     Admin visibility, tenant isolation, and duplicate-safe scheduled booking creation.
   - Current delivery in progress: explicit recurring-trip autopay authorization, saved Stripe
     payment-method references, fresh per-occurrence pricing, wallet-first off-session collection,
     bounded retry/manual recovery, Rider alerts, and Admin failure visibility.
   - Current delivery in progress: explicit per-browser Rider and Driver Web Push subscriptions,
     privacy-safe urgent alerts, independent delivery attempts, and expired-endpoint cleanup.
   - Current delivery in progress: verified, explicitly consented Rider and Driver transactional
     SMS for urgent events with privacy-safe copy and independent delivery attempts.
   - Operational blocker: SMS code is deployed, but production verification is waiting for Twilio
     to explain and reactivate a suspended account under billing ticket `#29018616`.
   - Current stabilization: installed Rider and Driver shells now distinguish unavailable native
     push from browser Web Push, and SMS verification provides validated mobile inputs, one-time-code
     autofill, an explicit pending state, and inline provider errors.
   - Remaining: native mobile push delivery and carrier delivery-status/STOP reconciliation.
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
   - Current delivery in progress: immutable, reasoned, audited reversals for manual journals while
     preventing ledger-only reversal of system-generated financial lifecycle records.
   - Current delivery in progress: coordinated full refunds for paid completed trips, including
     recoverable Stripe transfer reversal, immutable Driver-earning recovery, and Rider/Admin/Driver
     history that does not rewrite the original trip or journals.
   - Current delivery in progress: signature-verified Stripe dispute lifecycle, idempotent principal
     withdrawal/reinstatement accounting, Rider visibility, and Admin recovery warnings without
     silently clawing back Driver funds.
   - Current delivery in progress: tenant-scoped Rider trip credits, immutable wallet history,
     Admin issuance, automatic split wallet/card checkout, cancellation restoration, and ledger
     settlement without overstating Stripe-funded Driver earnings.
   - Remaining: production verification, reversals,
     payouts, statements, and reconciliation.
8. **Pricing and Billing**
   - Current delivery: tenant route-based trip rates, trusted pre-booking Rider quotes,
     15-minute fare locking, shared Rider/Driver/Admin display, pricing snapshots, audit, and
     completed-trip ledger posting.
   - Current delivery: catalog-backed toll pricing with DRPA as the initial westbound passenger
     route authority, effective-dated rates, aliases, source snapshots, and locked quote display.
   - Remaining: actual-distance adjustments, additional catalog entries and vehicle/payment rules,
     taxes/discounts,
     subscriptions, usage metering, and tenant billing.
9. **Optimization**
   - Demand intelligence, performance, levels, loyalty, and incentives.

## Mobile delivery

- Current delivery in progress: Capacitor Rider and Driver shells load the existing deployed apps
  with separate native identities and secure defaults.
- Current delivery: Rider and Driver Android verified HTTPS App Links return authentication email
  links to the installed `com.esh.rider` and `com.esh.driver` apps, with retained custom-scheme
  fallbacks and Digital Asset Links verification.
- Remaining: native platform projects, store signing, APNs/FCM push integration, and reviewed
  background location behavior.

## Release Gates for the Current Milestone

- Dry-run and apply only the intended ledger migration.
- Confirm all postings contain at least two entries and balanced minor-unit totals.
- Confirm transactions and entries cannot be updated or deleted.
- Confirm external-key replay is idempotent and mismatched replay is rejected.
- Confirm tenant administrators cannot read or post another tenant's ledger.
- Confirm ledger initialization and posting create tenant audit events.
- Confirm no card, bank, processor secret, or mutable stored balance enters the ledger schema.
