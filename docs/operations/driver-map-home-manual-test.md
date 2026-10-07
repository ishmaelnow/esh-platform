# Driver map home verification

## Local design preview

From the repository root in the owner's PowerShell session:

```powershell
node tooling/scripts/driver-preview.cjs
```

This dedicated browser uses a clearly identified fixture account and business responses, with
real OpenFreeMap street tiles. Availability changes affect only that fixture. External API actions
are blocked. No populated environment file, auth setting or production data is changed. Close the
browser to stop the local server. This is visual/interaction evidence, not real-account validation.

## Real Driver checks

Use Driver's own configuration and sign-in at localhost:3002 or the deployed Driver domain. Do not
copy Rider/Admin environment files or change authentication URLs. Never initiate an emergency for
testing. Production lifecycle tests require identifiable data and cleanup under the handoff rules.

1. At 414 × 896 and 320 × 600, confirm the bright map, compact totals, left hamburger, floating
   controls, full-width Preorders row and availability bar. Check attribution remains unobstructed.
   Drag, zoom and rotate the map; do not accept a static image as map evidence.
2. Grant locate permission. Confirm real GPS moves the navy marker without enabling server sharing.
   Background/foreground the app. Deny permission and confirm a clear operating-area fallback.
   Verify no driver location update RPC occurs until existing sharing is explicitly enabled online.
3. Compare today's completed count, Driver earnings and platform fees with authorized completed
   trips/wallet. Confirm reversed earnings are excluded and pending earnings aren't labeled paid.
   No activity yields real zeros; failed data loads yield unavailable values. Distance and online
   duration remain unavailable until a backend aggregate exists.
4. Open the drawer; confirm the five ordered entries, disclosed rating only, 87% mobile width,
   backdrop, keyboard focus trap, Escape, focus return and browser/device back behavior.
5. Visit Profile, Notifications, Wallet, Recent orders and Settings. Confirm documents, ratings,
   assigned vehicle, operating areas, location sharing, trip sounds and dispatch remain reachable.
6. Switch availability. Pending leaves the previous position; rejection/network failure must not
   falsely show online. Successful responses set the confirmed state. Confirm offline stops sharing.
   Return any production test Driver to Offline afterward.
7. Open Preorders and both tabs. Unknown counts and unsupported offline setting are explicit;
   ordinary dispatch must not appear as an advance assignment. Back returns to Home.
8. With Driver's public Mapbox token configured, verify Traffic shows actual congestion and can be
   toggled. Without it, real OpenFreeMap remains usable and no false traffic control appears.
9. Open an existing authorized offer/active trip. Verify countdown/accept/decline and lifecycle
   controls remain connected to their existing RPCs. Do not create or advance production trips just
   for visual review. Check existing navigation, route map and private rating workflows normally.

Automated checks: Driver unit tests, typecheck, scoped lint, production build and
`$env:DRIVER_PREVIEW_PORT='3012'; node tooling/scripts/driver-preview.cjs --tests`.
Screenshots live under ignored test-results/driver-*.png. Browser account/GPS fixtures are disclosed;
the map data comes from the actual geographic provider.

## External navigation acceptance

After the Driver hosted deployment is Ready, reopen the installed app and use an existing
authorized active trip. Navigate to pickup and destination should open an installed maps app
with the correct coordinates on Android, without the missing Mapbox-token message. Choose an
app if Android shows its resolver, then start directions there. On iPhone, confirm Apple Maps
still opens directions. Return to ESH and confirm the trip state and live map remain intact.
This hosted change needs no new native build or migration. Actual device launch remains an owner
acceptance check; unit/browser mocks do not prove installed maps availability.
