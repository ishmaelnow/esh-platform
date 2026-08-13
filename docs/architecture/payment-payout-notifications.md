# Payment and Payout Notifications V1

Financial lifecycle emails use the existing tenant-scoped notification outbox, Resend delivery,
retry, and delivery-webhook contracts. Database triggers queue immutable, deduplicated events after
the authoritative state transition: Rider payment paid, Rider refund succeeded, Driver earnings
allocated, Driver transfer succeeded, and Stripe connected-account bank payout created, paid, or
failed. Notifications never establish financial truth and never create ledger or Stripe mutations.

Riders control payment/refund emails separately from trip-status emails. Drivers control earnings,
transfer, and payout emails separately from evidence-expiration reminders. Disabling a financial
preference cancels only queued/failed financial messages for that profile; already delivered records
remain historical. Preference changes are tenant audited.

Payloads contain only the minimum message context: profile display name, amount/currency, relevant
trip addresses, expected payout arrival, or sanitized failure explanation. They exclude processor
secrets, bank/card details, provider PaymentIntent IDs, transfer IDs, and payout destination data.
Rider messages deep-link to `view=payments`; Driver messages deep-link to `view=earnings`.

V1 is email-only. Push/SMS, Admin financial alerts, configurable event-by-event preferences, digest
delivery, and retroactive notification generation are deferred.

Automatic delivery is event-driven. After an authoritative payment, refund, earnings, transfer, or
bank-payout transition commits, the trusted Rider or Driver server requests a tenant-scoped outbox
delivery from an internal Admin endpoint. Trip completion uses a Driver-authenticated server bridge
because the lifecycle RPC is called from the browser. Admin-originated refunds invoke the same
delivery service directly. Callers provide only a tenant ID; they cannot provide recipients,
templates, or message content.

The internal endpoint is protected by one high-entropy `NOTIFICATION_DELIVERY_SECRET` shared only by
the Admin, Rider, and Driver server runtimes. Rider and Driver also receive the exact
`NOTIFICATION_DELIVERY_URL`; neither variable is public or browser-readable. Admin remains the only
application with Resend credentials and rendering/delivery authority.

Delivery requests are best-effort and time-bounded. A missing configuration, network failure, or
email-provider failure never reverses a committed financial transition or causes it to appear
failed. The durable outbox, claim/retry rules, Admin **Deliver queued** control, and once-daily cron
remain recovery paths. Event and outbox deduplication prevent repeated webhooks or delivery requests
from producing duplicate financial messages.
