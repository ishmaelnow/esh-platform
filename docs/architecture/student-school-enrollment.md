# School-managed Student enrollment

Status: local implementation; owner migration and hosted release pending.
Supersedes the role model in student-guardian-enrollment.md.

Organization owners configure the pilot and explicitly admit School administrators and Reviewers.
School administrators create, edit, submit and withdraw enrollments they created in that tenant.
Reviewers read tenant requests and review another submitter's request; self-review stays blocked.
Ownership alone grants no student record access. School-specific delegation/shared staff editing
requires a later explicit scope model; current staff grants are organization-scoped and creator-bound.

Parents are future restricted own-child tracking recipients, not enrollment administrators.
Parent-to-child access relationships and tracking are not yet implemented. A contact entry, tenant
membership or legacy enrollment creator ID must never authorize parent tracking.

Migration 20261015000200_school_managed_enrollment.sql adds can_manage_enrollments, default false.
It clears and audits legacy can_enroll grants without promoting guardians into school staff.
The guardian permission always denies and the access RPC rejects guardian grants. Reviewer grants
and existing records remain. Owners must explicitly grant school_admin, including to former
guardians. A former creator granted school staff can manage prior records; reviewers retain access.
The compatibility column guardian_person_id identifies the creator, not a verified parent-child
relationship. guardian_phone/relationship are proposed parent contact details entered by staff.

Existing RLS, transactional/idempotent mutations, bounded input, audit, verified identity, active
membership, revocation/pause, contacts and review lifecycle are retained. No client direct writes.
No changes to ordinary Transportation, Community, auth storage or operational activation guards.

/school contains staff enrollment; /admin contains governance/review and links admitted staff to
Manage student enrollment. Both sign-in entry points return to the already allowlisted exact
/admin URL. /guardian is a closed parent-tracking notice with no sign-in/enrollment form.
No new callback or Site URL change is needed. Existing /guardian allowlist can remain.

Parent tracking, routes, requests, payments, handoff and notifications remain unavailable.
No real minors' data until privacy, retention and authority procedures are approved.
See operations/student-school-enrollment-manual-test.md for release and verification.
