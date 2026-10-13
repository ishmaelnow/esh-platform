# Assigned Driver rating acceptance

Owner runs production and Git commands. First:

    corepack pnpm exec supabase db push --dry-run

Confirm only `20261013000300_assigned_driver_rating.sql`. Previous `20261013000200` is owner-applied
and both notification checks passed. Do not reapply it. Then apply the intended migration, release
reviewed source and confirm Rider Ready. No Codemagic build, new secret or cron configuration.

Use clearly identified authorized test accounts/trips; restore unfinished bookings and Driver
availability afterward. Do not change real trip timestamps or manufacture ratings in production.

1. Accept a controlled trip with a Driver having disclosed eligible ratings. Home shows the Driver
   photo/name with `★ average · count ratings`; Track ride shows the same summary and vehicle/plate.
2. Verify the mean from the eligible overall scores, not detailed criteria or today's trips. Only
   Rider-to-Driver scores in this provider count. Private or removed scores must not contribute.
3. With a confirmed zero count, show 'Not yet rated'. Missing data shows 'Rating unavailable'.
   Missing profile photo leaves initials while a valid average remains visible.
4. New disclosure or Admin removal updates average/count on the normal foreground/manual refresh.
   Reassignment shows the new Driver's own aggregate, including an unrated Driver. No old score
   should be attached to the new name. This is a snapshot, not a background live-data promise.
5. Arrived/in-progress retain the summary. Requested/offered trips expose no candidate summary;
   completion/cancellation remove active identification. Past trips gain no Driver average.
6. Another Rider/account/provider cannot query a foreign assignment or a general Driver profile.
   Inactive ownership/tenant/Driver and unknown booking provide no aggregate. Cross-tenant Driver
   profiles belonging to the same person must not combine their ratings.
7. Check 414 × 896, compact 320px, iOS/Android, portrait/photo fallback, map attribution/gestures,
   bottom controls, and booking/payment/tracking regressions. The summary must fit beside the photo.

Local verification:

    node tooling/scripts/assigned-driver-rating-sql-check.cjs

This uses disposable local PGlite and actual portal/reputation definitions with minimal schema.
Unit tests distinguish valid zero/missing/malformed aggregates; browser fixtures exercise Home,
Current trip, refresh, reassignment, lifecycle removal and compact widths. No local production
mutation or outbound notification. Real-device/real-account and full migration-chain acceptance
remain owner work after deployment.
