# Rider map home review

This redesign is validated locally and owner-aligned. The owner performs Git push and deployment.
No Supabase migration is involved.

## Manual design preview without sign-in

From the repository root, run:

```powershell
corepack pnpm preview:rider
```

This starts Rider at port 3001 and opens a dedicated Chromium window with sample Rider data.
Use that window: an ordinary browser tab does not have the sample-data interception. Stop any
existing port-3001 server first. Close the preview browser to stop its server.

The preview uses process-only dummy configuration and browser-intercepted requests. It does not
edit `.env.local`, change Auth redirects, send emails, or submit bookings/payments. The provider
label says **Design preview · sample rides**. The window uses its actual resizable viewport with live
OpenFreeMap vector tiles; identity, history, fares, and opt-in GPS remain sample data. Restart any older
preview to load the updated fixtures. Select Request your ride, menu sections, expand booking options,
and type sample addresses to review the fare card. Payment submission is deliberately blocked.

The isolated preview starts with a clearly fictional GPS fix, navy dot, and accuracy circle.
Pickup starts empty with “Pickup address”; the harness does not automatically select an area or
resolve a fictional pickup address. Without an explicit real Mapbox preview token, reverse address
lookup reports unavailable. Close/restart older preview windows to clear their filled sample values.
Real Rider location remains opt-in. Both vector providers support road-label styling and shallow
3D buildings. Do not copy Admin configuration. Offline checks use fixture geography; a separate
`--live-verify` capture verifies the entire 414 × 896 screen using public live vector tiles.
The car is a silver sedan illustration and the action reads Request your ride.

This command is for visual review only. The real authentication and live location/payment flows
still require Rider's own verified environment and the production-test hygiene below.

## Review with Rider's verified configuration

Use the normal development server for actual account/location/search tests, rather than
`preview:rider`. Rider's own `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` must be configured by the owner. The current restored local
environment lacks a populated public key/token. Do not substitute Admin configuration or edit
authentication URLs. No-token map rendering remains live through OpenFreeMap, but real address
lookup and quoting require the established provider configuration.

1. Run the Rider application locally (`pnpm dev:rider`, port 3001). Verify the map background and
   bottom panel at 414 × 896, 320px, and desktop widths. At the reference size the panel starts at
   y=714, and the 46px white menu sits at x=24, y=64. The map remains pannable outside
   panels; controls and attribution remain accessible.
   Check the complete plus/Home/recent row, horizontal scrolling, bottom safe area, and absence of
   a right-side blank strip. With no history, recent cards are correctly absent.
2. Sign-in/provider selection and first-time profile creation remain accessible. After admission,
   only Request your ride and destination shortcuts appear initially; provider switching and sign-out are in Account.
   Request your ride opens booking; Back to map and Escape dismiss it. Unset Home opens destination
   entry. Select a real search result, save it as Home for this session, and verify Home restores
   its address and map pin. Sign-out/provider changes must clear it; no cross-device persistence exists.
3. Open the donut menu. Verify Request, Trips, Payments, Wallet, and Account. Select each section,
   confirm the menu closes, then return to Request. Use Tab/Enter, Escape, and outside dismissal.
4. Expand the ride time, select scheduled and recurring modes, and verify all required date/time
   inputs remain visible. Expand vehicle selection and pickup notes. Saved accessibility notes
   remain visible by default. Service-area selection still enables address search.
5. Review a fare using local test data. Verify the fare policy, maximum where applicable, tolls,
   payment state, and confirmation action remain visible. Do not create another production payment
   to review this design or disturb the previously recovered successful booking.
6. Inspect an authorized active trip: background Driver pin follows existing location refresh,
   vehicle identification remains visible, cancellation remains gated by trip status, and upcoming
   trips/history remain accessible. History and ratings expand only when requested.
7. Verify payment receipts, refund history, wallet history, SMS consent, notification preferences,
   and native-push-unavailable messaging on their corresponding sections.
8. Without a Mapbox token, verify live OpenFreeMap vector tiles. With failed map requests, verify an explanatory fallback and usable
   booking controls. No location permission should be requested until the Rider chooses the
   location action, unless permission was already granted (then no new prompt occurs).
9. Grant location: verify centering and actual-coordinate marker updates as the device moves.
   Drag, wheel/pinch zoom, and rotate; GPS updates must not continuously reset the camera.
   Center on my location should recenter even with destination pins. Hide/background the app and
   verify GPS watches stop; foreground resumes after grant. Sign-out must clear location.
10. Deny/revoke permission or disable location services: verify clear manual-entry fallback,
    authorized service-area map (world overview without an area), and no invented position dot.
11. Select real destination suggestions: verify pins track the returned geography. Recent trips
    must use their stored coordinates; older records without coordinates require a new search
    selection. No sample addresses or grid geography should appear in the normal app.

Automated local fixture checks (no production authentication or writes):

```powershell
$env:RIDER_PREVIEW_PORT='3011'
node tooling/scripts/rider-preview.cjs --tests
```

This command uses process-only dummy configuration and an isolated build directory.
All authentication, business responses, and map requests are intercepted with preview data.
Screenshots are written under ignored `test-results/`. Native device validation remains an owner
review step; this pass does not repair the deferred native authentication/payment-return defects.
