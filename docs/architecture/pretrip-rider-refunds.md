# Pre-trip Rider Refunds V1

A paid Rider or authorized tenant finance manager may cancel a paid booking before `in_progress`.
The server verifies ownership or ledger-management authority, retrieves the database-backed Stripe
PaymentIntent, and creates one full refund with a stable idempotency key. Stripe card credentials
remain outside ESH.

The booking is canceled only after Stripe accepts the refund. ESH then marks the payment attempt
refunded and posts an immutable balanced reversal: debit Rider prepayments and credit cash/payment
clearing. Pending offers are canceled, assignment references are cleared, and the transition is
tenant audited. Refund records are tenant isolated and Rider/manager readable.

Completed and in-progress trips are excluded because their fare, Driver earnings, and possibly a
Stripe transfer already exist. Those cases require a reviewed recovery/negative-balance policy and
must not be silently reversed.

Deferred: partial refunds, cancellation fees, completed-trip refunds, transfer reversals, disputes,
externally initiated refund reconciliation, notifications, and Driver negative balances.
