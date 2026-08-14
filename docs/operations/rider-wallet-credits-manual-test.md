# Rider Wallet and Credits V1 production test

Use clearly labeled Stripe sandbox data. Wallet and ledger history are permanent.

1. Run `pnpm exec supabase db push --dry-run` and confirm only
   `20260814000500_rider_wallet_credits_v1.sql`, then have the owner apply it.
2. Deploy Admin and Rider. No new environment variable or Stripe webhook event is required.
3. In Admin **Ledger → Rider wallets**, choose the test Rider, issue `$20.00` with reason
   `RIDER WALLET V1 TEST CREDIT`, and confirm one immutable wallet row appears.
4. Confirm Journal contains `Rider wallet credit issued`: debit operating adjustments and credit
   Rider wallet credits for exactly `$20.00`. Refresh and confirm it is not duplicated.
5. In Rider **Wallet**, confirm a `$20.00` balance and matching credit history. Sign in as another
   Rider and confirm the credit is absent.
6. Review a fare greater than `$20.00`, select **Apply wallet and continue**, and confirm Stripe
   Checkout requests only fare minus `$20.00`. Pay with Stripe test card `4242 4242 4242 4242`.
7. Return to Rider and request the trip once. Confirm Wallet becomes `$0.00`, history shows the
   applied debit, and Journal debits Rider wallet credits and credits Rider prepayments for `$20.00`.
8. Before trip start, cancel it. Confirm Stripe refunds only the card portion, Rider Wallet returns
   to `$20.00`, and history shows one restoration. Confirm Journal separately reverses the card
   prepayment to cash and wallet prepayment to Rider wallet credits.
9. Create a fare fully covered by wallet credit. Confirm no Stripe page opens, booking succeeds only
   after the explicit request button, and cancellation restores the exact credit once.
10. Complete a wallet-funded test trip. Confirm fare settlement uses the full fare, Driver earnings
    remain **Pending payment** unless the Stripe portion covers the full Driver share, and no
    unsupported transfer control appears.
11. Refresh, retry controls, and sign out/in. Confirm no duplicate credit, application, restoration,
    payment, booking, or ledger posting.

Pass requires tenant/Rider isolation, exact split checkout, reservation safety, balanced immutable
postings, correct cancellation restoration, and honest Driver funding status. Cancel unfinished
bookings and return the test Driver offline.
