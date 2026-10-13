# Received-rating and review-decision alerts

Migration `20261013000200_rating_update_notifications.sql` extends the existing rating, appeal,
notification outbox and native-attempt infrastructure. It does not change submission windows,
disclosure, moderation, booking, payments, auth, or matching. No historical notification sweep.

After a new rating, the rated participant gets one generic event keyed by rating ID and product.
Availability is completion plus seven days, or immediately when the recipient has also rated.
A second submission brings the already queued event and unattempted native delivery forward.
Existing submission RPCs and the producer serialize on the booking. Existing hidden ratings are
not queued; hiding a rating before delivery makes its event ineligible. Restoring a previously
suppressed event is not a new notification lifecycle. A newly submitted reciprocal rating may
make a preexisting rating newly disclosed, without a bulk backfill of historical records.

An appeal transition from submitted to upheld/removed creates one event keyed by appeal ID and
appellant product. Only the appellant receives it; the opposite participant receives no review
reason or decision information. Repeating an identical Admin decision cannot duplicate the event.
The existing rating/review actions retain their audit records; delivery is logged in the outbox
and per-device attempts rather than duplicating sensitive text into audit metadata.

Queueing requires the completed booking's current active participant, active tenant, authenticated
active person, a recipient email, and either trip email enabled or an opted-in device channel.
Trip email opt-outs remain independent of native/Web Push consent. Enabling later does not sweep
missed events. Drivers use their existing trip email preference, not earnings/evidence preferences.
Existing preference triggers mask queued email after opt-out. No SMS for these events.

The service-only `reputation_alert_current` predicate rechecks current tenant, person, profile,
booking ownership, exact subject rating or appellant appeal, disclosure/moderation and 24-hour
expiry before email/Web delivery and native claim. An appeal decision remains eligible after the
rating is hidden. Native registrations retain session, generation, expiry and retry checks.
Internal producer helpers cannot be called by anon/authenticated clients. Raw tables and existing
RLS are unchanged; no new client table grants. Source IDs stay server-side.

Outbox payloads contain only booking/tenant routing and server-side rating/appeal ID. Email and
device alerts contain no score, comment, person/address or review explanation. Native payloads
carry only validated product, tenant, notification type and booking ID; arbitrary URLs are ignored.
Received and reviewed links reuse `view=ratings` with `rating=received` or `rating=review`.
Rider opens the exact owned trip card in history (or the existing older-trip fallback); Driver
opens the exact route/participant card in Ratings. Focus goes to rating details, with no submission
form opening or misleading 'already rated' reminder message. Existing reminder links are preserved.
Unknown/foreign targets provide no foreign data; all actual reads still use owned RPCs.

The existing protected Admin minute cron delivers due events, including seven-day disclosure,
and recovers email/Web independently after native claims. Both native and outbox delivery expire
24 hours after availability; existing bounded provider retries remain. There is no new cron,
credential, environment variable or APK/IPA requirement. Apply the migration before the hosted
Admin/Rider/Driver release. Provider acceptance is not proof of receipt. Already in-flight or
accepted alerts cannot be recalled; provider retries retain existing at-least-once limitations.

Minimal disposable PostgreSQL checks use actual relevant migrations, not the full Supabase chain.
Physical delivery, real-account access and concurrent production acceptance remain owner checks.
See [manual acceptance](../operations/rating-update-notifications-manual-test.md).
