# Scheduled Rider Bookings

Riders may choose **Ride now** or **Schedule for later**. Scheduled pickup input is interpreted in
the tenant's configured time zone and stored as `timestamptz`.

## Tenant controls

Tenant administrators configure:

- minimum booking notice (default 60 minutes);
- maximum advance window (default 90 days);
- dispatch lead time (default 30 minutes); and
- reminder lead time (default 24 hours).

The database enforces these limits. A scheduled booking remains in `scheduled` and cannot be
offered to a driver. When `dispatch_ready_at` is reached, an idempotent activation function moves
it to `requested`. Rider, Driver, and Admin refresh paths invoke activation; the notification cron
also queues due reminders. A database-native `pg_cron` job runs activation every minute so the
transition does not depend on an open browser.

Rider creation stores the scheduled booking and its verified permanent map coordinates atomically.
If coordinate validation fails, neither the scheduled booking nor its audit/notification work is
committed.

## Notifications and lifecycle

Creation queues a scheduled confirmation. The daily worker queues one reminder inside the tenant
reminder window. Dispatch activation queues a distinct “finding a driver” message. The existing
acceptance, arrival, trip-start, completion, continued-search, and cancellation notifications then
continue unchanged.

Riders may cancel scheduled trips before dispatch or any later pre-trip state. The same RLS,
ownership, audit, outbox, retry, and Resend webhook contracts apply.

## Deferred

- recurring schedules;
- advance driver reservation;
- automatic matching;
- pricing and payment authorization;
- route-duration-aware dispatch lead time; and
- SMS or push reminders.
