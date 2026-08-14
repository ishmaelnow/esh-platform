# Driver Earnings Statements V1

Driver Earnings Statements provide a date-bounded, read-only report over the existing Driver wallet
and Stripe bank-payout reconciliation data. The feature creates no mutable balance, ledger posting,
transfer, payout, or tax record. Driver identity and tenant isolation continue to come from the
role-derived wallet and payout RPCs.

For each completed trip, the statement shows the locked Rider fare, Driver earnings, platform fee,
and whether the earning is pending Rider collection, collected, or transferred to Stripe. Period
totals use integer minor units. Stripe-reported bank payouts are listed and totaled separately:
V1 has no transfer-to-payout allocation, so it must not imply that a particular bank payout contains
a particular trip.

Drivers select an inclusive local-date range, print the statement, or download CSV. CSV contains
ESH booking and payout record identifiers but excludes Stripe processor IDs, card/bank details,
secrets, Rider identity, and tax identifiers. Printed and downloaded reports are generated locally
from the already authorized projection and cause no financial mutation.

V1 is an operational earnings statement, not a tax form. Deferred: server-generated PDFs, tenant
time-zone period closing, statement snapshots, transfer-to-payout allocation, adjustments and
reversals, processor fees, annual tax forms, and Admin statement generation.
