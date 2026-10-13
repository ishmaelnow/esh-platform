# Saved coverage map acceptance

Owner commits/pushes reviewed source and confirms Admin and Transportation Ready. No database
migration, Codemagic rebuild or new secret. Use each project's existing public map configuration.

1. Open the intended company's Service areas page. Coverage map appears above the saved cards.
   All service areas shows their geographic circles; navy is active, gray inactive.
2. Select a saved area. The camera fits its full circle. Confirm center/radius match the saved
   card: for example, use the owner's existing Dallas Core 25km, DFW 70km or Philadelphia 40km
   records when those belong to the selected company. These values are not production defaults.
3. Drag, zoom and rotate. Streets stay interactive and attribution remains visible. Choose All
   service areas again to refit the saved circles. Zooming must not change the geographic radius.
4. Existing create/edit/deactivate/coverage-mode controls remain present. Merely viewing or moving
   the map must not save or activate anything. Do not change production boundaries just to test
   rendering; use controlled test data for mutation acceptance and restore settings afterward.
5. After a normal authorized save/refresh, the map should use saved values, not an unsaved draft.
   Switch companies: no old tenant circle remains. Empty companies show the existing empty state.
6. Check 414 × 896, 320px and desktop for overflow, readable labels, complete circles, usable
   controls and attribution. Test provider/network failure: saved center/radius and Edit stay usable.
   Restore connectivity and use Retry coverage map to recover without editing an area.
7. Confirm ordinary booking service coverage, Driver area selection and live-location validation
   still follow existing rules. This release changes only visibility of those saved boundaries.

Local verification:

    node tooling/scripts/trip-support-preview.cjs --coverage

This uses local Transportation with nonsecret identity/basemap fixtures; no production writes or
real coverage changes. Unit tests validate spherical distance independently of map zoom/pixels.
Production basemap availability and actual-company visual acceptance remain owner checks.
