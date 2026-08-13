# Payment and Payout Notifications V1 production test

## Deploy

1. Generate one high-entropy delivery credential locally, for example with
   `openssl rand -hex 32`. Do not paste it into source files, logs, chat, or documentation.
2. In the Admin, Rider, and Driver Vercel projects, add the identical server-only value as
   `NOTIFICATION_DELIVERY_SECRET` for Production.
3. In Rider and Driver only, add
   `NOTIFICATION_DELIVERY_URL=https://admin.eshapp.com/api/internal/notifications/deliver` for
   Production. Do not prefix either variable with `NEXT_PUBLIC_`.
4. Confirm Admin still has its existing Resend variables and Rider/Driver portal URLs. Rider and
   Driver must not receive Resend credentials.
5. Deploy Admin first, then Rider and Driver so no caller reaches an old Admin deployment.
6. This delivery follow-up has no migration. If the notification foundation is not deployed yet,
   run the required database dry run and confirm only
   `20260813000400_payment_payout_notifications_v1.sql`, then apply it.
7. Confirm Admin's existing notification delivery cron and Resend webhook remain healthy. Do not
   select **Deliver queued** during the initial automatic-delivery test.

## Rider

1. Open Rider **Payments** and confirm **Payment update emails** is On.
2. Create and pay for a clearly identifiable Stripe sandbox trip. Without opening Admin or pressing
   **Deliver queued**, confirm exactly one payment email arrives promptly, shows the correct test
   amount, and links to Rider **Payments**.
3. Cancel before trip start. Confirm exactly one refund email shows the full test refund and its link
   opens **Payments**. The cancellation trip email remains separate when trip updates are enabled.
4. Turn payment emails Off, create another sandbox payment/refund, and
   confirm no new payment/refund email. Trip emails must remain governed only by their existing toggle.

## Driver

1. Open Driver **Earnings** and confirm the earnings email preference is On.
2. Complete the paid trip. Without using Admin delivery controls, confirm exactly one
   earnings-recorded email shows the Driver share and links to Driver **Earnings**.
3. Transfer the earning to Stripe. Confirm exactly one transfer email with the same Driver share.
4. If a sandbox bank-payout event is available, verify created then paid or failed messages without
   duplicating repeated `payout.updated` webhook delivery.
5. Turn earnings emails Off and confirm later earnings/transfer/payout state still records correctly
   in Driver/Admin but queues no financial email.

Pass requires correct recipients and amounts, Rider/Driver preference isolation, deep links,
deduplication, prompt automatic delivery, durable delivery history, and no financial mutation caused
by email delivery. Also replay one relevant Stripe test event and confirm no duplicate message.

## Recovery check

Temporarily give Rider or Driver an invalid `NOTIFICATION_DELIVERY_URL`, redeploy only that caller,
and perform a sandbox financial action. The financial action must still succeed and its email must
remain queued. Restore the correct URL, redeploy, then use Admin **Deliver queued** and confirm the
message sends exactly once. Restore all test preferences and cancel unfinished test trips.
