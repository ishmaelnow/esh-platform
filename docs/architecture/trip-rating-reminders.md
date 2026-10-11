# Trip rating reminders

Ratings already exist. This feature adds one optional reminder per participant, due ten minutes
after a newly completed Rider/Driver trip. It does not backfill historical trips, repeat daily,
announce received ratings, expose a score/comment, or change the seven-day mutual-disclosure
rule, 30-day submission window, moderation or dispatch policy.

The completion trigger queues only active tenant/person/product profiles with an authenticated
identity and deliverable email identity. Existing trip email preferences and independently active
Web/native registrations decide whether a row is needed. An immutable booking/role dedupe key
prevents duplicate reminders. Payloads contain only booking ID and tenant slug; templates ignore
arbitrary URLs and all names, addresses, ratings and comments. No SMS is sent.

The existing Admin minute worker recovers due email/Web rows and independently claims native
attempts. Native attempts are not claimable before the reminder is due. Reminders expire after
24 hours; existing attempt limits, session validation, disabled-device handling and ownership checks
remain intact. `rating_alert_current` is service-only and rechecks completed-trip ownership,
tenant/person/profile status, due/expiry and absence of that participant's rating. Email preferences
are rechecked by the existing claim-update masking trigger. Web subscriptions and native device
registrations retain their existing independent consent mechanisms. No new cron or secrets.

Submitting a rating cancels its unsent outbox row and expires pending/failed/sending native attempts.
Other participants' reminders are unaffected. A notification already accepted by an external
provider cannot be recalled, and a send racing a submission can still arrive; the opened form
shows that the trip was already rated. No financial or trip lifecycle records are rewritten.

Email/Web links use known app origins with `view=ratings`, validated booking UUID and tenant slug.
Native payloads whitelist product, notification type, tenant and booking. Rider selects its existing
provider and opens Trips/ratings; Driver opens Ratings. Both focus only a card returned by their
existing owned reputation RPC. Unknown, other-account, submitted or expired targets have clear
messages; URL hints never grant access. Focus happens once per target so refreshes do not interrupt
typing. Existing score/comment forms and submission RPCs are reused. Native callback/session behavior
is preserved and no native rebuild is required.

Migration: `20261011000200_trip_rating_reminders.sql`. Local minimal PostgreSQL smoke validates
queueing, delay, role dedupe, email-off/device-on, submission cancellation, expiry and service grants;
it is not a full Supabase production certification. Owner applies/deploys and performs device checks.
