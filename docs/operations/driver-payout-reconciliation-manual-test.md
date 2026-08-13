# Driver Bank Payout Reconciliation V1 production test

1. Add `payout.created`, `payout.updated`, `payout.paid`, and `payout.failed` to the existing
   connected-account destination `esh_driver_connect`. Keep `account.updated` selected and keep the
   endpoint and signing secret unchanged.
2. Dry-run the database push and confirm only
   `20260813000200_driver_payout_reconciliation_v1.sql` is listed, then have the owner apply it.
3. Redeploy Driver and Admin. In Driver **Earnings**, confirm **Bank payout activity** loads without
   changing Pending, Collected, Transferred to Stripe, or Ledger amount owed.
4. From the Driver's Stripe Express test dashboard, use the available connected balance to create a
   standard test payout, or wait for the configured automatic payout.
5. Confirm Driver and Admin show the exact amount and initial `pending` or `in transit` status, then
   show `paid` after Stripe's success event. Expected arrival must be displayed when provided.
6. Confirm Admin Ledger receives no new journal for the bank payout and existing transfer settlement
   remains unchanged.
7. Send/replay the same Stripe test event and confirm no duplicate payout record or audit transition.
8. For failure coverage, use Stripe's payout failure fixture only after the success path. Confirm
   `failed` and its bounded reason appear, while no ledger entry is created. Replace the external
   account with the success fixture afterward.

Pass requires verified connected-account routing, one record per Stripe payout, correct lifecycle,
Driver/tenant privacy, no bank data, no duplicate audit transition, and no second ledger movement.
