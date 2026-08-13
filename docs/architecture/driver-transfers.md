# Driver Transfers V1

Driver Transfers V1 moves one completed, collected trip earning from the ESH Stripe platform
balance to that Driver's enabled Stripe connected-account balance. It does not claim that Stripe
has completed the later payout from the connected balance to the Driver's bank.

The authenticated Driver chooses a single eligible trip. A server-only preparation RPC verifies
trip ownership, completion, locked Driver earnings, a paid Rider payment, and an enabled connected
account with active transfers capability. Before creating the transfer, the Driver server retrieves
the recorded PaymentIntent with its current platform key. This prevents an earning collected in a
different Stripe sandbox or platform account from being transferred accidentally.

Stripe receives the connected-account destination, the original charge as `source_transaction`,
booking metadata, and a stable transfer-record idempotency key. Only after Stripe accepts the
transfer does the database post a balanced immutable journal: debit the Driver-specific payable and
credit cash/payment clearing. Transfer records are tenant-scoped, Driver-readable, manager-readable,
and service-only mutable. Retry cannot duplicate either Stripe movement or ledger settlement.

Connected-account bank payout event reconciliation is delivered in the next slice. Deferred:
automatic batching, ESH-created scheduled or instant bank payouts, transfer-to-payout allocation,
reversals, refunds, disputes, processor fees, reserves, minimum thresholds, and tax reporting.
