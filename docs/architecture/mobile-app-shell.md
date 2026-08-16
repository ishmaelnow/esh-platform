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
that host to `com.esh.rider` for the debug signing certificate. The existing
`com.esh.rider://auth/callback` filter remains as a fallback. Driver Android now mirrors the Rider
verified HTTPS App Link at `https://driver.eshapp.com/auth/callback?tenant=<tenantSlug>` with
`com.esh.driver` retained as a fallback; Driver also has a browser callback route. iOS continues
using its existing callback scheme until Universal Link work is implemented. Both native callback
handlers accept either a Supabase PKCE code or an implicit-flow token fragment and establish the
native session without relying on the WebView URL. The HTTPS callbacks and custom fallbacks must be
allowed in Supabase Authentication URL Configuration before mobile sign-in testing.

The Capacitor App, Browser, Geolocation, and Push Notifications plugins are installed to establish
the native boundary. Native push delivery and native background location require platform-specific
APNs/FCM credentials and consent work; the current web push and foreground location contracts remain
the source of truth until that follow-up is implemented. Admin remains web-only.

No secrets, Supabase service-role keys, Stripe secret keys, or Twilio credentials enter the mobile
bundle.
