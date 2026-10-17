# Student geographic requests and lifecycle direction

Status: local implementation, not deployed. Owner authorized mapping and accommodation intake after
partner review. Owner supplied intended-only dry-run and successful application of migration
20261016000100; application deployment remains pending. Student transport execution stays locked;
customer intake and geographic preview are separately enabled pilot features.
Supersedes text-only descriptions for new requests in student-customer-requests.md; existing requests
remain explicitly unverified. Ordinary Transportation and Community runtime behavior is unchanged.

## Geographic trust and safe loading points

Customer address search uses authenticated, account-authorized Mapbox street-address autocomplete.
There is no hardcoded starting city, GPS permission requirement or implicit location collection.
Users select a complete street address and may add bounded gate/loading instructions per stop.
School-name-only POIs and arbitrary browser pins are not accepted as verified street addresses.

On preview the server rechecks verified identity and exact customer/tenant admission, resolves every
address through permanent geocoding, and requires exact/high address match and rooftop/parcel/point
accuracy near the selection. Postal/locality centroids, approximate and interpolated results fail.
The provider's default vehicle-access routable point is preferred, within 250m of the address;
the underlying address coordinate, accuracy and source remain separately recorded. A precise
address without a routable point stays clearly described as an unresolved loading location.
School gates cannot be certified by geocoding. No arbitrary coordinate or free-text gate instruction
is promoted to an approved access point. Campus gate designation/field verification and approved
versioned loading coordinates belong to staff route approval later. Rejecting an uncertain address
is intentional; staff must resolve it before eventual transport.

The additive Student map adapter requests real ordered multi-stop road geometry with curb approaches,
using Mapbox driving (supports the 20 pickups plus destination intake bound). It rejects provider
snapping over 100m from a stop. This is a passenger-car road preview, not bus/accessibility routing,
traffic forecasting, stop optimization, school-zone authorization or an approved manifest. Routing
follows the entered student order; no compatible vehicle or safe approach is inferred. The browser
displays attribution, markers, route length/time and recoverable failure states. Saved requests
recompute a current preview on demand from persisted stops; directions geometry is not stored in
request history. No tracking, dispatch, payment, native rebuild or transport activation is added.

