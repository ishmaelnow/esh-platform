# Rating update alert acceptance

Owner runs production and Git commands. First run:

    corepack pnpm exec supabase db push --dry-run

Confirm only `20261013000200_rating_update_notifications.sql` before running the real push.
Earlier rating review migration `20261013000100` is already owner-applied. Confirm Admin, Rider
and Driver hosted deployments Ready afterward. No new native build, secret or cron setup.

Use clearly identified controlled accounts/trips. Restore email/device choices, unfinished test
bookings and Driver Offline afterward. Do not alter production timestamps to force disclosure.

1. Complete a controlled trip and have one participant rate. No received-rating alert before
   mutual rating or seven days from completion. The ten-minute rating reminder is a separate event.
2. Have the other participant rate. Each opted-in participant should receive one generic rating
   alert on the next worker cycle. Do not expect an undisclosed score in any notification.
3. Tap each iOS/Android alert or email/Web link. Rider opens the exact completed trip; Driver opens
   the exact trip in Ratings. Received score/participant/route must match. No rating-submission form
   should open automatically and no 'already rated' reminder message should obscure the update.
4. Request a rating review. In Admin Reputation, keep or remove it with a test explanation. Only
   the requester receives a generic decision alert. Tap it: the correct trip and decision appear.
   Removal suppresses the score/comment but preserves the decision. Repeating the same committed
   decision does not create another notification.
5. Trip email off/device on: device alert works without email. Email on/device off: email works.
   All channels off: no event. Turning them back on does not send a historical burst.
6. A one-sided rating becomes eligible after the natural seven-day boundary; no client screen
   needs to stay open. If testing this later, use a clearly identified eligible test trip.
7. Check unknown/other-account/other-tenant links, inactive recipients, hidden ratings, and offline
   retry. No foreign details or private payload text. An already delivered alert may remain on the
   device after moderation; opening it must show current authorized state, not a stale score.
8. Confirm existing ratings, review submission, reminders, booking/payment return, trip support,
   messages, Driver availability and dispatch still work. Check 414 × 896 and compact phone widths.

Local SQL:

    node tooling/scripts/rating-updates-sql-check.cjs

This uses a disposable minimal PGlite database under ignored tmp/native-push-sql. No remote
connection or outbound notification. Unit tests validate privacy, channel gating and tap/link
parsing; browser fixtures validate exact-trip focus and unavailable targets. These do not certify
physical notification receipt, real-account authorization or full production concurrency.
