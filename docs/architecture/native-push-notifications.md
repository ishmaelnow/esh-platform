# Native Rider and Driver notifications

Support response alerts add generic `rider_support_update` and `driver_support_update` events with validated case/booking
routing and recipient-access rechecks. The existing minute job also recovers only support email/Web
Push events after independent native claims. Existing email/device preferences apply. See
[Trip support](trip-support.md) and [Driver support](driver-trip-support.md). Rider response alerts
are owner-deployed and accepted. Driver migration 20261010000600 and hosted rollout are pending;
no native rebuild or new credentials are required.

Private [trip messages](trip-messages.md) adds generic recipient-specific device events with no body
in alerts, no email/SMS and cancellation of queued alerts when the conversation closes. Its migration
and hosted release are pending; existing device consent and provider retry rules are preserved.

Driver Preorders adds generic availability/reservation events, fixed validated Preorders tap
routing and stale-availability suppression. Email/mobile choices remain independent. See
[Driver Preorders](driver-preorders.md); its migration and hosted release are pending.

Status: owner-deployed; device receipt verified on iPhone and Android. Independent scheduling is
deployed as 3e8ff47 with scheduled HTTP 200 owner-confirmed. Controlled
provider-failure recovery remains a separate diagnostic; owner confirms tap routing and sign-out
checks passed and accepts the notification release.

Admin is the only sender. Firebase is a delivery provider, not an authentication or database
replacement. Android uses FCM HTTP v1 for project esh-platform-609d3; iOS uses production APNs with
the existing com.esh.rider and com.esh.driver topics. Community is outside this feature.

## Ownership and consent

An authenticated Rider or Driver explicitly enables each installation. OS permission alone does
not enable account alerts. The role-derived RPC checks the expected auth user, active tenant,
owned product profile and live Supabase session. A persistent installation UUID is nonsecret;
device tokens remain in memory on the client and service-only RLS tables on the server. Raw tokens,
credentials and provider responses are excluded from audit metadata and user-facing errors.

Registration generations are immutable. Token, account, tenant or session rebinding disables the
previous generation and inserts a new ID. Existing delivery attempts cannot inherit a newly bound
account. Sign-out/provider changes disable registration before changing the authenticated context;
failure keeps the context intact and asks the user to retry. Foreground resume refreshes the binding
without requesting permission again. Missing, expired or inactive auth/profile/tenant bindings are
not eligible for delivery; Driver delivery currently requires an active profile.

Native controls are gated by NEXT_PUBLIC_NATIVE_PUSH_ENABLED=true and configured shells at least
Rider 1.0.3 / Driver 1.0.5. Older shells show an update/unavailable state. Web Push stays browser-only.
Neither Firebase auth nor a new session-duration policy is introduced.

## Delivery contract

After the pending channel-preference migration, email choices and device consent independently
enable existing notification_outbox events. See notification-channel-preferences.md. An insert
queues attempts only for existing opted-in matching registrations; there is no historical replay or
duplicate business-event trigger. Attempts are independent of email delivery_status. Admin delivery
and the protected /api/cron/native-notifications endpoint process them.

Claims use row locks, unique claim IDs and compare-and-set completion. A worker claims at most five
messages to keep sequential provider timeouts within its two-minute lease. Unconfigured platforms
cannot occupy a configured platform's batch. Failed attempts back off exponentially, stop after
five tries, and expire. Offers expire at their actual offer deadline and must still be pending;
other events expire fifteen minutes after availability. Inactive bindings, revoked/expired sessions,
cancelled notifications and registrations not refreshed for thirty days are discarded. Dead provider
tokens expire only their immutable registration generation.

Provider acceptance is recorded as accepted, never claimed as device delivery. Provider acceptance
followed by a crash before persistence can produce an at-least-once retry; IDs/tags reduce duplicates.
A message already accepted or in flight cannot be recalled by sign-out. Payloads therefore contain
only generic status and product/tenant routing, with no addresses, names, fares, financial or document
details. Taps validate product/provider and open existing authenticated Trips/Dispatch screens;
payload URLs are not trusted.

## Release boundary

Migration 20261006000100_native_push_notifications.sql adds only native registrations, attempts,
RPCs and the outbox trigger; it does not mutate existing email/Web Push/SMS lifecycle definitions.
Server credentials live only in the Admin Vercel project. Mobile builds receive only their own
Firebase client configuration. TestFlight requires regenerated push-enabled provisioning profiles
and a signed production aps-environment entitlement. Development APNs is not supported by this
production sender.

Timely retries use the Admin-only /api/cron/native-notifications job once per minute. Owner moved
transport-platform-admin to the existing ESH Platform Admin Pro team and confirmed the plan.
The schedule is deployed as 3e8ff47; owner confirms repeated scheduled GET 200 responses.
The daily email cron is preserved. Other products remain in ESHA and
do not inherit this schedule. See the setup and manual-test operations documents.
