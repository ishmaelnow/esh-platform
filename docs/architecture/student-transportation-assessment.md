# Student Transportation: independent product assessment

Status: owner-approved direction; first disabled foundation slice implemented locally. No enabled service.
Assessment date: 2026-10-14. Repository baseline: main at 403212e.
Scope: repository inspection, not production database or provider verification.

## Accepted direction

2026-10-15 owner clarification supersedes guardian/self-service enrollment below: schools,
organizations and groups are customers, analogous to Riders but isolated from ordinary Rider
accounts. Internal business staff administer; parents only track their own child. Shared requests
can include multiple students and homes in one planned route. Current intake slice and remaining
route/driver/safety gates are in student-customer-requests.md.

Student Transportation is a separate ESH product alongside Transportation and Community.
It shares suitable platform infrastructure, not ordinary booking or dispatch lifecycles.
No Student Transportation option is added to the existing Rider booking selector in this plan.
That earlier proposal is superseded by the owner's independent-product direction.

Recommend the same monorepo initially, with separate deployable applications, namespaces,
permissions, release gates and domain tables. A shared Supabase project is a proposal, not a
requirement: it saves duplicated foundations but cannot isolate database outages or migration load.
Independent deployments reduce application coupling; they do not eliminate shared-resource risk.

## Verified integration points

| Existing evidence | Reuse and boundary |
| --- | --- |
| ADR 0002: separate product applications/shared platform | Already requires future products to have their own applications, roles, lifecycle and sessions. |
| Product workspace foundation and entitlement migrations | Catalog-backed product keys, tenant activation, explicit enrollment/roles and audited grants are reusable. No automatic Student access for Transportation users. |
| `packages/platform/supabase/src/workspace.types.ts` | Currently lists only Transportation and Community. Product types, governance selectors and RPC assumptions need an explicit compatibility audit before a new catalog entry. |
| Exclusive product sessions | Person-wide operational leasing exists. New product authorization must enforce its lease in database operations. Guardian/mobile session implications need explicit design; do not silently extend admin leasing to every customer screen. |
| Tenant foundation schema | Neutral person identity, tenant-bound membership and append-only audit are reusable. Guardian authority is a new relationship, not implied by membership. |
| `packages/platform/maps` | Real maps, address suggestions, coordinate validation and rendering are reusable. Multi-stop planning, capacity and deadline validation remain new domain logic. |
| `dispatch_bookings` and `dispatch_offers` | Ordinary booking is one pickup/destination with current driver/vehicle and timed offers. Later scheduling/preorder layers still operate on that booking. Do not represent a shared student route as one ordinary booking or dispatch each child independently. |
| Rider `page.tsx` booking-time selector | Existing Now/scheduled controls are inline around lines 1562–1581. Preserve this flow; Student requests live in their own app. |
| Existing vehicles/driver profiles and evidence | Useful identity/evidence references only. Ordinary approval does not establish student-service eligibility or approved seat/restraint capacity. |
| `packages/platform/stripe` and Transportation payments | Client/provider integration is reusable. Student payers, invoices, contract billing and webhook routing require distinct domain records. No copying ordinary fare/refund rules blindly. |
| Native push architecture/types | Delivery infrastructure exists but account registration and routing currently name Rider/Driver identities. Student recipients, topic identities and authorization require integration, not just a different notification label. |
| `packages/platform/events` / `workflows` | Typed event/context helpers exist; these are not a running multi-stop workflow scheduler or optimizer. |

The approved navy/white design and map patterns can guide new screens. Many booking components
remain application-local; reuse stable shared map components first rather than importing whole
Rider/Driver pages or extracting production components prematurely.

## Proposed product boundaries

- Product key: `student_transportation` (proposed).
- Separate guardian, operator and administration experiences; deployable app names/domains remain
  proposals until Phase 1. Start web-first, mobile-responsive; native identities/releases follow.
- Neutral auth identity and tenant infrastructure may be shared. Student records, route operations,
  storage policies, notifications and billing are explicitly product-scoped.
