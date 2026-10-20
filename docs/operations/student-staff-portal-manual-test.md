# Unified Student staff portal acceptance

Local change; owner GitHub push/deployment and hosted acceptance pending. Live baseline is 519320b.
No migration, new environment variable, key, email alias, Supabase configuration or native build.
Do not pop/apply the owner's Backup before Student Transportation rollback stash. Preserve the
existing submitted December TEST request; no fresh customer/request creation is needed to resume.

## Entry points

| Audience | URL | Current controlled-test email |
| --- | --- | --- |
| Internal staff | https://school.eshapp.com/admin | ishmaelkosh@gmail.com |
| School customer | https://school.eshapp.com/school | koach2025@gmail.com |

Staff /clients links open /admin. Old /enrollment links open Enrollment within /admin. Customer
links/sign-in/invitations remain /school. Visiting staff URLs does not create staff access. Use
separate browser profiles only when testing both identities concurrently, not to "repair" access.

## Owner release and first checkpoint

Owner stages only scoped portal code/tests/docs, commits and pushes main. Vercel receives the
release through GitHub. Do not Instant Rollback/Promote or change production settings manually.
Confirm Student project production Ready at the new commit; record that commit in session-handoff.

1. Open /admin using the existing internal account's browser session. Heading: Staff portal.
   If signed out, request ONE new email with the internal email and open newest link in the same
   profile. It returns to /admin. Do not request repeated links while diagnosing a load failure.
2. If API access still fails, copy only the on-page operation/status/code. Expect private panels
   hidden and no misleading "No account access" on a failed response. Stop hosted lifecycle tests
   until the API failure is resolved. This consolidation does not claim to repair that 401.
3. If access loads, expect one Signed in as line, Refresh workspace, Sign out and Operating business
   selector. ESH Education should be selected when it is the enabled reviewer business. Confirm
   before proceeding; Community Hub is a separate business.

## After successful access

4. Requests and planning: existing December TEST request, tags and road preview remain available;
   Open route planning opens the existing workspace. No dispatch/confirmation is introduced.
5. Enrollment: admitted staff can manage their enrollments; reviewers can review others' submissions.
   When both roles exist, use Manage enrollments / Review enrollments inside this section.
6. Administration: existing pilot/access controls only for configuration-authorized users. An
   owner without reviewer/enrollment permission must not gain child/request data or review controls.
7. Change section: one session and same selected business; no new email or second auth controls.
   Save first: unsaved inputs clear when leaving a section. Change business: prior private records,
   draft forms and maps clear before the new business loads. Refresh/revoke/sign-out clears data.
   During a save, shell navigation/business/sign-out controls are disabled until the action settles.
8. In a separate customer profile verify /school address search, grouped request view and road map;
   do not grant the customer tenant or staff membership. Ordinary products remain untouched.
9. Check 320px, 414px and desktop; navigation wraps with no horizontal overflow.

## Local checks

Use disposable localhost public config and no production credentials for an enabled build. Run:

    node tooling/scripts/student-staff-browser-check.cjs
    node tooling/scripts/student-enrollment-browser-check.cjs
    node tooling/scripts/student-customer-browser-check.cjs
    node tooling/scripts/student-planning-browser-check.cjs

Restore a default-off build and run student-transportation-browser-check.cjs. Evidence screenshots
are ignored under tmp/student-staff-evidence; provider/API fixtures send no email or production data.
