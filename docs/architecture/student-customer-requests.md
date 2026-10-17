# Student Transportation customers and shared requests

Local follow-up: geographic request preview, per-student operational requirements and immutable
request snapshots are locally verified pending owner rollout of 20261016000100. See
[geographic requests and recurring lifecycle direction](student-geographic-requests.md). Text-only
descriptions below remain accurate for deployed/legacy records until that release. No operational
approval, compatibility matching, recurring schedule or dispatch is enabled by mapping.

Status: owner applied 20261015000300, pushed 6f99ee9 and confirmed Student deployment Ready.
Owner applied 20261015000400, pushed e2fb5e1 and confirmed Student deployment Ready.
Owner verified school customer access and submitted a two-student request. Geography remains text-only.
Student operations remain closed. See student-isolation-review.md for the 2026-10-16 boundary audit
and the next geographic-request milestone.
This supersedes earlier descriptions of client schools as enrollment administrators.

## Business boundary

ESH provides the platform. ESH Education is an example operating-business tenant. Schools,
organizations and groups are its customers, analogous to Riders in ordinary Transportation but
isolated in this product. Becoming a customer creates no tenant, tenant membership, staff role,
Reviewer role, entitlement or operational product session.

Internal enrollment staff (legacy RPC key school_admin) and business owners create/pause customer
accounts. Reviewers can see the request queue but cannot create accounts without management
authority. Existing staff grants remain staff grants; they are not automatically transferred to
customers. Parent access remains future own-child tracking, and Driver route execution is future
work. Neither customer membership nor a proposed contact establishes parent tracking authority.

## First request slice

/school is the customer portal. A customer selects its admitted account and submits one future
pickup time, one shared destination and one or more student names/pickup addresses. Three
students at three homes therefore create one grouped request, not three ordinary bookings.
The request cap of 20 is an intake bound, never a statement of approved vehicle capacity.
Staff must plan/validate segments, seats, eligibility and handoff before any route may run.

Requests contain private snapshots, not canonical enrollment IDs or verified student identities.
Addresses are proposed text for staff review, not geocoded or validated service coverage. There
is no fare, payment, driver assignment, route optimization or confirmation of a booked ride.
The current lifecycle is submitted -> withdrawn. Internal queue review is read-only; operational
approval/decline, dispatch, recurring schedules, afternoon/multi-school stops and execution events
are next slices, not secretly delegated to ordinary dispatch. Multiple future requests are allowed.

/clients is the internal account/requests screen; /enrollment retains the internal enrollment form.
/admin governs staff/reviewer admission and links to both. Customers cannot use these controls;
visiting their URLs does not grant privileges. /guardian remains a closed tracking notice.

## Schema and authorization

Migration 20261015000300_student_customer_requests.sql adds product-owned customers, customer
users and transport requests. Tenant-bound composite FKs prevent account/request mismatches.
Customer accounts do not require business membership. Internal staff enter a school name and
new contact email; pending invitation acceptance is described below. Extra customer contact
management remains future work.

Customer authorization requires verified auth, active person, active customer/tenant and enabled
enrollment pilot. Account members can see that account's requests, never another account's
students. Authorized internal enrollment staff/Reviewers see tenant requests. Owners alone can
manage accounts but do not implicitly read student requests. No anonymous reads; no authenticated
direct writes or customer-user table reads. Security-definer RPCs retain narrow grants/search paths.

Account creation and submission accept actor/tenant-scoped idempotency keys; payload mismatches
fail. Uniqueness also handles concurrent retry inserts. Withdrawals are idempotent and account-
authorized. Customer pause hides its data and blocks submissions; restore does not book a ride.
Audit stores generic reasons, resource IDs and counts, not child names/addresses/email. Invitation
verification email is the only added email flow; no trip email, push, public realtime, browser
student-data persistence or additional file storage is introduced.

## First-time customer invitation

Migration 20261015000400 adds private, tenant/customer-bound pending invitations. The staff form
calls a same-origin bearer-authenticated API; its caller-JWT RPC creates the customer and invitation
transactionally, without requiring a person/auth account for the recipient. Names/emails are bounded;
the server checks verified staff identity and database management authorization before requesting
email. Customer creation retries reuse the same key/account. Email failure retains the saved account.

The API uses the existing public Supabase client and signInWithOtp(shouldCreateUser:true) for the
invited email. Supabase creates a first-time auth identity and sends its verification email; existing
accounts receive a sign-in email. No service-role key, Resend credential, auth-admin creation, tenant
invitation or existing app auth/template change is introduced. The destination is fixed to
https://school.eshapp.com/school; caller-supplied email/redirect cannot redirect a resend.
Provider signup/SMTP limits still apply; provider acceptance is not mailbox delivery.

On verified /school sign-in, accept_my_student_customer_invitations matches the actual auth.users
email, never browser payload/JWT user metadata. It accepts only unexpired invitations for active
customers/tenants with the pilot enabled, then creates/reuses an active matching neutral identity
and inserts customer membership. Suspended/deactivated identities and mismatched existing auth
bindings are not reactivated/relinked. No invitation means no identity bootstrap or access.
Acceptance retries do not duplicate membership/audit. It creates no tenant membership, enrollment
staff, platform role, parent grant or operational lease. Existing account admission is preserved.

Pending invitations expire after seven days; actual verification-link expiry follows Supabase's
configuration. Internal staff see Pending/Expired/Accepted and can resend pending invitations;
resend renews the admission expiry. Attempt reservations enforce a 60-second per-invitation cooldown,
including failed sends. There is no background delivery retry. Last attempt is not proof of delivery.
Pause prevents invitation acceptance and account use. Invitations/email addresses are readable only
by customer-management staff, not school customers/Reviewers without management permission.

Browser failures retain the unchanged submission key; changed data requires refresh. Saved
requests survive reload; unsaved input does not. Identity/account changes clear private state,
and load generations discard stale reads. Lists are bounded at 100, disclosed for requests.
No durable offline queue or cross-restart retry is promised. Check requests before resubmitting
after a reload/unknown result. SQL time is timestamptz; the form displays the device time zone and
converts the chosen local time to an absolute instant, then validates it server-side.

## Release gates and remaining work

Add exact https://school.eshapp.com/school to Supabase redirect URLs before customer email tests;
keep /admin, existing callbacks and Site URL intact. Staff still return to /admin. Client storage
remains esh-student-transportation-auth. No native build, provider credential or ordinary app edit.

No real minors' data until privacy notices, authority review, retention/deletion and incident
preservation rules are approved. Withdrawal/pause do not delete records. Before transporting:
canonical students and authority, geocoded/scheduled requests, route approval, student-eligible
resources, per-segment capacity, Driver manifest/boarding/handoff, incidents and restricted parent
tracking are required. Shared ordinary drivers/vehicles require a cross-product reservation guard;
existing Driver approval and session leases do not solve overlapping resource assignments.

PGlite tests execute actual new migrations with minimal legacy fixtures, not full deployed
Supabase/concurrent-session certification. Browser APIs are intercepted; fixtures establish
layout/lifecycle behavior, not email delivery or physical-device behavior. See the manual test.
