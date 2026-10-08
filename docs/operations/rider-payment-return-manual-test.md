# Rider payment-return acceptance

2026-10-08: owner confirms automatic return to the app passed after release 51b1a53.
This confirms the tested device path; no separate cross-platform acceptance is implied.

Owner checkpoint, 2026-10-07: checkout X returned to the installed app, and a second current ride
was blocked while a valid ride remained pending. Active-ride guard release is 0ec12c2.
Owner subsequently completed payment, selected Return to ESH app from the browser/app choices,
and confirmed successful app handoff. Owner then confirmed the paid trip appears only once after
the requested reopen check. Successful-payment return and single-booking reopen recovery passed. Closing the
sheet with X alone does not verify the dedicated cancelled-return link or server cancellation state.

## Release

Owner commits/pushes the scoped hosted Rider changes and verifies Rider Vercel Ready at that commit.
No migration, Codemagic rebuild, Supabase Auth setting, app-domain change or Driver release is needed.
The currently installed Rider already registers the custom scheme and includes the App/Browser
plugins. Keep all working authentication/session/camera behavior and original bundle IDs.

Stripe sessions created before this change retain their original URLs. Do not recreate, refund or
charge the previously successful payment solely to test the new handoff. Do not share live checkout
URLs, magic links, tokens, card details or private financial identifiers.

## No-charge checks first

1. Confirm the approved home/map/booking and Home/Work shortcuts remain unchanged after deployment.
2. In a desktop browser, open `/payments/return` without parameters. Expect an incomplete-link
   message and Open Rider, with no payment claim or arbitrary outbound destination.
3. The isolated preview suite covers complete return URLs with fixture UUIDs and a mock iOS bridge.
   It checks Return to ESH Rider, browser fallback, cancellation, duplicate return, foreign-app
   denial, server ownership and an already-booked trip without any collection or booking mutation.
4. On the installed iPhone, the owner can use a deliberately fabricated non-production UUID only
   to verify the handoff button and sheet dismissal. Never fabricate business records or interpret
   such a link as a successful payment. Use the real signed-in test provider slug; the server must
   refuse any unavailable/unowned quote. Do not publish the actual account or return URL in logs.

## Controlled payment acceptance

New app-started checkout sessions now attempt app return automatically on both success and
cancellation. Browser-started sessions still return to browser home. If automatic handoff is
blocked, use the retained Return to ESH Rider link. Test a new session after deployment; old
sessions retain their original return URLs. Confirm success and cancellation on iOS/Android;
do not repeat a successful charge merely to test the new default.

Perform only with owner-approved sandbox/test payment settings or an otherwise authorized real trip.
Do not switch shared production Stripe settings merely to run this test.

1. Use the signed-in installed iPhone Rider and a clearly identifiable test booking. Open checkout
   through the ordinary existing button. On cancellation, expect the dedicated return page; tap
   Return to ESH Rider. The Safari sheet should close, account should remain signed in, and the
   app should report cancelled without claiming payment or creating a booking.
2. For an authorized successful checkout, tap Return to ESH Rider if iOS has not already handed off.
   Verify sheet dismissal and the correct Rider app/account/provider. A success URL alone must not
   set paid; confirmation comes from the server/webhook. If the webhook already created the ordinary
   booking, Trips should open and show that single booking.
3. Repeat the same return link during this app session. It must not open a new checkout or create a
   second booking. Reload recovery remains server-owned and idempotent. Check recurring occurrence
   return separately: preserve its identifier; an already-booked occurrence opens Trips, while paid
   unbooked recovery retains the existing request step.
4. A wrong app scheme, provider, quote, fragment or path must not bind payment to another Rider.
   Sign out or switch provider while status is pending; stale polling must not confirm a new account's
   trip. Network failure must offer status recovery rather than a second charge.
5. Repeat normal browser checkout and installed Android handoff. Browser return remains HTTPS home;
   Android custom-scheme handoff uses the already-declared auth host. Check Android supported links
   if the email flow unexpectedly opens a PWA; do not change its working session adapter.

Close/cancel unfinished test bookings and return test Drivers Offline. Preserve existing successful
financial lifecycle records. Record device/build, deployed commit, handoff/sheet result and whether
the server had already booked the quote. No real payment/device acceptance was performed by Codex.
