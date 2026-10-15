# School enrollment role correction

Use identifiable TEST students only. Owner controls all release/production commands.

Run corepack pnpm exec supabase db push --dry-run. Verify only
20261015000200_school_managed_enrollment.sql is listed before running the actual db push.
Deploy the scoped app through the owner's normal Git/Vercel process. No native rebuild, secret,
new callback entry or Site URL change is required. Both staff sign-in flows return to /admin.

1. Sign in at school.eshapp.com/admin as ESH Education owner. Enable the pilot if paused.
2. Grant School administrator to an existing active tenant member. Reviewer grants stay separate.
3. Follow Manage student enrollment to /school. Save a TEST draft with proposed parent contact
   details and pickup/drop-off contacts; reload, edit and submit.
4. A different admitted Reviewer rejects with notes; staff correct/resubmit; reviewer approves.
   A staff member with Reviewer access cannot review their own submission.
5. Former Guardian without a fresh staff grant cannot read/save/withdraw, including via old RPCs.
   /guardian has no form. Ordinary membership and ownership do not expose student records.
6. Other submitters cannot read/edit your submissions unless separately admitted Reviewer.
   Cross-tenant, expired/suspended membership, paused program and revoked staff deny access.
7. Verify 414x896, 320px, desktop, sign-out and identity/tenant-switch clearing.
8. Parent tracking remains unavailable. Approval does not book a ride or verify handoff contacts.

Local SQL: node tooling/scripts/student-enrollment-sql-check.cjs. App lint/types/build and enabled
mocked student-enrollment-browser-check.cjs plus default-off student-transportation-browser-check.cjs
are required. Existing guardian manual test contains disposable build configuration instructions;
its old parent role acceptance steps are superseded. Restore default-off output after testing.
Fixtures do not certify real email, production integration, native keyboards or concurrent sessions.
