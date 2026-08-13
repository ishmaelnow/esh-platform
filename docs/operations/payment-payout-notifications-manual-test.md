# Payment and Payout Notifications V1 production test

## Deploy

1. Deploy Admin, Rider, and Driver; existing Resend and app-URL environment variables remain in use.
2. Run the required database dry run and confirm only
   `20260813000400_payment_payout_notifications_v1.sql`, then apply it.
3. Confirm Admin's existing notification delivery cron and Resend webhook remain healthy.
4. For an immediate test, open Admin **Notifications** and select **Deliver queued**. This uses the
   same durable path as the daily automatic run; do not wait for the once-daily cron.

## Rider

1. Open Rider **Payments** and confirm **Payment update emails** is On.
2. Create and pay for a clearly identifiable Stripe sandbox trip. Confirm exactly one payment email
   shows the correct test amount and its link opens Rider directly on **Payments**.
3. Cancel before trip start. Confirm exactly one refund email shows the full test refund and its link
   opens **Payments**. The cancellation trip email remains separate when trip updates are enabled.
4. Turn payment emails Off, create another sandbox payment/refund, deliver queued notifications, and
   confirm no new payment/refund email. Trip emails must remain governed only by their existing toggle.

## Driver

1. Open Driver **Earnings** and confirm the earnings email preference is On.
2. Complete the paid trip. Confirm exactly one earnings-recorded email shows the Driver share and its
   link opens Driver directly on **Earnings**.
3. Transfer the earning to Stripe. Confirm exactly one transfer email with the same Driver share.
4. If a sandbox bank-payout event is available, verify created then paid or failed messages without
   duplicating repeated `payout.updated` webhook delivery.
5. Turn earnings emails Off and confirm later earnings/transfer/payout state still records correctly
   in Driver/Admin but queues no financial email.

Pass requires correct recipients and amounts, Rider/Driver preference isolation, deep links,
deduplication, durable delivery history, and no financial mutation caused by email delivery.
