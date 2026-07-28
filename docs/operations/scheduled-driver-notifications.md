# Scheduled Driver Notifications

The Admin Vercel project runs `/api/cron/driver-notifications` daily at 14:00 UTC. The job:

1. identifies the latest approved evidence for requirements configured to require expiration;
2. queues deduplicated reminders when evidence is within 30 days, within 7 days, or expired;
3. recovers interrupted notification claims and retries eligible failures; and
4. delivers up to 50 queued notifications through Resend.

Vercel invokes the route with `Authorization: Bearer <CRON_SECRET>`. Configure `CRON_SECRET` as a
random value of at least 16 characters in the Admin Vercel project for Production, Preview, and
Development. The route rejects requests when the secret is absent or incorrect.

Reminder deduplication keys include the evidence record and reminder stage. Repeated or overlapping
cron invocations therefore do not send the same stage twice. A newly approved replacement receives
its own reminder lifecycle.

Drivers can disable expiration reminders in the Driver portal. Essential account-ready, rejection,
approval, and activation notices remain enabled.

`reference_document` requirements default to expiration-required. Personal and vehicle photos default
to non-expiring. Admin approval requires a future `expires_on` date whenever the tenant requirement
has `expiration_required` enabled; the API and database trigger both enforce this rule.

## Production verification

1. Apply migration `20260728000100`.
2. Deploy Admin and Driver.
3. In Vercel Admin project settings, confirm the daily cron job is registered.
4. Set a test evidence expiration within seven days.
5. Invoke the cron from Vercel or wait for the daily run.
6. Confirm one queued/sent notification in Tenant Admin and one Resend email.
7. Invoke the cron again and confirm no duplicate reminder is created.
