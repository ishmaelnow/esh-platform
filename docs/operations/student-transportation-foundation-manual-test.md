# Student Transportation foundation checks

This is a closed-shell/security foundation. Student enrollments and rides cannot be submitted yet.
This describes default-off behavior. The newer separately gated enrollment slice is documented in
student-guardian-enrollment-manual-test.md; neither migration is deployed and no ride operations exist.
No existing app rebuild, secret, Supabase credential, native permission or new provider is needed
to preview this static shell. Do not connect student records or enable student operations.

From the repository folder:

    corepack pnpm --filter @esh-platform/student-transportation dev

Open http://127.0.0.1:3006. Inspect Families, Operators and Administration, then Home.
Each route must say it is not open for bookings and must have no student data form.
Check 414 × 896, compact 320px width and desktop; no horizontal clipping and visible focus outlines.

Checks:

    node tooling/scripts/student-transportation-sql-check.cjs
    corepack pnpm --filter @esh-platform/student-transportation lint
    corepack pnpm --filter @esh-platform/student-transportation typecheck
    corepack pnpm --filter @esh-platform/supabase typecheck
    corepack pnpm exec vitest run apps/admin/src/lib/workspace-admin/types.test.ts
    corepack pnpm --filter @esh-platform/student-transportation build
    node tooling/scripts/student-transportation-browser-check.cjs

SQL checks require the existing ignored PGlite installation under tmp/native-push-sql; this is
test-only infrastructure and not an application dependency. The script reports missing dependency
if unavailable on another machine; never replace it with a production database connection.
Browser checks require existing Playwright Chromium and a completed build; reserve port 3006.
Screenshots go to ignored tmp/student-transportation-evidence. No real account or student is used.

## Owner migration/release gate

Owner confirmed this migration and the enrollment migration applied after a matching dry run.
For another environment the owner first runs:

    corepack pnpm exec supabase db push --dry-run

Review that output before any real push. Only
`20261014000100_student_transportation_foundation.sql` should be pending for this change.
This repository session has not verified remote migration history; do not infer it from filenames.
No real db-push command is authorized by this document without the owner reviewing the dry run.
No Vercel project/domain has been created. If later deploying the shell independently, its root is
`apps/student-transportation`, with existing monorepo install conventions and files outside root
included. Deployment of a static shell does not enable the product.

After any eventual migration, verify existing Transportation/Community access and workflows still
work, Student workspace rows are disabled, roles are nonassignable and no Student entitlement exists.
Do not attempt student transport operations as a migration test.
