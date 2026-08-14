# Completed-Trip Refund and Driver Recovery V1 production test

Use a new, clearly identifiable Stripe sandbox trip. This test creates permanent refund and
recovery history.

1. Run `pnpm exec supabase db push --dry-run` and confirm only
   `20260814000200_completed_trip_refund_recovery_v1.sql`, then have the owner apply it.
2. Deploy Admin and Driver. No new environment variable or webhook event is required; Admin must
   retain the same Connect-platform `STRIPE_SECRET_KEY` used for the Rider charge and Driver transfer.
3. Create and pay for a new Rider trip, complete it, and record its Rider fare, Driver earning,
   platform fee, Driver wallet totals, and Admin ledger balances.
4. Transfer the earning to Stripe, but do not allow it to enter a connected-account bank payout.
   Confirm the Driver row says **Transferred to your Stripe balance**.
5. In Admin **Ledger → Rider payments**, locate the paid completed booking and select
   **Refund completed trip**. Enter `COMPLETED REFUND PRODUCTION TEST` and confirm the warning.
6. Confirm Stripe contains exactly one full Rider refund and exactly one reversal of the trip's
   Driver transfer. Refresh or retry and confirm neither operation duplicates.
7. Confirm Admin shows the payment as refunded and the completed-trip recovery/refund as succeeded.
8. In Admin Journal confirm these exact balanced entries:
   - Driver transfer reversal: debit cash clearing, credit that Driver's payable for the earning;
   - Driver earnings reversal: debit that Driver's payable, credit platform revenue for the earning;
   - Completed Rider trip fully refunded: debit platform revenue, credit cash clearing for the fare.
9. Confirm the net Driver payable and cash/revenue balances return by the expected amounts while all
   original completed-trip entries remain immutable.
10. In Rider, confirm the completed trip remains in history and shows the full successful refund.
    Confirm Payments shows refunded and the Rider receives the existing refund email when enabled.
11. In Driver Earnings, confirm the historical trip says its earnings were reversed, no transfer
    control is offered, and Pending/Collected/Transferred/Amount owed totals no longer include it.
12. Attempt the action as an unauthorized tenant user and confirm no Stripe or database mutation.
13. For the protected-bank-payout case, use an already allocated transfer only as a read-only check:
    confirm Admin rejects automatic recovery and instructs that manual recovery is required.

Pass requires one refund, at most one eligible transfer reversal, exact balanced recovery entries,
retry safety, preserved history, correct Rider/Driver presentation, audit, and tenant authorization.
Return the Driver offline and cancel any unfinished test booking afterward.
