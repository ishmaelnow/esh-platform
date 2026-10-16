# School customer request pilot

Use clearly labelled TEST accounts/students only. No real child data or student transportation.
Owner confirmed migration 20261015000200 applied and pushed ff826ef. Do not reapply that migration.

## Owner release

Run corepack pnpm exec supabase db push --dry-run. It should list only
20261015000300_student_customer_requests.sql. Inspect before issuing the real db push.
Then owner stages explicit feature files, commits/pushes and checks Student Vercel Ready.
Add https://school.eshapp.com/school to Supabase Authentication redirect URLs. Keep /admin,
/guardian and all existing product callbacks; keep Site URL. Customer sign-in returns to /school;
internal staff sign-in returns to /admin. No native rebuild or new environment variable.

## Business test

1. In /admin, as ESH Education owner, enable pilot and retain existing Reviewer access if reviewing
   child data. Grant Internal enrollment staff only to company personnel. Do not grant it to schools.
2. Follow Customers and transportation requests to /clients. Add TEST SCHOOL and an existing
   verified ESH email belonging to the customer. This does not require inviting them as tenant staff.
   Account creation sends no email invitation; share the public portal URL yourself.
3. In a separate browser profile/private window sign in at /school with that customer email.
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

## Local checks

    node tooling/scripts/student-enrollment-sql-check.cjs
    corepack pnpm exec vitest run apps/student-transportation/src/lib/customer.test.ts apps/student-transportation/src/lib/enrollment.test.ts apps/admin/src/lib/workspace-admin/types.test.ts
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
Browser fixtures check account creation, correct callback, form/retry/reload/withdrawal and clearing.
