# Rider map home review

The owner performs Git push/deployment. No Supabase migration or authentication/configuration
change is involved. Request ride is the approved home action; do not revert it to Order now.

## Local design preview

From the repository root in the owner's PowerShell terminal:

```powershell
node tooling/scripts/rider-preview.cjs
```

Use the dedicated browser, not an ordinary localhost tab. Close it to stop the server.
Preview identity/history/GPS/fare responses are fixtures; live OpenFreeMap tiles are used for
manual design review. It does not modify environment files, send emails or submit payments/trips.
The empty pickup and Where are you going? placeholders are intentional. Actual account/location
verification requires the normal Rider server with Rider's own public configuration.

## Real Rider review

Use `corepack pnpm dev:rider` with Rider's own Supabase public URL/key and Mapbox public token.
The restored local key/token are currently missing. Do not copy Admin configuration or alter
authentication redirects. OpenFreeMap still supplies a real map without a Mapbox token, but
address search, reverse lookup and pricing require the established Mapbox configuration.

1. At 414 × 896 verify the bright interactive map, silver car, Request ride action and full
   plus/Home/Work/recent shortcut row. Menu is a white circle at the upper left. Check safe area,
   horizontal swiping, attribution, no right strip and desktop maximum-width controls.
2. Open booking. Pickup and destination must be visible immediately. A contains Use my current
   location. B says Where are you going? and focuses search from its circle, padding or text.
   Select real suggestions and verify the chosen address and geographic pins. No service-area
   selector or Trip options wrapper remains.
3. Coverage selects automatically using verified coordinates and authorized provider areas.
   Test a pickup inside an enabled area, overlapping areas, a pickup outside all areas and a
   destination outside the existing 800km limit from the area's center. Covered outbound
   destinations outside pickup radius remain supported. Uncovered trips explain the failure;
   server coverage/geocoding must gate quoting. Client coordinates alone cannot authorize pricing.
4. Grant GPS from the A row; confirm actual coordinates resolve pickup without expanding notes.
   Deny permission or reverse lookup: show a clear manual-entry fallback and do not invent an
   address. Drag/zoom/rotate the map; GPS must not continuously override the camera. Background
   stops watches. Sign-out/provider changes clear GPS and the current saved-address view;
   saved Home/Work persist privately for the owning account/provider.
5. Swipe/select vehicles; unquoted types say Fare after route and a selected actual quote displays
   its fare. Time/Payment remain accessible. Actual payment methods are chosen in the existing
   secure checkout; wallet credit remains automatic. Cash is not supported.
6. Add a note for your driver is the optional control below time/Payment. Expand notes and time
   together, including scheduled/recurring modes. Scroll to every field. The navy action is in a
   reserved footer with at least 8px clearance, above safe-area padding. On a physical phone open
   the keyboard for notes/search; verify footer visibility and X/field clearance. Automated
   visual-viewport shrink is not a physical keyboard test.
7. Verify step-accurate Review fare / confirmation labels and fare-policy, toll, maximum and
   payment disclosures. Do not create another production payment for visual review or disturb
   the previously recovered successful booking/payment. Native auth is owner-accepted; follow
   `rider-payment-return-manual-test.md` for the local payment-return correction and device acceptance.
8. Home/Work save permanently verified geography for the owning account/provider; Account
   supports Add/Edit/Remove. Follow `rider-saved-places-manual-test.md`. Recent shortcuts reuse
   authorized stored trip coordinates. Old records without coordinates need new address selection.
   Trips, Payments, Wallet and Account remain in the donut; provider switching/sign-out are in
   Account. Check onboarding, consent, notification and receipt flows remain accessible.

## Screenshots and isolated checks

With the normal configured local Rider server running, the owner can run:

```powershell
node tooling/scripts/rider-capture.cjs
```

Sign in inside that browser and follow its terminal prompts. This injects no auth, GPS, map,
locations or fare data and submits no payments/trips. It saves complete 414 × 896 home, booking
and expanded screenshots under ignored `test-results/rider-real-*.png`. Keep private captures
out of Git. Physical keyboard validation requires the phone.

For isolated functional/layout checks:

```powershell
$env:RIDER_PREVIEW_PORT='3011'
node tooling/scripts/rider-preview.cjs --tests
```

These use process-only dummy configuration and intercepted business/map responses, not production
writes. Complete collapsed, expanded and simulated-keyboard viewport screenshots are in ignored
test-results. Do not present them as real-account or real-geography evidence. Run production build
and preview checks sequentially because build cleans the nested preview output.
