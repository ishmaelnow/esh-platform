# Trip participant photo release and test

Owner runs database and Git/deployment mutations. Existing Rider/Driver service credentials suffice.
No native rebuild or new environment variable is required for the hosted Capacitor apps.

1. Run `corepack pnpm exec supabase db push --dry-run` in the authenticated shell. Confirm only
   `20261010000200_trip_participant_photos.sql` is listed before running the real push.
2. Push reviewed files and confirm Rider and Driver Ready at the same commit. Reopen installed apps.
   Keep generated next-env/tsconfig edits out of feature staging.
3. Use identifiable test accounts in one tenant. Rider Account: optional JPEG/PNG photo. Driver
   Documents: actual profile photo approved through existing Admin review. Never use an ID photo
   as the profile photo. Missing, PDF, pending, rejected or expired profile photos yield initials.
4. Before acceptance, no Rider photo appears in the Driver offer. After acceptance, Rider home/Trips
   shows the assigned Driver photo; Driver active controls show the Rider photo beside their name.
   Check at 414 x 896 and a compact phone width; trip controls stay reachable.
5. Remove Rider photo: Driver falls back on refresh/renewal. Offline and image errors also fall
   back without blocking trip controls. Sign out/switch accounts: no previous participant image.
6. Another tenant/account/unassigned Driver cannot obtain the photo. Complete/cancel: no new link.
   If testing reassignment, old Driver loses access. Already issued links last up to 60 seconds;
   downloaded images cannot be revoked. No photos in alerts, preorders or history.
7. Restore Driver availability and end/cancel test bookings. Do not initiate SOS or real charges.

Local checks include shared signing tests, Rider/Driver unit and browser suites, scoped lint/type
checks, production builds and `node tooling/scripts/trip-participant-photos-sql-check.cjs`.
SQL smoke uses the existing ignored PGlite install under `tmp/native-push-sql` and never connects
remotely. Browser screenshots use isolated fixture artwork, never production sample photos.
