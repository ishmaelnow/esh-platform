# Student internal review and recurring planning

Status: locally implemented and verified; migration owner-applied, b75afc6 owner-pushed and Student
Vercel Ready confirmed. Internal manual acceptance pending.
Owner GO on 2026-10-17 after accepting geographic
intake and partner constraints. Owner confirmed intended-only dry-run and successful application of
20261017000100_student_recurring_planning.sql on 2026-10-17. Do not reapply.
No operational activation, ordinary dispatch/resource mutation, native, payment or parent access.

2026-10-19 local repair: opening a review scrolls/focuses its heading; missing required fields and
malformed policy credential keys display an explanation beside Save rather than a silent native
validation block or hidden generic error. Literal formatting characters are rejected, never silently
rewritten into a different credential. Server failures show safe guidance/SQL codes without raw
database details. Confirmed SQL rejections permit corrected inputs with a fresh mutation key;
uncertain network failures retain unchanged-key retry. No migration or authorization change.
Owner live policy save remains unconfirmed; malformed-key rejection is locally reproduced, not
proof of the exact live failure. Review history remains authoritative for whether a save occurred.
Nine planning unit checks, actual SQL rejection/persistence checks and expanded enabled planning
browser flow pass for the repair, including corrected validation and unchanged uncertain retry.
Existing geographic customer/address-search browser regressions and enabled build/lint/types pass.

## Internal review boundary

Existing explicit Student reviewers may write planning records; admitted internal enrollment staff
may inspect them. Customers, parents, unrelated tenants and organization owners without reviewer/
staff admission cannot read this planning data. Verified active identity/membership, active tenant
and enabled pilot remain required. No new role assignment or operational product lease is created.
The /clients internal view opens a separate planning workspace on explicit action. Customer intake
and its approved labels remain unchanged. All state remains in memory except authorized DB records;
identity/tenant changes unmount and clear the workspace, and failed/revoked refresh clears its data.

The foundation/enrollment records remain intact. New canonical planning student identities are
customer-school-scoped administrative identities, not globally deduplicated children, Auth users,
verified legal guardians or parent tracking grants. A reviewer records a stable school reference,
name, school authority evidence reference, effective dates, seating and reviewed requirements.
Each request entry must be explicitly matched to a canonical identity; names are never silently
matched. Intake requirements cannot be silently dropped. Empty requirements require explicit review;
no diagnoses/IEP files or medical notes are collected. Correct an erroneous intake via withdrawal/
new submission. Occupied wheelchair and passenger-seat/restraint use must be resolved explicitly.

## Versioned loading points and resources

Planning entities have immutable identity/reference/customer/kind and append-only numbered versions.
Each version records state, actor, DB time, reason and a normalized private snapshot. Direct writes
are denied, including service_role, except private geography proof storage. RLS limits reads to
internal tenant staff. Triggers reject updates/deletes/truncation of review history and manifests;
the database owner remains an administrative trust boundary, not external WORM/tamper-evident storage.
Generic tenant audit contains IDs, kind, revision and counts, never child data, evidence text or stops.

Loading points bind to a verified source-request stop. Reviewers record exact coordinates, label,
curb/driveway-loop/designated-zone type, instructions, site/district review reference and effective
dates. A coordinate change produces a new review version. A move beyond a 0.005-degree envelope on
either axis requires a newly verified address request. This is a product guard, not a district rule.
The initial geocoded point is never an automatic site approval. A human reviewer attests to applicable
site requirements; software does not certify physical safety.

Dedicated planning resources are distinct vehicle, Driver and attendant records with stable unique
business references, reviewed evidence references and effective dates. Vehicle counts describe one
specific reviewed configuration: passenger seats excluding the Driver/wheelchair positions,
wheelchair positions, booster/car seats, lift and reviewed securement. Reviewers must not double-count
convertible spaces. Human resources carry reviewed credential keys, evidence references and valid
dates. These are manual evidence-review records, not automatic document/provider verification or
existing Driver account grants. A resource's role cannot be changed into another role.

The reviewed policy is bound to its customer school, preventing another school's policy being
selected or applied to this request. Dedicated physical resources remain business-scoped.
The policy names actual district/contract credential keys, including equipment-specific
Driver/attendant requirements for lift, booster and car-seat routes. No jurisdictional clearance names,
ratios or legal conclusions are built in. Policy and resource evidence must cover the whole template
term. If they expire midway, renew/review and create a new schedule version or split the term; do not
approve a future known eligibility gap. One distinct qualified attendant is reserved per student
requesting a dedicated attendant. Sharing an attendant between children requires a separate policy
model and is not silently inferred.

## Recurring templates and hard locks

Each versioned template binds one geographic customer request to every canonical student and every
reviewed loading-point version, an explicit stop order, direction, school IANA time zone, term dates,
ISO weekdays, same-day first-pickup/final-drop-off window, resource buffer and reasoned calendar
closures. Morning/inbound and afternoon/outbound use separate templates. Inbound visits homes before
the shared destination; outbound starts at that destination then visits the selected home order.
No automatic geographic clustering, multi-school consolidation or stop optimization is introduced.
The reviewer explicitly confirms the school calendar; no holidays are guessed or imported.

