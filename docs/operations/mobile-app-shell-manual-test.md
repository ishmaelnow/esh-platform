# Mobile app shell manual test

1. From `apps/rider`, run `pnpm mobile:sync` after adding the Android or iOS platform with the
   Capacitor CLI. Open the generated project in Android Studio or Xcode and build a debug app.
2. Confirm the Rider shell opens `https://rider.eshapp.com`, preserves the ESH title/icon area, and
   does not expose any server-only environment value in the bundle.
3. Sign in with a test Rider account. Confirm the same-browser PKCE flow completes inside the app.
4. Request a clearly labeled test trip, view its map, and confirm the existing booking and payment
   flows behave as they do on the web.
5. Repeat steps 1–4 from `apps/driver` using `com.esh.driver` and `https://driver.eshapp.com`.
6. On Android emulator development only, set `CAPACITOR_SERVER_URL=http://10.0.2.2:3001` for Rider
   or `http://10.0.2.2:3002` for Driver and use a local dev server. Do not ship an HTTP URL.
7. Verify native push and background-location work are not reported as enabled until APNs/FCM and
   platform location review are completed. Restore test availability and cancel unfinished trips.
