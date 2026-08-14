# Manual Ledger Reversals V1

Tenant finance managers can correct an erroneous manual ledger journal without updating or deleting
financial history. A reversal is a new balanced transaction containing the exact inverse of every
original debit and credit. An immutable link stores the original transaction, reversing transaction,
reason, actor, and timestamp; each original can be reversed at most once.

The role-derived RPC requires `finance.ledger`, tenant owner/admin authority, a five-to-500-character
reason, and an original `manual:*` transaction without a booking reference. It rejects automated
fare, payment, settlement, earnings, transfer, payout, and refund postings. Reversing those ledger
entries alone would contradict their authoritative booking or Stripe lifecycle and is deliberately
deferred to domain-specific recovery workflows.

Reversal entries use the original accounts and amounts with debit and credit swapped. Existing
deferred balance enforcement independently verifies the new transaction. Both ledger transactions
and their reversal link remain immutable and tenant-isolated under RLS. Repeated requests return the
existing reversal, while audit records capture the correction reason and both transaction IDs.

This feature performs no Stripe operation and changes no booking, payment, earnings, transfer,
payout, or refund state. Deferred: completed-trip refunds, transfer reversals, disputes,
chargebacks, Driver negative balances, and reviewed system-transaction recovery.
