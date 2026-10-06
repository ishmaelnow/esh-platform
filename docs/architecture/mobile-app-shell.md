# Mobile app shell

ESH Rider, ESH Driver, and ESH Community use thin Capacitor shells around the existing deployed
Next.js applications.
The shell is intentionally thin: authentication, Supabase access, Stripe checkout, maps, dispatch,
and financial operations remain in the existing web applications and server routes.

The Rider shell uses `com.esh.rider` and loads `https://rider.eshapp.com`; the Driver shell uses
`com.esh.driver` and loads `https://driver.eshapp.com`. `CAPACITOR_SERVER_URL` may override either
URL for emulator development. Cleartext traffic and mixed content are disabled by default.
The Community member shell uses `com.esh.community` and loads `https://app.community.eshapp.com`;
`CAPACITOR_SERVER_URL` may override that URL for emulator development. Community Administration
remains web-only. Community native sign-in uses `com.esh.community://auth/callback`; the hosted
HTTPS callback remains available for browser/PWA sign-in.

Rider Android magic-link authentication uses the verified HTTPS App Link
`https://rider.eshapp.com/auth/callback?tenant=<tenantSlug>`. The Rider manifest declares the
verified `rider.eshapp.com` callback and `apps/rider/public/.well-known/assetlinks.json` delegates
that host to `com.esh.rider`; the custom `com.esh.rider://auth/callback` scheme remains available
as a fallback. Driver Android mirrors the verified HTTPS App Link with `com.esh.driver` retained
as a fallback. iOS currently uses the custom callback schemes
`com.esh.rider://auth/callback` and `com.esh.driver://auth/callback` because Universal Links are
not yet configured. Both native callback handlers accept either a Supabase PKCE code or an
implicit-flow token fragment and establish the native session without relying on the WebView URL.
All callback URLs used by each platform must be allowed in Supabase Authentication URL
Configuration before mobile sign-in testing.

The Capacitor App, Browser, Geolocation, and Push Notifications plugins are installed to establish
the native boundary. Native push delivery and native background location require platform-specific
APNs/FCM credentials and consent work; the current web push and foreground location contracts remain
the source of truth until that follow-up is implemented. Admin remains web-only.

The installed Rider and Driver shells must not present the Web Push subscription switch as a native
notification control. A Capacitor WebView does not provide the browser service-worker subscription
contract used by Web Push. Until APNs/FCM registration, token storage, and delivery are implemented,
the apps show an explicit native-push-unavailable status and keep email and verified transactional
SMS available. The Web Push switch remains available when the hosted portals are opened in a
supported secure browser.

The hosted Rider and Driver headers import the same high-resolution launcher artwork bundled in
their Android projects. This keeps the in-app identity aligned with the installed store icon without
maintaining a second brand asset; responsive sizing preserves the lockup on narrow screens.

Hosted header artwork and device launcher artwork have separate release paths. The header changes
with the hosted deployment, while Android launcher resources change only after a higher-version APK
or AAB is built and installed through the device or store. Android release `1.0.1`/version code `2`
is the first native refresh explicitly carrying the aligned ESH launcher artwork.

iOS release `1.0.1` likewise replaces the original generic Capacitor AppIcon with a 1024×1024,
fully opaque ESH AppIcon. Codemagic assigns a unique build number during each signed TestFlight
build; the marketing version remains explicit in each Xcode project.

No secrets, Supabase service-role keys, Stripe secret keys, or Twilio credentials enter the mobile
bundle.

Rider native release 1.0.2 adds iOS camera/photo-library purpose descriptions and Android encrypted
session persistence/foreground recovery. Android session migration and sign-out remain Rider-only;
iOS authentication is preserved. Both require a new shell build. See
`rider-native-session-recovery.md` for security and release acceptance.

Driver Android 1.0.4/code 5 follows with its own encrypted session vault and foreground recovery,
preserving camera/navigation and iOS authentication. See `driver-native-session-recovery.md`.

