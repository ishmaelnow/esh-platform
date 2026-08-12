# Rider Payments and Collection V1

Rider Payments V1 uses Stripe-hosted Checkout for a locked trip quote. Card and bank credentials are
entered only on Stripe's page and never pass through ESH. The server creates Checkout Sessions from
the database-backed quote amount and currency; browser-supplied money values are ignored.

A Rider cannot finalize a priced booking until a signature-verified Stripe webhook marks that
quote's unique payment attempt paid. Browser redirects are informational and never establish payment
truth. Stripe session creation, webhook processing, database recording, and ledger posting are
idempotent. RLS permits Riders to see only their own attempts and finance managers only their tenant.

Collection precedes trip completion, so it debits cash/payment clearing and credits Rider
prepayments. At completion, the existing fare posting creates the receivable and revenue; a second
balanced settlement debits Rider prepayments and credits Rider receivables. Driver earnings
allocation remains unchanged. This represents gross processor collection; V1 does not yet post
processor fees or bank reconciliation.

Deferred: saved payment methods, refunds, cancellation charges, disputes, processor fees,
reconciliation, invoices, off-session charging, and Driver payouts.
