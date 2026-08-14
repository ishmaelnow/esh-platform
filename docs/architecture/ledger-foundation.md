# Ledger Foundation V1

## Purpose and boundary

Ledger Foundation V1 provides tenant-scoped currency semantics and immutable double-entry records.
It does not calculate fares, charge cards, hold stored value, pay Drivers, or reconcile Stripe.
Pricing and payment modules will post their financial consequences through the ledger later.

## Money semantics

Each tenant selects one operating currency from the supported ISO currency directory when its
ledger is initialized. Currency cannot change after initialization. Amounts are stored as positive
integer minor units; floating-point database amounts and balance columns are prohibited.

Initial supported codes are USD, CAD, MXN, EUR, GBP, and AUD. The currency directory records the
number of fraction digits used for display and input conversion.

## Double-entry contract

Every posted transaction has a tenant-scoped external idempotency key, description, effective time,
actor, and optional booking reference. It contains at least two entries, and total debits must equal
total credits. A deferred database constraint independently enforces the balance at commit.

Transactions and entries cannot be updated or deleted. Corrections must be new reversing or
adjusting transactions. Reusing an external key with identical content returns the original
transaction; reusing it with different content fails.

Manual Ledger Reversals V1 now provides a linked, reasoned inverse for tenant-admin `manual:*`
journals. Automated domain postings remain excluded because their operational state must be
recovered together with the ledger rather than corrected in isolation.

Initialization creates five generic accounts: cash/payment clearing, Rider receivables, Driver
payables, platform fee revenue, and operating adjustments. Account balances are derived from entries
and are never stored as mutable totals.

## Authorization and audit

The `finance.ledger` tenant capability is separate from Driver Management. Tenant owners and tenant
administrators may initialize, read, and post only when it is enabled. RLS restricts all tenant
financial tables. Browser roles have select access under RLS but no direct mutation grants; writes
use security-definer RPCs. Initialization and each posting create tenant audit events.

Riders and Drivers have no ledger access in V1. Raw payment credentials, processor secrets, card
data, bank data, and Stripe objects never belong in these tables.

## Deferred

- fare quotes and trip pricing;
- Rider charges, refunds, wallet balances, and payment methods;
- Driver earnings, transfers, and payouts;
- domain-specific automated reversals;
- Stripe integration and webhooks; and
- multi-currency tenant ledgers.
