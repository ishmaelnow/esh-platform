# Mobile app shell manual test

1. From `apps/rider`, run `pnpm mobile:sync` after adding the Android or iOS platform with the
   Capacitor CLI. Open the generated project in Android Studio or Xcode and build a debug app.
2. Confirm the Rider shell opens `https://rider.eshapp.com`, preserves the ESH title/icon area, and
   does not expose any server-only environment value in the bundle.
3. In Supabase Authentication URL Configuration, add these allowed redirect URLs:
   `https://rider.eshapp.com/auth/callback`, `com.esh.rider://auth/callback`,
   `https://driver.eshapp.com/auth/callback`, and `com.esh.driver://auth/callback`.
4. Confirm `https://rider.eshapp.com/.well-known/assetlinks.json` returns HTTP 200 with the
   `com.esh.rider` package and the APK's SHA-256 debug fingerprint. Install the freshly built Rider
   APK, open a Rider sign-in email on the Android device, and confirm the HTTPS link opens ESH Rider
   rather than the browser and completes the PKCE session. If App Link verification is unavailable,
   test the fallback directly with `adb shell am start -W -a android.intent.action.VIEW -d
   "com.esh.rider://auth/callback?tenant=<tenantSlug>"`.
5. Request a clearly labeled test trip, view its map, and confirm the existing booking and payment
   flows behave as they do on the web.
6. Repeat steps 1–5 from `apps/driver` using `https://driver.eshapp.com/auth/callback` and
   `com.esh.driver://auth/callback`. Confirm the Driver HTTPS callback opens the installed app or,
   without the app, completes sign-in in the browser at `/auth/callback`.
7. On Android emulator development only, set `CAPACITOR_SERVER_URL=http://10.0.2.2:3001` for Rider
   or `http://10.0.2.2:3002` for Driver and use a local dev server. Do not ship an HTTP URL.
8. Verify native push and background-location work are not reported as enabled until APNs/FCM and
   platform location review are completed. Restore test availability and cancel unfinished trips.
