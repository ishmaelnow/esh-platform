# Mobile app shell

ESH Rider and ESH Driver use Capacitor shells around the existing deployed Next.js applications.
The shell is intentionally thin: authentication, Supabase access, Stripe checkout, maps, dispatch,
and financial operations remain in the existing web applications and server routes.

The Rider shell uses `com.esh.rider` and loads `https://rider.eshapp.com`; the Driver shell uses
`com.esh.driver` and loads `https://driver.eshapp.com`. `CAPACITOR_SERVER_URL` may override either
URL for emulator development. Cleartext traffic and mixed content are disabled by default.

Magic-link authentication uses native callbacks `com.esh.rider://auth/callback` and
`com.esh.driver://auth/callback`. Android intent filters and iOS URL schemes return the email link
to the correct app; the app exchanges the Supabase PKCE code in the native shell. These two callback
URLs must be added to Supabase Authentication URL Configuration before mobile sign-in testing.

The Capacitor App, Browser, Geolocation, and Push Notifications plugins are installed to establish
the native boundary. Native push delivery and native background location require platform-specific
APNs/FCM credentials and consent work; the current web push and foreground location contracts remain
the source of truth until that follow-up is implemented. Admin remains web-only.

No secrets, Supabase service-role keys, Stripe secret keys, or Twilio credentials enter the mobile
bundle.
