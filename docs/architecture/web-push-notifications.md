# Web Push Notifications V1

Web Push supplements the existing durable email notification foundation for time-sensitive Rider
and Driver events. Existing lifecycle triggers and `notification_outbox` remain the source of
business truth. Push delivery has an independent attempt record per notification and browser
subscription, so email success never implies push success and push failure never reverses an event.

Riders and Drivers explicitly grant browser permission and enable each browser separately. ESH
stores the browser endpoint and Web Push encryption keys under the authenticated tenant/profile;
RLS exposes no raw endpoint or encryption key to browser clients, while role-derived mutation RPCs
derive the Rider or Driver from `auth.uid()`. Disabling a browser marks its subscription
inactive and unsubscribes locally. HTTP 404/410 responses expire dead endpoints automatically.

Admin remains the only push sender. It uses one VAPID key pair and attempts privacy-safe push while
processing the same queued notification for email. Lock-screen payloads contain only generic status
such as “Your Driver has arrived” or “Automatic payment needs your attention”; they exclude names,
addresses, fares, processor references, bank/card details, and evidence contents. Clicking opens the
appropriate Rider or Driver origin where normal authentication and RLS apply. Admin delivery
operations return aggregate push success/failure counts without exposing subscription credentials.

V1 push supplements notification events that are already queued under the existing email
preferences. It does not create a second lifecycle trigger system. Deferred: native mobile push,
push-only event preferences independent of email, localization, notification actions, and
tenant-customizable lock-screen content.

Web Push is intentionally browser-only. Rider and Driver detect the Capacitor native shell and do
not show a dead browser-subscription checkbox there; they explain that native APNs/FCM delivery is a
separate deferred channel. This prevents an installed app from implying that its bundled
Push Notifications plugin is already connected to the server delivery pipeline.

SMS Trip Notifications V1 now provides a separate verified, explicitly consented urgent-text
channel with its own delivery attempts.
