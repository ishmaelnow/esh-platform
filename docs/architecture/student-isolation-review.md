# Student isolation review and next milestones

Review date: 2026-10-16. Compared 403212e (before Student) with e2fb5e1.
Repository/local-test evidence, not a live production database audit.

## Existing products

No committed source changes under Rider, Driver, Admin, Transportation, Community or Community
Admin in this range. No ordinary booking/dispatch/payment table or function is replaced by the
six Student migrations. Student requests have no call into ordinary dispatch, offers, checkout,
Stripe or payouts. Existing map package source is unchanged.

Shared Supabase index changes add Student exports; database types add Student tables/RPCs.
Existing browser/auth factory implementation is unchanged. The lockfile adds the Student app
with existing framework versions; existing dependency resolutions remain unchanged. Turbo adds
only a Student-specific build task. No existing app signing, domain or provider-template change.

The database is not completely isolated: foundation adds catalog/role rows, disabled Student
workspace rows to existing tenants, and triggers on shared workspace/entitlement tables. The
triggers reject activation only when workspace_key is student_transportation; ordinary product
keys return unchanged. Invitation acceptance creates/reuses a neutral person identity, including
activating an invited matching identity; it never reactivates suspended/deactivated identities or
inserts tenant/staff roles. Shared identity and database availability remain shared-resource risks.

Launch controls enforce operations_enabled=false with a constraint; operational roles are
nonassignable and Student workspace/entitlement activation is rejected. Enrollment/request pilot
enablement is separate and does not enable transport. These guards must remain for map work.

## Verification

47 existing unit/API checks pass: Rider booking/checkout, Driver dispatch/navigation, workspace
types and map/address/service-area logic. Both actual Student SQL harnesses pass: original-product
activation compatibility, disabled operations, tenant/customer isolation, invitation identity
bootstrap, no extra roles and request lifecycle. SQL uses minimal legacy fixtures, not the full
production schema or true concurrent sessions. No production bookings, payments, emails or role
changes were performed. No new runtime code/migration was made by this review.

This supports proceeding incrementally; it does not prove every deployed/native flow is unchanged.
Uncommitted Rider/Driver configs, preorder docs and local-assistant files are prior work, preserved.

## Next milestone: geographic requests and map preview

Reuse @esh-platform/maps coordinate validation, address suggestion/retrieval and permanent
server geocoding. Reuse the existing real map provider, attribution, map styling and interaction
patterns. Implement Student-specific address/preview UI in the Student app; do not import entire
Rider/Driver pages or alter their existing components for this feature.

Existing RiderHomeMap/LiveTripMap and routeTripMetrics support ordinary pickup/destination pairs,
not consolidated manifests or optimization. A new additive multi-stop renderer/directions adapter
is needed; repeated straight lines or one two-point result must not be labelled a road-route plan.
Keep stop order explicit and editable in the future planner, not silently optimized in intake.

Acceptance for this milestone:

- Customer selects real address suggestions for destination and each pickup.
- Server authorizes the exact customer/tenant, resolves/validates geography and persists it with
  the request. Browser coordinates alone are not authoritative. Preserve old text-only requests
  as unverified; never invent coordinates or silently reinterpret historical addresses.
- Real interactive map shows selected stops and actual road geometry for the proposed sequence.
  Start from actual selected stops/authorized context, never a hardcoded city or simulated GPS.
- Stale searches/routes are cancelled/discarded; missing token, denied location, no result and
  provider/network failure produce recoverable states. Attribution stays visible.
- Three pickups plus shared destination work at 414x896/320px/desktop. Customer/tenant isolation,
  invitation, retry, withdrawal and ordinary-product regressions remain passing.
- This is a proposed geographic request, not a confirmed ride, price, school eligibility check,
  capacity approval or driver assignment. No dispatch/payment/native integration in this slice.

## Subsequent milestones

1. Internal approved route plans: canonical student identity/authority, pickup/arrival windows,
   direction/recurrence and exceptions, approved stop versions, per-segment capacity and eligibility.
2. Driver execution: eligible resources, assignments, individual arrival/boarding/no-show/handoff,
   unresolved-child completion guard, audited incidents/recovery and actual-device offline testing.
3. Parent projection/tracking and notifications: explicit child relationships, no other-family
   stops/addresses, appropriate actual-device background location and delivery verification.
4. Pilot readiness/billing: operational privacy/retention/handoff procedures and applicable review;
   approved pricing/payment contract. Cross-product resource reservation before sharing ordinary
   Drivers/vehicles. Do not wire school requests into ordinary dispatch as a shortcut.

Each milestone gets local checks, owner-reviewed migration dry run if needed, scoped release and
manual acceptance before the next. Existing production applications remain outside feature scope.
