# Rating reminder acceptance

Owner runs database and release commands. First run:

`corepack pnpm exec supabase db push --dry-run`

Confirm only `20261011000200_trip_rating_reminders.sql` is listed before running the real push.
Previous daily-activity migration is owner-applied. Commit/push reviewed source, then confirm
Admin, Rider and Driver deployments Ready. No native build, new secret or cron is required.

Use identifiable test accounts and existing approved test flow. Do not alter timestamps or complete
real trips merely to force reminders. Restore preferences, unfinished bookings and Driver Offline.

1. Complete a controlled Rider/Driver trip. Do not rate immediately. Around ten minutes afterward,
   verify one reminder reaches each opted-in participant. Completion alerts remain separate.
2. Tap the alert in iOS/Android or the Web/email link. Confirm correct app/account and exact trip
   rating form opens at 414 x 896. Submit a score and optional comment normally.
3. Complete another controlled trip and rate before ten minutes. Confirm that participant gets no
   reminder; the other participant may still get theirs. Do not expect already-delivered alerts to
   disappear. Reopening a delivered alert must show the existing submitted rating.
4. With trip email off and device alerts on, verify no reminder email but device delivery works.
   With all channels off, verify no reminder. Restoring preferences does not backfill old trips.
5. Follow a link in another account: no foreign trip form/details. Unknown/expired links explain
   the limitation; refreshing cannot grant access. Rating disclosure/moderation remain unchanged.
6. Confirm notifications contain no participant names, addresses, score/comment or private files.
   No SMS. Cancelled/uncompleted trips do not generate reminders.

Local SQL: `node tooling/scripts/trip-rating-reminders-sql-check.cjs` uses existing ignored PGlite
under tmp/native-push-sql and never connects to production.
