# Mobile app shell manual test

1. From `apps/rider`, run `pnpm mobile:sync` after adding the Android or iOS platform with the
   Capacitor CLI. Open the generated project in Android Studio or Xcode and build a debug app.
2. Confirm the Rider shell opens `https://rider.eshapp.com`, preserves the ESH title/icon area, and
   does not expose any server-only environment value in the bundle.
3. In Supabase Authentication URL Configuration, add `com.esh.rider://auth/callback` and
   `com.esh.driver://auth/callback` to the allowed redirect URLs.
4. Sign in with a test Rider account. Open the email link and confirm it returns to ESH Rider rather
   than a browser, then confirm the PKCE session completes inside the app.
5. Request a clearly labeled test trip, view its map, and confirm the existing booking and payment
   flows behave as they do on the web.
6. Repeat steps 1–5 from `apps/driver` using `com.esh.driver` and `https://driver.eshapp.com`.
7. On Android emulator development only, set `CAPACITOR_SERVER_URL=http://10.0.2.2:3001` for Rider
   or `http://10.0.2.2:3002` for Driver and use a local dev server. Do not ship an HTTP URL.
8. Verify native push and background-location work are not reported as enabled until APNs/FCM and
   platform location review are completed. Restore test availability and cancel unfinished trips.
