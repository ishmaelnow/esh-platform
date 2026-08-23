# Mobile app shell

ESH Rider and ESH Driver use Capacitor shells around the existing deployed Next.js applications.
The shell is intentionally thin: authentication, Supabase access, Stripe checkout, maps, dispatch,
and financial operations remain in the existing web applications and server routes.

The Rider shell uses `com.esh.rider` and loads `https://rider.eshapp.com`; the Driver shell uses
`com.esh.driver` and loads `https://driver.eshapp.com`. `CAPACITOR_SERVER_URL` may override either
URL for emulator development. Cleartext traffic and mixed content are disabled by default.

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
