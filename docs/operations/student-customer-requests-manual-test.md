# School customer request pilot

Use clearly labelled TEST accounts/students only. No real child data or student transportation.
Owner applied 20261015000200 and 20261015000300; pushed 6f99ee9 and confirmed Ready.
Owner also saved /school callback. Do not reapply these migrations or repeat that setup.

## Owner release

Run corepack pnpm exec supabase db push --dry-run. It should list only
20261015000400_student_customer_invitations.sql. Inspect before issuing the real db push.
Then owner stages explicit feature files, commits/pushes and checks Student Vercel Ready.
Keep the already saved https://school.eshapp.com/school Supabase redirect URL, /admin,
/guardian and all existing callbacks/Site URL. Customer verification returns to /school;
internal staff sign-in returns to /admin. No native rebuild or new environment variable.

## Business test

1. In /admin, as ESH Education owner, enable pilot and retain existing Reviewer access if reviewing
   child data. Grant Internal enrollment staff only to company personnel. Do not grant it to schools.
2. Follow Customers and transportation requests to /clients. Enter TEST SCHOOL and a NEW school
   contact email; click Create account and send invitation. Do not pre-create an ESH account or
   grant tenant/staff access. Expect Invitation pending and an email request success message.
3. Open the verification email link in a separate browser profile/private window. It returns to
   /school, verifies the email and automatically accepts customer-only access. Refresh the internal
   account list to see Invitation accepted. For later sign-ins use /school with the same email.
   Verify customer account selector, no internal management or access-grant controls.
4. Enter a future time (check displayed device time zone), a shared destination and three students
   with different pickup addresses. Submit. Expect one request, Awaiting review / ride not confirmed.
5. Reload: all three entries persist. On /clients, explicitly admitted staff/Reviewer sees the same
   request. Owner alone does not implicitly receive student-request access.
6. Withdraw as customer; verify the internal queue shows Withdrawn. No refund/dispatch occurs.
7. Another customer account must not read/withdraw this request, including guessed IDs or URLs.
   Attempting staff enrollment, customer creation, governance or direct table updates must fail.
8. Pause customer access as internal staff. Refresh customer portal: request/form disappears.
   Restore after testing. Paused program/tenant, inactive person or unverified auth must deny access.
9. Check 414x896, 320px, desktop; change account and sign out, checking private state clears.
10. No new ordinary Rider booking or Driver assignment should exist. This is request intake only.

Invitation recovery: simulate unavailable email in local fixtures, confirm the account remains,
and use Resend invitation after one minute. No duplicate customer should be created. Test expired
admission/resend, wrong recipient, unverified auth, paused account/program, suspended profile and
uninvited account. They must not gain access. Supabase must allow passwordless signup for first-time
identity verification and have working email delivery; do not change shared auth settings blindly.
The email uses the existing provider verification template. Actual mailbox/callback acceptance is
an owner test; local mocks never send a real email.

## Local checks

    node tooling/scripts/student-enrollment-sql-check.cjs
    corepack pnpm exec vitest run apps/student-transportation/src/app/api/customers/invite/route.test.ts apps/student-transportation/src/lib/customer.test.ts apps/student-transportation/src/lib/enrollment.test.ts apps/admin/src/lib/workspace-admin/types.test.ts
    corepack pnpm --filter @esh-platform/student-transportation lint
    corepack pnpm --filter @esh-platform/student-transportation typecheck
    corepack pnpm --filter @esh-platform/supabase typecheck

Build with the disposable localhost public config from the earlier enrollment manual test, then:

    node tooling/scripts/student-customer-browser-check.cjs
    node tooling/scripts/student-enrollment-browser-check.cjs

Restore a fresh-terminal/default-off build afterward and run
node tooling/scripts/student-transportation-browser-check.cjs.
Evidence: tmp/student-customer-evidence. Tests do not send real email or contact production.
The SQL fixture includes customer-without-tenant-membership, account/tenant denial, three-student
grouping, retries/mismatches, malformed/past requests, pause, withdrawal, audit and no staff escalation.
Invitation checks additionally cover a new email with no person/tenant account, actual verified-email
identity bootstrap, expiry/resend cooldown, paused customer, suspended/mismatched profile, wrong
recipient, anonymous denial and acceptance retries with zero staff/tenant grants. API provider calls
are mocked. Browser fixtures cover send failure, retained account, resend, automatic acceptance,
correct callback, form/retry/reload/withdrawal and clearing.