Driver document capture uses separate HTML photo capture (image/* for Capacitor Android's capture
branch in 1.0.2, owner-reported picker fallback) and ordinary file/library inputs. Driver Android
1.0.3/code 4 replaces Take photo with explicit @capacitor/camera 8.0.0 CameraSource.Camera capture,
without gallery saving or new storage permissions. The plugin is synchronized into Android only;
iOS retains its owner-verified HTML capture and native 1.0.2. Older Android shells request an update
instead of silently substituting files. No Rider change. Ordinary file/library inputs retain
existing document-type restrictions. Android declares
an IMAGE_CAPTURE query for the bridge's camera-discovery check; its manifest change requires a rebuild.
Driver iOS includes camera/photo-library purpose descriptions for deliberate document selection;
these declarations require rebuilding and installing the native shell. No video/microphone
capture is requested. Drivers view private current evidence inside the hosted app through an
ownership-checked, short-lived signed link. See driver-applicant-portal.md for authorization and
operations/driver-application-manual-test.md for physical-device acceptance.

## Rider map home (local design draft)

The Rider home uses a persistent live map above a straight-edged bottom panel. At 414 × 896,
the map ends at y=714; an 80px Request ride row opens the existing booking form in a dismissible,
keyboard-accessible sheet. Home and Work select optional addresses persisted for the owning
Rider/provider; when unset they open destination entry. Saving verifies permanent geography on
the server. Account supports progressive Add/Edit/Remove. In-memory views clear on sign-out or
provider change; server records persist across devices. See `rider-saved-places.md` for the additive
migration and privacy contract. Recent destinations reuse booking coordinates through
the existing book-again flow; legacy records without coordinates require address search again.
A white hamburger at x=24, y=64 opens a donut menu that
opens Request, Trips, Payments, Wallet, and Account progressively, with a return-to-request action
on secondary screens. Provider switching and sign-out live in Account after profile creation;
provider selection and verified-email onboarding remain visible before admission.

Booking uses a bottom-positioned nonmodal panel with a transparent-to-white gradient on mobile
and desktop. The upper map remains bright and interactive; keyboard focus is not trapped.
Pickup/drop-off share a compact rounded card, followed by horizontal selectable vehicle cards,
a Now and Payment row, optional notes and a wide navy fare/confirmation action.
The two address rows use navy A/B circles. Vehicle cards show car beside name and the current
selected-route quote; unquoted types say Fare after route. Use my current location is in A;
Add a note for your driver expands below time/Payment. Payment expands its explanation. Scrollbar
tracks are hidden, scrolling remains available and the navy action has its own footer above safe-area padding.
Cash is not offered because the existing backend uses Stripe and wallet credit. Longer schedules and quotes
scroll within the bottom panel. Escape and Back to map dismiss it.
Scheduling and optional pickup notes expand inside the request panel. Fare
policy, maximum fare, tolls, payment state, and the confirmation action remain visible when a quote
exists. Required scheduled/recurring fields expand when that mode is selected. Stored accessibility
notes are retained inside the expandable notes control. Existing tenant authorization, RPCs, payment, consent, and notification
contracts remain authoritative. This UI change needs no database migration.

The background map uses the selected service-area center and authorized active-trip coordinates,
including the existing Driver-location refresh. Its pins
are display-only and do not determine pricing or booking validity; the existing trusted quote and
trip maps retain their road-route and ETA contracts. The first authorized service area centers the
initial map without selecting a booking area. The existing opt-in location action adds a navy
position marker and accuracy circle. Already-granted permission enables foreground GPS updates
without another prompt; Center on my location requests permission explicitly if needed. GPS runs
independently of Mapbox address search. Watches stop on hidden pages, sign-out, provider changes,
and unmount. Denial/unavailability clears the marker and offers manual pickup entry, using an
authorized service area or a world overview when none exists. Drag, pinch/wheel zoom, and rotation
are enabled. Subsequent GPS updates move the marker without continuously resetting gestures.
Mapbox Streets uses pale roads and shallow building sides;
without its token, OpenFreeMap Liberty vector tiles provide the background. Provider attribution
remains accurate. Map failure leaves booking controls usable. No offline tenant-data caching is introduced.
The fallback uses the [published OpenFreeMap style](https://openfreemap.org/quick_start/).

The mobile layout uses viewport-fit cover, explicit full-width panels, and a ResizeObserver for
the map canvas. Bottom-panel height reserves both the shortcut row and device safe area. Vector
street labels use 16px text at neighborhood zoom and white halos; buildings are almost white
with shallow extrusion on both vector providers. Lower-priority POIs, rail/path lines, and broad
area labels are hidden to reduce clutter. OpenFreeMap assets are loaded from tiles.openfreemap.org;
tile requests carry map viewport coordinates, with no Rider identity or business data attached.
The location dot represents a successful opt-in GPS fix independently of reverse-geocoding success.
Search retrieval preserves valid geographic coordinates and rejects missing/out-of-range results.
Draft pickup/destination pins use those coordinates; quote creation still sends address strings
to the existing trusted server geocoder. Browser GPS and map pins do not determine fares or tenant
authorization. Address search still needs Rider's own Mapbox public configuration; the no-token
vector-map fallback does not provide a substitute geocoding backend. No configuration was copied.

Production imports no preview fixtures. Sample identity, historical destinations, GPS permission,
and offline grid geometry exist only in tooling/scripts/rider-preview.cjs and browser/unit tests.

Manual preview uses the browser's actual resizable viewport so its panel cannot sit below the
visible desktop window. Reference checks remain 414 × 896; a 414 × 600 check covers shorter windows.
The home action reads Request ride and uses a transparent silver sedan illustration.
Booking uses a visible floating “← Home” button at the upper left and a viewport-wide gradient behind its
bounded controls. GPS pickup is directly accessible in the A row. Add a note for your driver
is a collapsed control below time/Payment. Notes remain in the submitted form while collapsed.
Service-area selection and the Trip options wrapper are removed. The panel measures its
height to pad the map camera so pickup pins remain above the controls, with attribution placed
above the gradient. Payment labels reflect quote/wallet/confirmation state; the existing Stripe
Checkout still owns actual payment-method selection. No payment method is fabricated locally.
The customer-facing payment row reads Payment until wallet coverage or confirmation is known.
The action lives outside the scrolling booking fields, with reserved space and safe-area padding;
expanded fields cannot paint beneath it. VisualViewport events constrain the panel above an open
keyboard and preserve a separate area for the floating X. Pickup/destination remain in the initial
view. The entire destination row focuses the search input with Where are you going? wording;
address lookup uses geographic proximity without a manual area prerequisite. Selected addresses retain the
existing verified coordinate contract. Focus borders and controls use navy.

Automatic coverage loads authorized service-area contexts with the signed-in tenant RPC. Selected
coordinates give early browser feedback; new quote requests send pickupCoordinates and
destinationCoordinates as permanent-geocoding hints. The server re-geocodes both addresses,
selects the nearest authorized covering center deterministically, then validates pickup radius
and the existing 800km destination limit before routing and the existing trusted quote RPC.
Client coordinates never authorize an area or determine fares. Coverage lookup failures block
pricing; uncovered trips explain that another pickup/destination is needed. Explicit serviceAreaId
requests remain supported for existing recurring routes. This change needs no database migration.

The owner pushed the map home as `1f0ff5d`; Rider deployment and public production assets were
verified read-only. The bottom booking-panel refinement remains local pending review.
No production deployment has been performed by Codex.
