# Rider pickup sharing acceptance

Owner first runs `corepack pnpm exec supabase db push --dry-run`. Confirm it lists only
`20261008000100_rider_pickup_location_sharing.sql` before providing/executing the real database
push. Then commit/push hosted Rider and Driver changes and confirm both Vercel deployments Ready.
No new environment variable or Codemagic build is required.

Use identifiable owned test accounts and an existing authorized ride; do not charge another payment
merely to test location. In Rider Home select Track ride, or open Trips from the menu.

1. Before acceptance: no sharing control or passenger point is exposed.
2. Accepted: Share my location with my driver is initially off. Merely centering the map must not
   publish a passenger point. Select the control and grant GPS; Driver's active-trip controls show
   the actual shared position, accuracy, timestamp and a distinct pin. Pickup address stays unchanged.
3. Stop sharing: Driver loses the point on its next five-second refresh. No new GPS publications.
4. Deny permission or lose connectivity: Rider shows an actionable message; Driver never treats
   a capture older than sixty seconds as current. Background the Rider app or leave Trips, wait
   over sixty seconds, and confirm Driver sees no current shared point. Return foreground to resume
   only when consent remains enabled.
5. Arrived: sharing still helps meet at pickup. Start trip, cancel, or reassign normally: consent and
   coordinates are deleted. New assignment must not inherit prior consent. Other Drivers/Riders and
   other tenants must not obtain the coordinate, even by specifying the booking UUID.
6. Driver retains Navigate to pickup. View shared passenger location opens installed navigation only
   when explicitly tapped. Do not initiate navigation or emergency actions during automated tests.
7. Check iOS/Android at 414 × 896 and compact widths. Sign out/switch account during pending GPS:
   no subsequent position from the old screen may publish to the new trip.

Local minimal-schema privacy smoke check: `node tooling/scripts/rider-pickup-sharing-sql-check.cjs`.
Never run its bootstrap against production. Full disposable Supabase/RLS and concurrent lifecycle
testing remain separate acceptance. Restore test Driver availability and close unfinished rides.