Provider contract references: [Mapbox Geocoding](https://docs.mapbox.com/api/search/geocoding/),
[Mapbox Directions](https://docs.mapbox.com/api/navigation/directions/). Permanent-geocoding access
and actual result quality must be checked with the owner's configured provider account.

## Server proof and persistence

The independent Student server needs NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN and a server-only
SUPABASE_SERVICE_ROLE_KEY. The existing shared service-client factory is reused; this credential
is privileged across the shared database, not a Student-scoped database key. Never expose it to
the browser or reuse a NEXT_PUBLIC variable. Only the server writes private short-lived geography
receipts. Their actor comes from getUser, never a browser actor ID; payload includes canonical
addresses, server coordinates, schedule, per-student requirements and loading instructions.

Authenticated callers cannot read/write receipts directly. submit_geographic_student_request
checks exact actor, tenant/customer, active verified admission and expiry, and serializes actor/key
retries before creating a request transactionally. The server hashes normalized user intent so a
new permanent lookup for the same unchanged input can recover an uncertain submission. Changed
input with an already-used key fails. Browser retries retain the key; changed inputs require checking
saved requests first. Refresh/reload is not a durable retry queue. Receipt expiry blocks new use,
but a matching already-saved retry can recover the result.

Receipts expire for admission after 30 minutes. Expiry is not deletion. Preview creation deletes
expired receipts only for its current actor; inactive-account cleanup still needs the owner-run
procedure in the manual. No real child data until a retention/deletion policy and operational job
are approved. Request/history retention has no invented period or automatic erasure.

Legacy text RPC remains compatible and can only create unverified requests; browser-supplied
coordinates cannot grant verified status. Legacy requests are not re-geocoded/backfilled or hidden.
Both customer and staff queues label them as requiring geographic review; no approval queue or
automatic approval exists. A new geocoded request remains safetyStatus=unreviewed.

## Operational constraints and immutable history

Per-student allowlisted tags are wheelchair_lift, booster_seat, car_seat and attendant. They are
operational requests, not diagnoses, verified IEP status, equipment approval or legal determinations.
No diagnosis/medical notes/IEP document upload is added. Empty tags mean no requirements recorded,
not verified absence of needs. Tags remain private within existing customer/staff/reviewer scope;
no new role, parent access, notification payload, public data or browser persistence is introduced.

student_request_history contains private append-only full snapshots with actor and database time
for submission and withdrawal. Generic platform audit retains IDs/counts/status, never names,
addresses, instructions or tags. History has the same tenant/customer/staff read boundary as requests;
authenticated users and service_role receive SELECT only, and mutation/truncate triggers also reject
rewrites. Existing records receive an explicit migration baseline with null historical actor and
capture time; this does not reconstruct earlier events. Current requests cannot be edited/deleted;
corrections require withdrawal and a new submission. Future editing/approval must introduce reasoned,
versioned events and new snapshots before exposing such controls. Database-owner powers and backups
are administrative trust boundaries; this is not external tamper-evident/WORM archival storage.

## Partner-approved horizon (future implementation)

1. Canonical students and school authority, explicit parent-child relationships and reviewed
   requirements. Staff approve versioned loading points/stop order only after capacity, access,
   equipment and Driver/vehicle eligibility checks. Planning must group by compatibility as well
   as geography; distance alone is insufficient. Do not silently optimize or assign during intake.
2. Approved recurring institutional schedule templates: tenant/school time zone, school calendar,
   term dates, weekday morning/afternoon windows, holidays, exceptions and versioned approval.
   Generate bounded, duplicate-safe dated manifests from template versions. Retain each day's
   snapshot and later changes; never rewrite executed history when a template changes. One-time
   intake remains proposed service intent until this separate approval model exists.
3. Manifest assignment: validate effective-date Driver credentials, student-specific eligibility,
   vehicle equipment, per-segment seats/restraints and attendant staffing. Recheck at assignment
   and execution; expiring/missing required evidence blocks affected service and alerts staff.
   Jurisdiction/contract-specific clearances (including district-requested PA/FBI evidence) require
   approved policy, not assumptions that ordinary Driver approval meets student requirements.
   Shared Drivers/vehicles require cross-product reservations before either product can overlap.
4. Daily execution: individual arrival/boarding/no-show/authorized handoff, unresolved-child
   completion block, incidents/recovery and actual-device offline behavior. Secure tag scanning
   is an option requiring its own authorization/replay design, not built in this milestone.
5. Parent projection: explicit revocable child relationships, schedule-window-limited location
   and confirmations, no other family's stops/names/addresses or full manifest. Device background
   location and notification delivery require actual-device acceptance. Billing follows a separately
   approved institutional contract and the audited recurring lifecycle, not ordinary on-demand dispatch.

No approval, recurring template, compatibility filter, manifest, credential rule or parent tracking
is implemented or activated by the mapping migration. These are dependencies for subsequent slices.

## Local verification checkpoint

48 Student/map unit/API checks, 32 existing booking/checkout/Driver/workspace regressions, both
Student SQL harnesses, shared map/Supabase types and Student lint/production builds pass. Enabled
customer and enrollment browser fixtures pass, including visible ordered geometry, attribution,
provider/map failure and retry, middle-row preservation, tags, preview invalidation, same-key retry,
reload/withdrawal and revoked-access clearing at compact/mobile/desktop sizes. Full 414px screenshots
were inspected under ignored tmp/student-customer-evidence. Default-off production output was
restored; all 21 closed-shell screen/viewport checks pass. Actual provider geography, school loading
access, production RLS/concurrency and hosted configuration remain owner acceptance. No migration,
Git mutation, deployment, production data or live provider/email call was performed by Codex.
