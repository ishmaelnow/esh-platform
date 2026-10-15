# Student Transportation foundation

Status: implemented locally; owner confirms foundation and enrollment migrations applied.
Application not deployed or enabled. First Phase 1 slice, not a complete service.
Guardian enrollment now has a separately gated local implementation; see student-guardian-enrollment.md.
Descriptions below of closed shells apply when the enrollment flag is off. Route operations remain closed.
See [assessment and phased plan](student-transportation-assessment.md).

## Independent product boundary

`apps/student-transportation` is a separately buildable/deployable Next.js app on port 3006.
It has closed public entry shells at `/`, `/guardian`, `/operator` and `/admin`. These routes expose
no protected records when the enrollment flag is off. Guardian/admin enrollment capabilities
behind the new explicit flag and database admission gates are described separately. No booking API exists. Admin/operator labels do not
grant authority: they are static unavailable screens, not operational dashboards.
The new app imports no Rider/Driver/Admin pages and shares only existing framework versions.
The approved navy/white design is carried forward without refactoring existing production styles.
Later guarded role experiences may split into separate deployments without sharing domain state.

## Database foundation

Migration `20261014000100_student_transportation_foundation.sql` reserves the product catalog key
and four nonassignable role definitions. Existing tenants receive disabled workspace rows; the
existing catalog-based tenant-creation trigger seeds future tenants disabled. No entitlement,
person enrollment, role assignment, driver or vehicle assignment is created.

Insert/update guards reject Student workspace activation and granted entitlements, even through
existing privileged RPCs. Guards ignore other product keys. The service-only launch-controls table
has RLS enabled, no authenticated policies/privileges and a constraint prohibiting true activation.
There is deliberately no launch toggle in the UI or owner-facing configuration.

`has_student_transportation_operational_access` is a fail-closed future admin/operator gate:
it requires a launch-control row enabled, entitlement, workspace role and operational product lease.
It rejects guardian and unknown operational roles and empty/null role arrays. In this release the
launch constraint makes every call false. This is not a guardian authorization implementation.

New table/function types and product-specific role types are included in the shared Supabase
package. The existing operable `ProductWorkspaceKey` union and governance selectors remain limited
to the current two live products. This is intentional while Student grants are blocked, not a claim
that third-product governance UI is complete. Later release must integrate governance labels,
entitlement APIs, role choices, routing and session semantics with regression checks.
There are no sensitive student tables, student RPCs, operational events or notification contracts yet.
No permission or audit guarantee for those future features is implied by this foundation.

## Safety and resource contracts for next slices

- Guardian identity does not authorize a child without an explicit revocable relationship.
- School authority is school-scoped; guardians never receive other families' stops or traces.
- Each child's boarding and handoff is independent; unresolved/onboard children block completion.
- Driver/vehicle ordinary approval does not satisfy student eligibility. Pilot resources remain
  dedicated until cross-product reservations prevent overlapping assignments.
- Jurisdiction/contract-specific clearances, seating/restraints, retention periods, authorized-adult
  handoff exceptions and emergency procedures remain operational review gates. No legal compliance
  claim is made and no policy values are invented by the foundation.
- Add authenticated read models and audited, transactional mutations before enabling any forms.
- Validate native background tracking, offline recovery and private notification recipients before
  real student transport. Do not add a Student booking mode to the approved Rider app.

## Verification limits

Disposable PGlite tests exercise actual new SQL against minimal legacy dependencies, including
deliberately permissive auth helper stubs. This proves fail-closed activation/privileges, not full
existing RPC/session/tenant provisioning integration. Shared workspace parser tests cover unchanged
two-product compatibility. App lint, type checks, production build and rendered screen checks are
required. No remote migration state or production deployment has been queried or changed.
