# Student guardian enrollment pilot

Status: implemented locally; owner confirms both Student migrations applied after matching dry run.
Base application deployed at school.eshapp.com at 843cbab. Owner confirms governance migration
20261015000100 applied; paired UI/documentation commit is pending. Rides remain disabled.
Complements the [independent foundation](student-transportation-foundation.md).

## Separate enrollment authorization

The product/route activation guards remain intact. A pre-launch enrollment program is a separate,
default-off gate, not a Transportation entitlement or product-session bypass for route operations.
Enrollment accepts only verified Supabase identities with active person/tenant membership, an
active tenant, an enabled enrollment program and explicit guardian/reviewer admission.

Verified organization owners, or platform data administrators with active membership in the selected tenant, may enable/pause the
enrollment pilot and grant/revoke enrollment roles to existing active tenant members. These are
governance actions. Platform or tenant ownership alone grants no student record access. An organization or platform
administrator must deliberately admit themselves as reviewer before viewing enrollment records.
Fixed reason codes are audited; no free-text child names, contact details or review notes enter
the shared audit. Generic access grants are independent of the nonassignable operational roles.
Guardian self-service deliberately does not acquire the person-wide operational product lease.

Migration `20261015000100_student_enrollment_owner_governance.sql` corrects the original
platform-admin-only setup restriction. The new `can_manage_student_enrollment` helper uses the
existing foundation owner-role helper, verified identity, active membership and exact tenant scope.
The context read model exposes owner controls before enrollment activation or reviewer admission.
Expired/suspended ownership, ordinary tenant_admin membership and other-tenant membership cannot
configure the organization. No platform promotion, repeated ownership creation or manual setup
SQL is needed. Owners still explicitly admit reviewers, including themselves, to view children.
Operational product sessions and ride activation rules are unchanged.

This slice is invitation-only: it reuses existing ESH identities and memberships. It does not create
new accounts, memberships, co-guardian links or school staff authority. Those require separate,
audited onboarding flows. An admission is not proof of legal guardianship; submission includes an
authority attestation and requires review. Student transport eligibility/handoff remains unbuilt.

## Records and lifecycle

Migration `20261014000200_student_guardian_enrollment.sql` adds product-owned enrollment programs,
explicit access, students, proposed contacts and private mutation receipts. No date of birth,
government ID, medical record, photo, location history or payment information is collected.
School name is a proposed text label, not an approved school affiliation or route destination.

One guardian can manage multiple children. Each child has one creating guardian in this slice;
other guardians require a future explicit relationship/revocation workflow. Composite tenant-bound
foreign keys connect child/access, contacts/child and mutation/child records. RLS gives guardians
only their own admitted children and contacts; explicitly admitted reviewers see their tenant's
records. Operators, school staff, ordinary tenant admins and anonymous users receive no child access.
Client writes to domain tables are unavailable. All changes use bounded security-definer RPCs.

Enrollment moves through draft → submitted → approved/rejected, with withdrawal and corrected
resubmission. Submitted/approved records must be withdrawn before editing. A rejected record may
be corrected and resubmitted. Reviewers cannot review their own children's enrollment. Review notes
are private domain data visible to the owning guardian and admitted reviewers. Approval only means
enrollment review; it never books transportation or verifies an adult for physical handoff.
Contacts are explicitly proposed pickup/drop-off contacts, not operational authorization credentials.

RPC mutations lock access/program/student rows as applicable, recheck admission, and write records,
contacts, idempotency receipts and generic audit events transactionally. Retry IDs are scoped to
actor+tenant; mismatched reuse fails. Browser retries retain an unchanged request ID after failure,
and different mutations require refresh while a save is unresolved. This is not a durable offline
queue; after a full browser restart, inspect saved enrollments before creating another record.
Malformed contacts cause rollback rather than leaving a partial child/contact update.

## Application boundary

Guardian and enrollment-admin experiences live in the independent app, not Rider/Driver/Admin.
The frontend is default-off via `NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED`; enabling it is not
authorization. All database gates must pass. Missing config produces a closed/unavailable state.
The isolated auth storage key is `esh-student-transportation-auth`. Verified email links return to
the current app's exact `/guardian` or `/admin` origin. Existing auth redirects/domains are untouched.
Local sign-out targets this application session; shared-provider/global behavior must be verified
before production. This slice adds no native app links or account-session policy changes.

Forms use blank values, bounded fields, explicit submission and proposed contacts. Saved drafts
persist in the database; unsaved input stays in memory only. Changing identity/tenant clears private
UI state, and request-generation checks discard stale loads. Review lists show the latest 100
records and disclose that limit; pagination is future work before larger enrollment programs.
No child information enters localStorage, notifications, URLs, console logs or public fixtures.

## Remaining gates

No real child enrollment should be collected until approved privacy notices, guardian authority
review, retention/deletion procedures and incident preservation requirements are established.
No automated retention/deletion, contact verification, multi-guardian grants, bulk school enrollment,
routes, geographic pickup/drop-off requests, payments or student notifications exist yet.
Status changes are visible on refresh; no enrollment notification or invitation email is sent.
Paused/revoked access hides records but does not delete them or erase audit evidence.

Database tests execute both actual Student migrations and existing identity/membership helpers in
PGlite with a minimal legacy schema. Browser tests use clearly labeled disposable fixtures and
intercepted APIs; they verify UI flows, not real email delivery or a deployed Supabase integration.
Provider login/redirect allowlists, remote migrations and production behavior remain owner gates.
