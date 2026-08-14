# Rider Payment Disputes V1

Stripe disputes are processor-originated financial events, not Rider or Admin mutations. The Rider
Checkout webhook accepts dispute events only after Stripe signature verification and resolves the
affected tenant, Rider payment, booking, amount, and currency from the stored PaymentIntent.

ESH records each Stripe dispute independently because one payment can be disputed more than once.
The record retains the processor dispute reference, bounded reason, status, response deadline, and
the times Stripe reports funds withdrawn or reinstated. Rider RLS exposes only disputes attached to
that Rider's payments; finance managers see only their tenant.

Lifecycle-only events update operational state. Any dispute event can carry authoritative Stripe
balance transactions, allowing a later delivery to recover when `funds_withdrawn` arrived before
Checkout completion linked the PaymentIntent. ESH posts the exact negative net balance transaction—
disputed principal plus Stripe's reported dispute fee—by debiting operating adjustments and
crediting cash clearing. A positive reinstatement posts the exact inverse. Stable ledger external
keys make webhook replay idempotent, and audit records capture status or funds-state transitions.

For ESH's separate-charges-and-transfers model, Stripe debits the platform for disputes and does not
automatically recover a related Driver transfer. Admin therefore flags a disputed booking with a
successful Driver transfer for reviewed recovery. V1 does not automatically reverse that transfer,
alter a completed trip, revoke Driver earnings, submit evidence, or decide whether the Driver bears
the loss. Those actions require a deliberate policy and sufficient connected-account balance.

Riders see the dispute amount, reason, status, response deadline, and funds outcome in Payments.
Admin receives a searchable Disputes workspace alongside the immutable journal.

Deferred: evidence submission, automatic Driver recovery, partial funds events, negative balances,
externally created refunds, Admin notifications, and chargeback analytics.
