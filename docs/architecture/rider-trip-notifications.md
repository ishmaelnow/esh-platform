# Rider Trip Notifications

## Purpose

Verified riders may receive transactional email as their dispatch booking moves through the shared
trip lifecycle. This feature extends the existing notification outbox, Resend delivery worker,
retry policy, delivery history, and webhook tracking rather than introducing a Rider-only sender.

## Events

The database queues an idempotent notification for Rider-created bookings when:

- the booking is created;
- a driver offer expires or is declined and dispatch resumes searching;
- a driver accepts;
- the driver arrives;
- the trip starts;
- the trip completes; or
- the booking is cancelled by either Rider or Admin.

Driver identity and vehicle description are included only in the accepted event and later portal
state. Booking receipt and searching messages do not expose driver information.

## Delivery

`notification_outbox` remains the durable source of delivery state. Rider events use the same
claim, retry, Resend message tag, and webhook delivery update contracts as Driver notifications.
The Admin notification worker delivers queued work during its scheduled run, and tenant
administrators may use the existing **Deliver notifications** control for immediate operational
delivery or retry.

`NEXT_PUBLIC_RIDER_APP_URL` is read by the Admin server when it builds the canonical link in Rider
emails. It must point to the production Rider origin and never contains a secret.

## Preferences

Every Rider profile receives a default preference with trip update emails enabled. A verified
Rider may turn trip update emails off or on from the Rider portal. Disabling the preference:

- prevents future lifecycle events from being queued;
- cancels that Rider's queued or failed trip emails; and
- does not affect Supabase authentication emails.

Preference changes are tenant audited. RLS and security-definer RPCs derive the Rider identity from
`auth.uid()` and do not accept a caller-provided Rider profile ID.

## Deferred

- SMS and push delivery
- marketing messages
- tenant-customizable templates
- per-event preference switches
- localization
- scheduled booking reminders
