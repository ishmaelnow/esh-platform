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

Status: **implemented in the repository; migration and production rollout pending**.

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

1. **Fleet and Vehicle Management**
   - Tenant-scoped vehicle identity and lifecycle.
   - Driver/vehicle assignment history.
   - Vehicle evidence and compliance requirements.
2. **Notification Foundation**
   - Generalize invitation delivery into reusable notification contracts.
   - Add delivery preferences, templates, retries, and scheduled compliance reminders.
3. **Realtime and Service Areas**
   - Privacy and consent contracts.
   - Driver availability, service areas, and location exposure policy.
4. **Dispatch and Trip Core**
   - Booking/trip lifecycle, offers, assignments, reassignment, and operational audit.
5. **Reputation**
   - Product-specific criteria on generic reputation primitives.
6. **Money and Ledger**
   - Currency types, immutable ledger, payments, wallet, and reconciliation.
7. **Pricing and Billing**
   - Pricing, subscriptions, usage metering, and tenant billing.
8. **Optimization**
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
