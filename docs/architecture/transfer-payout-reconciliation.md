# Transfer-to-Payout Reconciliation V1

An ESH transfer moves one trip earning from the platform to a Driver's connected Stripe balance. A
later Stripe payout can combine multiple balance activities when it moves connected-account funds
to an external account. Payout webhook objects do not directly enumerate those activities.

After signature-verifying and recording an automatic connected-account payout event, the Driver
server queries Stripe's payout-filtered balance transactions in that connected-account context. It
extracts transfer source IDs and submits only those IDs plus their Stripe balance-transaction IDs to
a service-only reconciliation RPC. The database links only successful ESH transfers belonging to
the same tenant, Driver, and currency. Browser-supplied identity or amounts are never accepted.

Each allocation is immutable in identity and records the existing transfer, payout, balance-
transaction reference, and integer minor-unit amount. The payout stores matched and unmatched totals
and one of `matched`, `partial`, `unmatched`, `unsupported_manual`, or `failed`. Replayed events
replace the derived allocation set idempotently and audit only a changed reconciliation result.

Stripe documents the payout filter for automatic payouts only. Manual payouts are therefore marked
`unsupported_manual`; ESH does not guess allocation from dates or amounts. Unmatched amounts can
represent non-ESH balance activity and are surfaced for operational review.

Reconciliation creates no ledger posting. The payable/cash movement already occurred when ESH made
the transfer, and the payout remains movement inside the connected account. Driver and authorized
tenant managers can read only their tenant-scoped reconciliation data under RLS. No bank details,
card data, or Stripe secrets are stored.

Deferred: manual-payout allocation, fees and adjustments, payout reversals, dispute accounting,
scheduled reconciliation recovery, and cross-currency settlement.
