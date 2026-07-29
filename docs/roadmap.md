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

Explicitly deferred:

- OCR and automatic classification.
- External identity or background-check providers.
- Scheduled expiration reminders.
- Full vehicle records and vehicle-specific compliance.
- Dispatch eligibility and location.

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
   - Vehicle evidence and compliance requirements.
3. **Notification Foundation**
   - Generalize invitation delivery into reusable notification contracts.
   - Current delivery: durable driver notification contracts, templates, retries, history, and
     webhook-tracked delivery.
   - Current delivery: driver expiration-reminder preferences and scheduled compliance reminders.
   - Remaining: additional delivery channels and tenant-configurable reminder schedules.
4. **Realtime and Service Areas**
   - Privacy and consent contracts.
   - Driver availability, service areas, and location exposure policy.
5. **Dispatch and Trip Core**
   - Booking/trip lifecycle, offers, assignments, reassignment, and operational audit.
6. **Reputation**
   - Product-specific criteria on generic reputation primitives.
7. **Money and Ledger**
   - Currency types, immutable ledger, payments, wallet, and reconciliation.
8. **Pricing and Billing**
   - Pricing, subscriptions, usage metering, and tenant billing.
9. **Optimization**
   - Demand intelligence, performance, levels, loyalty, and incentives.

## Release Gates for the Current Milestone

- Apply the evidence migration locally, then staging, then production.
- Regenerate Supabase types from the applied schema and confirm no manual drift.
- Run tenant RLS and Admin integration tests against the migrated database.
- Confirm new applications create evidence metadata and private storage objects.
- Confirm tenant administrators can review only their own tenant's evidence.
- Confirm rejected, missing, or expired required evidence prevents activation.
- Confirm approved onboarding and required evidence permit activation.
- Confirm evidence review creates an audit event.
- Confirm production signed URLs expire and direct bucket access is denied.
