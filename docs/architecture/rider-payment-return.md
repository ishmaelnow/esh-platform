# Rider native payment return

## Existing gap and current change

Stripe returned native checkout to the normal Rider home URL. iOS does not guarantee that a web
redirect will reach the app's deep-link handler. The handler already called Capacitor Browser.close;
adding another unconditional close call would not repair a missing handoff.

Native ordinary and recurring checkout now return to `/payments/return` on the existing Rider
origin. New app-originated checkout URLs include `returnTo=app`; after validating the payment-return
parameters, this page attempts the existing `com.esh.rider://auth/callback` scheme automatically.
On Android, the attempt and manual app link now use an intent URI with fixed scheme and package
com.esh.rider, preserving the validated auth/callback query. This targets the installed Rider
explicitly instead of leaving a custom-scheme handler ambiguous. iOS keeps its original scheme.
The Return to ESH Rider link and Continue in browser remain available if handoff is blocked.
Chrome may require a user gesture for external app launch, so this improves targeting without
guaranteeing silent return under every browser policy. Browser-started checkouts do not opt in.
See https://developer.chrome.com/docs/android/intents for the package targeting and gesture rules.
No new domain, authentication-token transfer or payment claim is introduced.
The existing native manifests and iOS scene handler already accept this auth-host callback.
This hosted change needs no new permission, migration or native build.

Browser checkout continues to return directly to HTTPS home. Stripe's existing quote idempotency,
recurring claims, wallet split, webhook verification and booking finalization are preserved.
The request's nativeReturn boolean selects presentation only; it grants no business authority.
Old existing checkout sessions retain the URLs assigned when they were created, because Stripe
creation is idempotent by quote. Do not replace a successful session/payment to test this change.

## Callback and payment authority

Payment callback validation accepts only the current Rider origin at `/` or `/payments/return`,
or the Rider custom scheme at `auth/callback`, with a valid provider slug, success/cancelled status,
UUID quote for success, and optional UUID occurrence. Credentials, fragments, foreign app schemes,
origins and invalid paths are rejected. Only known payment fields enter a relative home URL;
a custom-scheme URL is never passed to history.replaceState.

The handler updates the in-app URL, requests Browser.close without blocking status recovery on its
animation/promise, and triggers the existing owned server status check. Auth PKCE/implicit callbacks,
Android encrypted session recovery, iOS sign-in and Driver remain unchanged. Duplicate callback
URLs are ignored by the existing in-memory processed-callback set.

A return URL never proves payment. The screen says Checking your payment and trip status until
the server reports paid. Polling is cancelled on effect cleanup; network failure offers existing
refresh recovery. A supplied provider slug is checked against the RLS-owned quote's tenant and
Rider profile before status is returned. Legacy status callers without the optional slug retain
their existing RLS-authorized behavior.

The server places bookingId inside quote. Recovery now recognizes that nested field, clears return
parameters, refreshes existing trips and opens Trips. It does not ask for another ordinary or
already-booked recurring trip. A paid, unbooked recurring occurrence retains the existing explicit
request step. Checkout cancellation clears return parameters and reports cancellation, never paid.

No new event, notification, audit mutation, refund, collection or booking mutation is introduced by
the return page. Existing server/webhook lifecycle and audit contracts remain authoritative.

## Verification boundaries

Unit/API tests cover URL validation, browser/native/recurring return URLs, owned provider status,
wallet behavior and nested booking recovery data. Mobile browser tests exercise a mocked iOS App
and Browser bridge, existing-booking recovery, duplicate callbacks, cancellation, foreign-app denial
and the 414 × 896 handoff page. These tests make no Stripe payment or production mutation.

Actual Safari sheet dismissal requires installed-device acceptance. Follow
`../operations/rider-payment-return-manual-test.md`. A mock bridge test is not proof of iOS UI behavior.
