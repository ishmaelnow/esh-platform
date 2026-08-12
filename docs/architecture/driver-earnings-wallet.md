# Driver Earnings and Wallet V1

Each tenant configures the percentage of a priced completed trip assigned to the Driver. The default
is 80%. The database locks the percentage and integer-minor-unit split on the booking at completion,
so later settings changes cannot rewrite historical earnings.

The original completed-fare transaction remains immutable. A second balanced transaction debits
platform fee revenue and credits a liability account scoped to the assigned Driver. At an 80% share,
a $48.94 fare produces $39.15 Driver earnings and a $9.79 platform fee. Existing completed priced
trips are allocated once when the migration is applied.

The Driver wallet is a read-only projection of ledger entries and completed bookings, not a mutable
balance field. Drivers can read only their own wallet through a role-derived RPC. Tenant managers can
set the future-trip share and see Driver payable accounts in the tenant ledger. Allocation is
idempotent, tenant-scoped, balanced, and audited.

Until Rider payment collection and payout rails exist, all Driver earnings are labeled pending;
available and paid remain zero. V1 does not claim that cash was collected or transferred.

Deferred: payment settlement, withdrawable-balance rules, payout accounts, payout execution,
reversals, refunds, tax reporting, statements, and reconciliation.