Drafts can omit resource selection. Planning approval requires a fresh actor-bound server proof of
actual road geometry for that exact draft and reviewed-point sequence. A changed/revoked referenced
review invalidates approval/generation until revised. Road time must fit the window; reviewer must
also allow boarding/loading time. The existing car driving preview is not bus/accessibility routing,
future traffic prediction or district road permission. Existing Student server-only secret and public
Mapbox config are reused; no new credential/callback is needed.

The server checks resource roles, full-term validity, base and equipment-specific Driver/attendant
credentials, lift, securement and actual configured seats/restraints. Segment snapshots show students
on board increasing inbound/decreasing outbound. Wheelchair positions are separate from passenger
seats; attendants consume seats and reserve the entire window. Insufficient capacity/equipment or
missing/expiring qualifications blocks planning approval and generation. UI filters incompatible
choices but SQL is authoritative. Self-approval of one's own customer request remains prohibited.

Planning approval is **not transport release**. Every approved template and dated manifest explicitly
remains operationallyReady=false; manifest states are only planned/cancelled, with no execution API.
Dedicated-resource declarations are reviewer attestations. Their references do not prove exclusivity
against ordinary products, another tenant, another business system or aliases of the same person.
Resources shared with ordinary Transportation must not be registered for this slice. Cross-product/
cross-tenant physical-resource identity, conflict prevention, active Driver/vehicle integration and
execution eligibility are required before service. No ordinary Driver/vehicle is automatically reused.

## Daily manifests, reservations and history

An explicit action generates at most 14 calendar dates per transaction, bounded to template term,
weekdays and closure exceptions. No automatic background materializer or notification producer is
installed. Repeat generation is duplicate-safe; existing identical outputs remain unchanged.
Per-actor keys recover unchanged retries and reject changed payload reuse. Revision expectations
reject stale saves. Tenant advisory locks serialize revisions/reservations, with program/access
rechecks; real concurrent deployed-session certification is still separate from minimal SQL tests.

Each dated revision contains its template version, approved student/loading-point/policy/resource
snapshots, segment requirements, reserved absolute window, actor/time/reason and explicit planning
state. Reviewed reference links have tenant-bound foreign keys. Driver, vehicle and attendant windows
cannot overlap other active Student planning reservations in the tenant. Canonical students cannot
overlap manifests either. Buffers are explicitly chosen; deadhead travel is not automatically inferred.
Ambiguous/nonexistent local DST windows and past generation are rejected rather than guessed.

New template approvals do not rewrite previous daily snapshots. Explicit generation revises dates
under the new version and releases/replaces their reservations transactionally. Calendar changes
cancel previously planned excluded dates when that range is regenerated; older revisions remain.
Daily cancellation appends a revision and releases reservations. Generic generation of the same
template cannot resurrect a cancelled day; restoration requires a new reviewed template version.
Customer source withdrawal cancels its schedules and future/current-date planning manifests and
releases future reservations; historical records remain. No refund, dispatch or notification occurs.

Internal history includes latest review records (200), recent manifest revisions (100), review
revision history (100 per entity) and date-specific manifest history (100 revisions). These bounds
are disclosed. Pagination/export and external district audit archival are later work before scale.
Immutable snapshots describe planned/approved data; actual boarding/handoff events do not exist yet.
Do not present planning snapshots as proof that transportation happened.

## Remaining gates

Actual Driver execution, qualified-person account binding, per-child boarding/no-show/handoff,
unresolved-child completion block, incidents, actual-device offline/background location and parent
projection/notifications remain later work. No operational activation until these and resource-sharing
guards are ready. Privacy/authority, retention/deletion and incident-preservation procedures remain
prerequisites for real child data. Expired geography proof cleanup retains the earlier opportunistic
actor cleanup plus an owner retention-maintenance requirement; expiry alone is not deletion.

## Local verification checkpoint

94 Student/map and existing booking/checkout/Driver/workspace unit/API checks pass. Both actual
Student SQL harnesses pass, including source/geography regressions, tenant/customer/role denial,
explicit identity/authority/requirements, school-policy binding, effective dates, missing/expiring
and equipment-specific credentials, capacity/attendant seats, three-student inbound/outbound
segments, stale point versions, duplicate-safe revisions, source withdrawal, manifest immutability,
reservations/conflicts, calendar changes and DST gap/fold/actual-window duration rejection.
These use minimal legacy fixtures, not full deployed schema or true concurrent sessions.

Enabled local planning, customer and enrollment browser checks pass: reviewer forms, unchanged-key
retry, compatibility controls, provider recovery, approval failure preservation, manifest/cancellation
history, revoked clearing and 320/414/desktop layout. Full mobile screenshots and visible action
footer inspected under ignored tmp/student-planning-evidence. Student enabled build/lint/types and
shared maps/Supabase checks pass with existing build warnings. Default-off production output was
restored; all 21 closed-shell screen/viewport checks and scoped diff checks pass.
No live provider/child/resource mutation, Git mutation, deployment
or production DB command performed by Codex. Owner manual acceptance remains the next release gate.
