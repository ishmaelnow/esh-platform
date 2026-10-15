# Student guardian enrollment manual test

Local implementation only. Do not enable real student transport or collect real minors' information
until the privacy/retention/authorization requirements in the architecture document are approved.

## Local checks without production access

    node tooling/scripts/student-transportation-sql-check.cjs
    node tooling/scripts/student-enrollment-sql-check.cjs
    corepack pnpm exec vitest run apps/student-transportation/src/lib/enrollment.test.ts apps/admin/src/lib/workspace-admin/types.test.ts
    corepack pnpm --filter @esh-platform/student-transportation lint
    corepack pnpm --filter @esh-platform/student-transportation typecheck
    corepack pnpm --filter @esh-platform/supabase typecheck

PGlite uses the existing ignored tmp/native-push-sql test dependency. No remote database is contacted.
For isolated browser verification, build using nonsecret localhost settings in PowerShell:

    $env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321'
    $env:NEXT_PUBLIC_SUPABASE_ANON_KEY='test-anon-key'
    $env:NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED='true'
    corepack pnpm --filter @esh-platform/student-transportation build
    node tooling/scripts/student-enrollment-browser-check.cjs

The browser harness reserves port 3007 and intercepts all Supabase responses with disposable,
clearly labeled TEST data. No real auth email or account is used. Screenshots are under ignored
tmp/student-enrollment-evidence. A test-config build must not be deployed or used for real accounts.
Clear those process variables or use a fresh terminal before a normal/default-off build:

    Remove-Item Env:NEXT_PUBLIC_SUPABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:NEXT_PUBLIC_SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED -ErrorAction SilentlyContinue
    corepack pnpm --filter @esh-platform/student-transportation build
    node tooling/scripts/student-transportation-browser-check.cjs

## Owner-controlled integration setup

Owner confirmed both migrations applied after the intended dry run on 2026-10-15.
The following is the required procedure for another environment, not a request to reapply them:

    corepack pnpm exec supabase db push --dry-run

Expected intended set: `20261014000100_student_transportation_foundation.sql` and
`20261014000200_student_guardian_enrollment.sql` (unless the first was separately applied).
Inspect the result before any actual db push. No production command was executed by Codex.

Configure this app independently using its .env.example; never copy or expose populated keys in
chat. The UI requires public Supabase URL/anon key and the explicit enrollment flag. No service-role
key is used. Add only this app's exact `/guardian` and `/admin` URLs to the Supabase redirect allowlist
when intentionally testing its email flow; do not replace Rider/Driver/Admin callback settings.
No app/domain was deployed or configured in this repository session.

Use existing verified ESH test accounts with active membership in the test tenant. In `/admin`,
a platform administrator/member can deliberately enable the enrollment pilot, admit test guardians,
and admit a different reviewer. Reviewer access is separate from governance rights. Admission does
not send an invitation email; communicate the app URL through the normal owner-controlled process.
Do not enable the Student product workspace or assign operational roles: foundation guards deny it.

## Acceptance

1. Guardian signs in through the correct app and sees only their admitted organization(s).
2. Add two TEST children with grade, proposed school, contact phone and relationship. Add proposed
   contacts; submit requires authority attestation and at least one contact.
3. Save a draft, reload, edit and verify contacts persist. Unsaved input is not promised across reload.
4. Submit; initial status is submitted and editing is blocked until withdrawal.
5. Another guardian cannot read the records/contacts or mutate either child, including guessed IDs.
   Cross-tenant IDs and normal tenant-owner access must fail too.
6. Explicit reviewer rejects with notes; guardian sees notes and can correct/resubmit. A reviewer
   cannot review their own child. Approve another guardian's request; verify no ride is created.
7. Withdraw and verify state. Pause/revoke admission and refresh: records disappear and mutations
   fail. Check suspended memberships/tenant and unverified emails are denied.
8. Simulate a failed save. Retry unchanged data with the same request ID; one record/audit action
   results. Refresh before a different action if save outcome is unresolved.
9. Check sign-out, tenant changes and account changes clear student records. Check 414×896,
   compact 320px width, desktop and keyboard focus/scrolling; no fixed action overlaps fields.
10. Verify Rider/Driver ordinary booking and current governance still behave as before.

Real email/auth callback handling, true concurrent database sessions, native keyboards/devices and
full deployed RLS integration remain separate manual checks; mocked UI tests do not establish them.
