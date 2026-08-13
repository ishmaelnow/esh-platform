# Driver Bank Payout Reconciliation V1

Stripe transfers move ESH funds into a Driver's connected Stripe balance. Stripe bank payouts are
a separate lifecycle that can be automatic or manual and can remain pending, enter transit, be
paid, fail, or be canceled. This feature records that lifecycle from signature-verified connected-
account webhook events without claiming that a transfer itself reached the bank.

The existing Driver Connect event destination listens for `payout.created`, `payout.updated`,
`payout.paid`, and `payout.failed` in addition to `account.updated`. The signed event's connected
account context resolves the tenant and Driver; browser-supplied identity is never accepted. ESH
stores processor identifiers, amount/currency, status, timing, method, and bounded failure details,
but no bank account or identity data. Replayed and out-of-order lifecycle events upsert one payout
record and audit status changes.

No ledger posting occurs for a bank payout. The platform cash and Driver payable were already
cleared when ESH created the Stripe transfer, and the subsequent payout moves funds solely between
the connected Stripe balance and the Driver's external account. Driver and Admin surfaces expose
operational status under tenant RLS.

Deferred: ESH-created manual/instant payouts, payout scheduling, transfer-to-payout allocation,
reversal accounting, refunds, disputes, processor fees, reconciliation reports, and notifications.
