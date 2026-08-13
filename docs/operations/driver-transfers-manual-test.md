# Driver Transfers V1 production test

1. Confirm Rider and Driver use the same Connect-enabled Stripe sandbox. Use a newly collected trip;
   never select an earning created under an older Stripe environment.
2. Confirm the Driver connected account is enabled and its transfers capability is active.
3. Dry-run the database push and confirm only `20260813000100_driver_transfers_v1.sql` is listed,
   then have the owner apply it.
4. In Driver **Earnings**, locate the new paid completed trip and select **Transfer to Stripe** once.
5. Confirm the trip changes to **Transferred to your Stripe balance**, Collected earnings decreases
   by the trip share, Transferred to Stripe increases by the same amount, and ledger amount owed
   decreases by the same amount.
6. In the RideEasy Connect Test platform, confirm one Transfer exists for the exact Driver share and
   destination connected account. Confirm the Rider charge retains the platform fee remainder.
7. In Admin Ledger, confirm `Driver earnings transferred to Stripe` debits the Driver payable and
   credits cash/payment clearing for the same amount.
8. Refresh, sign out/in, and press the control again if still available. Confirm no duplicate Stripe
   transfer or ledger transaction is created.
9. Confirm an old-sandbox paid trip fails with a platform-payment verification error and creates no
   Stripe transfer or ledger settlement.

Pass requires exact amount, correct destination, platform provenance enforcement, idempotency,
tenant/Driver privacy, balanced ledger settlement, and language that distinguishes transfer from
bank payout. The test bank fixture ending `2227` can simulate a later payout issue but does not
invalidate a successful platform-to-connected-account transfer.
