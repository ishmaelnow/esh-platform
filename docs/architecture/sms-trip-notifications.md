# SMS Trip Notifications V1

SMS supplements ESH email and Web Push for a deliberately small set of urgent transactional
events. It uses the existing tenant-scoped notification outbox as business truth; SMS delivery
never creates or changes a booking, payment, earning, or payout state.

Riders and Drivers must enter an E.164 mobile number, receive a one-time code through Twilio
Verify, and explicitly confirm it before texts are enabled. ESH stores the verified number in a
service-only subscription table. Browser clients can read only a role-derived enabled flag,
last four digits, and verification timestamp. Disabling texts immediately withdraws consent while
preserving the audit history.

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

Twilio credentials are server-only. Admin uses the Messaging Service SID to send. Rider and Driver
server routes use the Verify Service SID to prove number control; no Twilio credential is exposed
through a `NEXT_PUBLIC_` variable.
