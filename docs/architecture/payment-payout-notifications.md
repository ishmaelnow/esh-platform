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
