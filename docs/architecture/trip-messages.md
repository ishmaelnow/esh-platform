# Private Rider and Driver trip messages

Local implementation, not deployed. Migration: `20261010000100_trip_messages.sql`.

## Scope and access

Text-only Trip messages is expandable inside Rider Trips and Driver Dispatch after acceptance,
through accepted/arrived/in_progress. No messaging before acceptance or after completion/cancellation.
No phone number is added to this feature and no third-party chat provider is introduced.

Owned RPCs require auth.uid, an active person and tenant, active Rider/Driver profiles and the
current booking assignment. The explicit product role must belong to the caller. Anonymous callers,
other Riders/Drivers and ordinary Admin clients have no message access. The RLS-enabled table has
no ordinary table grants; only controlled read/send RPCs are authenticated-accessible. Operational
service-role access remains privileged. Existing Admin notifications/audit expose metadata, not text.

Booking row locks serialize send/read with lifecycle and assignment updates. A message captures
tenant, booking, Rider and assigned Driver. Reads filter to the current assignment. Trip completion,
cancellation, reassignment or participant change deletes conversation content and cancels queued
message alerts. An already in-flight provider alert cannot be recalled; alerts never contain text.
There is no post-trip transcript, read receipt, attachment, typing indicator or moderation inbox.

## Delivery and client behavior

Messages are trimmed plain text, 1–1000 characters, rendered through React text nodes. The server
allows five messages per sender role per booking per ten seconds. A client-generated request UUID
deduplicates uncertain retries; changing the body with an existing UUID is rejected. Sends append
only after server confirmation. Audit records message ID and sender role, never body or coordinates.

The shared headless Supabase controller owns transport/retries; each app has a small local adapter
for its presentation. Open conversations refresh every five seconds while visible, on foreground
and on connectivity recovery. Drafts stay in memory only. Failed sends preserve text and request ID;
no background send/retry occurs. Closing/leaving clears local conversation state, and late responses
after unmount are ignored. Failed reads clear displayed text rather than presenting stale access.
The read API returns the latest 100 messages in chronological order.

Each confirmed message inserts a generic recipient-specific outbox event, rider_trip_message or
driver_trip_message. Email is always masked; existing SMS whitelist excludes these events. Device
alerts require existing per-installation native/Web Push consent. Native claims/retries run through
the existing Admin minute cron, so delivery is not instantaneous or guaranteed. Existing native tap
routing opens authenticated Trips/Dispatch. Browser alerts use fixed view routes, not supplied URLs.
Web Push uses the existing outbox delivery worker cadence; native alerts do not depend on email.
Private text is absent from outbox payload, provider requests and lock-screen previews.

## Release and verification

Apply the intended-only owner-reviewed migration, then deploy Rider, Driver and Admin sender.
Existing native shells suffice; no new credential, environment variable, signing or APK/IPA required.
The approved maps, booking, payment, dispatch and authentication flows remain intact.

Minimal PostgreSQL tests cover owned access, rate/size, retry, native queue despite email OFF,
assignment cleanup and no claim of cancelled alerts. Unit tests cover late-response isolation,
uncertain retries and safe parsing; mobile fixtures verify text escaping and keyboard scrolling.
These do not certify the complete Supabase migration chain, true multi-session concurrency or real
device delivery. See [manual checks](../operations/trip-messages-manual-test.md).
