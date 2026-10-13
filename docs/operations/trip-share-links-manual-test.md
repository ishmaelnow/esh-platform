# Share my trip acceptance

Owner runs database/Git/deployment commands. First run:

    corepack pnpm exec supabase db push --dry-run

Confirm only `20261012000100_trip_share_links.sql` before the real push. Earlier migrations are
owner-applied; never reapply them. Release Rider, shared types and Driver consent-description copy;
confirm Rider/Driver Ready. Existing service-role and public map configuration suffice. No native build.

Use identifiable controlled accounts and an existing approved test flow. Restore Driver Offline and
close unfinished bookings. Do not create charges, publish invented GPS or trigger emergency actions.

1. Requested/offered/scheduled trips have no Share my trip control. After acceptance, open Track ride
   or Trips → Current trip → Share my trip. Sharing starts Off. Creation is optional and explains
   who can see the link, four-hour expiry and Driver location scope.
2. Create trip link, use Share trip link on iOS/Android or copy manually. Open it in a private browser
   without a Rider account. Status updates and the real interactive map/attribution appear only when
   Driver sharing provides a fresh coordinate. No personal/financial/address/message details appear.
3. Stop Driver location sharing or let its position age: the map disappears; status remains. Re-enable
   through the existing Driver control to recover. Offline/hidden recipient pages clear their map;
   restored connection/foreground recovers without stale live markers.
4. Stop sharing trip: recipient clears at its next read. Failed stop must leave the confirmed active
   state and retry available. Refresh Rider: active link can be stopped; raw token is not recovered.
5. Create replacement: original link stops; replacement works. Unknown/malformed tokens show the same
   unavailable state, with no account or booking information. Another Rider cannot create/revoke the
   owner's link. Another tenant/Driver assignment cannot supply its coordinates.
6. Arrive/start retain sharing. Complete/cancel/reassign ends the old link. Four-hour expiry also ends
   it without depending on cron. Never alter real timestamps simply to force tests.
7. Check complete 414 × 896 and compact 320px screens, keyboard/focus, native share cancellation and
   clipboard/file limitations. Existing booking, tracking, plate card, ratings and payment return remain.

Local checks: `node tooling/scripts/trip-share-sql-check.cjs` uses disposable minimal PGlite only.
Browser fixtures exercise recipient/login-free routing, no token in request URLs, stale removal,
network recovery and Rider creation/revoke failure/reload. They do not certify real accounts, full
Supabase/RLS chains, physical location or actual native share-sheet behavior.
