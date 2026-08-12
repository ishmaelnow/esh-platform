# Rider Payments and Collection V1 Manual Test

## Setup

1. Use Stripe test mode. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the existing
   `SUPABASE_SERVICE_ROLE_KEY` to the Rider Vercel project as server-only Production secrets.
2. In Stripe Workbench, create a webhook for
   `https://rider.eshapp.com/api/webhooks/stripe` listening to `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and
   `checkout.session.expired`.
3. Deploy the Rider app and apply only the Rider payment migration after its dry-run.

## Successful payment

1. In Rider, select verified addresses and review the locked fare.
2. Select **Continue to secure payment**. Confirm the browser opens Stripe-hosted Checkout and the
   displayed amount matches the locked ESH fare.
3. Pay with Stripe's test Visa `4242 4242 4242 4242`, any future expiry, any CVC and postal code.
4. After returning to Rider, wait briefly if the webhook is processing, then refresh the returned
   page. Confirm ESH says payment is confirmed and offers **Finish booking**.
5. Finish booking. Confirm exactly one trip is created and refreshing cannot create or charge a
   duplicate.
6. In Admin Ledger, confirm `Rider payment collected` debits cash and credits Rider prepayments for
   the exact fare. Confirm the payment attempt is `paid`.
7. Complete the trip. Confirm the fare, Driver allocation, and payment-settlement journals are each
   balanced. Rider prepayments and Rider receivables should clear by the fare amount.

## Failure, authorization, and cleanup

1. Start a separate quote and cancel Stripe Checkout. Confirm no booking is created and no
   collection ledger entry exists.
2. Use Stripe's declined test card and confirm no booking can be finalized.
3. Confirm another Rider and another tenant cannot read the payment attempt.
4. Confirm invalid webhook signatures return an error and change no payment or ledger state.
5. Use identifiable test trips, cancel unfinished bookings, and return the Driver offline.