- Operators can reference an existing person's/vehicle's records only through tenant-safe adapters
  and explicit student eligibility. Initial pilot resources should be dedicated to this service.
  Sharing actual drivers/vehicles across products must remain disabled until a common reservation
  contract prevents overlapping student routes and ordinary dispatch. Product-session exclusivity
  alone does not prevent the same driver or vehicle being booked twice.

## Proposed data and invariants

Use product-owned tables for schools, student profiles, guardian grants, authorized contacts,
eligibility evidence, schedules/exceptions, requests, individual journey occurrences, routes,
ordered stops, manifests/assignments, events, handoff challenges, incidents and payer obligations.
These are conceptual groups, not final SQL table names.

All domain relationships carry tenant-bound foreign keys. A student is a protected domain record,
not a required login account. Guardian grants are explicit, revocable and auditable. RLS must
distinguish guardian self-service, school-limited authority, assigned operator access and admin.
Parents receive only their child's journey plus a restricted vehicle-progress projection. Raw
stop lists, route traces and ETA labels must not expose other children's homes or school records.

Route lifecycle and each student's lifecycle are separate. Boarding, absence, handoff and
exceptions are individual events. Transactional, idempotent transitions enforce stop order,
driver/vehicle eligibility, occupied seats on every route segment, authorized recipients and
no completion with unresolved/onboard students. GPS alone is never delivery proof.
Approved route versions are immutable during execution except audited recovery procedures.
Network retries cannot duplicate boarding/handoff; stale clients cannot invent successful delivery.

Verification codes/QR design must include expiration, attempt limits, replay prevention, authorized
recipient validation and an operational fallback. Offline behavior and emergency escalation need
operator-approved procedures; do not invent automatic child release on connectivity failure.
Private storage, generic push payloads, access-limited audit metadata and approved retention rules
are required. Deletion cannot silently remove evidence of an unresolved safety incident.

## Implementation sequence and gates

1. **Phase 1: product/security foundation.** Finalize actor roles, eligibility/handoff policies,
   dedicated-resource policy, retention/access projections and state machines. Add an independently
   gated product foundation, client types and isolated app shells. First migrations contain no
   automatic enrollment/activation and no changes to ordinary booking/dispatch. Test denied access,
   catalog/governance compatibility, tenant/guardian isolation and stale operational sessions.
2. **Enrollment/request slice.** Guardian manages multiple children, authorized contacts, school,
   coordinates and schedule exceptions; admin reviews enrollment/requests. No live student transport
   or automatic charging. Validate real coordinates and required authorizations.
3. **Routes/operator slice.** Admin plans and approves a bounded stop sequence using existing map
   capabilities. Validate deadlines, ride duration and capacity; assign eligible dedicated resources.
   Deliver individual boarding/handoff, no-show, cancellation and unresolved-student controls.
4. **Supervised pilot readiness.** Add least-privilege guardian tracking, private event notifications,
   incident escalation and recovery. Verify locked-phone/background location on actual devices;
   existing foreground tracking alone is insufficient. Require human operational and applicable
   jurisdiction/contract reviews before transporting students.
5. **Billing and expansion.** Start with one explicitly approved payer/pricing arrangement; add
   tested invoicing/payment reconciliation before collecting money. Broader subscriptions, district
   bulk administration and automated route optimization follow measured pilot needs.

Safety, tracking, incident handling and authorization are release gates, not optional final polish.
Test multiple independent families, siblings, schools, capacity races, cross-tenant and cross-family
attacks, revoked guardians, unauthorized handoff, duplicate/offline events, reassignment and unresolved
students. Ordinary Transportation/Community regression checks accompany shared-platform changes.

## Next decision

Owner approved implementation after this assessment. The first disabled product/security slice is
documented in student-transportation-foundation.md. The assessment itself made no runtime changes.
Owner has since confirmed both foundation/enrollment migrations applied; application deployment is pending.
Guardian authority/enrollment is now implemented locally; see student-guardian-enrollment.md;
do not treat the closed shell as a completed booking system or routing engine.
