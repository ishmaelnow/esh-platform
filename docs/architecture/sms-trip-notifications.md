# SMS Trip Notifications and Rider Consent

SMS supplements ESH email and Web Push for a deliberately small set of urgent transactional
events. It uses the existing tenant-scoped notification outbox as business truth; SMS delivery
never creates or changes a booking, payment, earning, or payout state.

Rider SMS is registered under ESH's parent company, **FAIR FARE COMPANY LLC**. ESH branding and
email magic-link authentication remain unchanged. A Rider may store an E.164 mobile number without
consenting to SMS. Consent is optional, unchecked by default, specific to operational ride,
account, service, and customer-care messages, and never inferred from account creation, email
authentication, terms acceptance, trip requests, or possession of a phone number.

The Rider Account screen records consent before any verification or delivery activity. Current
state is held in the service-only `sms_notification_subscriptions` table; append-only
`sms_consent_events` preserve the phone, action, server-controlled source, disclosure version, and
time of every grant, withdrawal, or phone-only save. Tenant audit events contain only the last four
digits. A consented number remains `consented_unverified`, with delivery off, until a later
verification step activates it. Withdrawal immediately disables delivery without deleting history.

The public disclosure links to `https://fairfareride.com/privacy-policy` and is versioned as
`fair_fare_esh_operational_sms_v1`. The browser can read only its own Rider-derived state through a
narrow RPC; direct subscription and history-table access remains unavailable.

Admin is the message sender. For each eligible outbox record it independently attempts email,
Web Push, and SMS. Each notification/subscription pair has an idempotent SMS attempt record;
provider rejection never blocks the other channels or reverses the underlying event. V1 records
Twilio's accepted response, not carrier handset delivery. Delivery-status callbacks, STOP/START
webhook reconciliation, localization, marketing, bulk campaigns, and tenant-authored text are
deferred.

V1 texts only new Driver offers, Rider acceptance/arrival/start/cancellation/scheduled reminders,
recurring-autopay failures, and Driver bank-payout failures. Copy is fixed and privacy-safe. It
contains no Rider or Driver name, address, fare, card/bank detail, processor reference, or login
token. Users open the authenticated ESH portal for details.

Twilio credentials are server-only. Admin uses the Messaging Service SID to send. Verification
routes prove number control; no Twilio credential is exposed through a `NEXT_PUBLIC_` variable.
The consent-foundation release neither calls Twilio nor sends an SMS. Existing Driver verification
behavior remains compatible with the shared subscription table.
