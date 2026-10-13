# Assigned Rider rating acceptance

Owner runs database and release commands. First:

    corepack pnpm exec supabase db push --dry-run

Confirm only `20261013000400_assigned_rider_rating.sql`. Earlier `20261013000300` is owner-applied
and the Rider-side Driver rating/photo display is owner-visible. Do not reapply it.
Apply the intended migration, push reviewed source and confirm Driver Ready. No native rebuild.

Use identifiable controlled accounts/trips. Restore unfinished bookings and Driver availability
afterward; do not manufacture real scores or alter production timestamps to force disclosure.

1. Accept a controlled trip for a Rider with disclosed Driver ratings. Driver Home's Active trip
   opens Dispatch, where the Rider photo/name shows `★ average · count ratings` beside it.
2. Check the all-time same-provider average against eligible overall scores. Detailed criteria,
   undisclosed or removed ratings and another provider's Rider profile must not contribute.
3. A confirmed zero count displays 'Not yet rated'. Missing data displays 'Rating unavailable'.
   A missing/unuploaded photo keeps initials and the rating visible; no photo upload is required.
4. On normal/manual Refresh dispatch, new disclosure or removal updates the average/count.
   A changed assignment/name must carry its own summary. Old assigned Drivers lose server access.
5. Arrived and in-progress retain the summary. Completion/cancellation remove it. Offers, preorders
   and Recent orders do not expose an aggregate before/after active assignment.
6. Verify another Driver, Rider account, provider, inactive identity/tenant/profile and unknown trip
   cannot use this as a general Rider lookup. No historical individual score/comment is returned.
7. Check 414 × 896 and 320px, iOS/Android, initials/photo, long names, contact/route, navigation and
   lifecycle controls. Keep approved Rider booking/tracking unchanged. No emergency action in tests.

Local SQL:

    node tooling/scripts/assigned-rider-rating-sql-check.cjs

SQL uses disposable PGlite with actual dispatch/reputation definitions and minimal dependencies,
not production. Unit tests distinguish zero/missing/invalid data; browser fixtures cover compact
display, refresh, passenger change, photo fallback and active lifecycle. Physical delivery/display,
real-account access and full Supabase/concurrency acceptance remain owner work after release.
