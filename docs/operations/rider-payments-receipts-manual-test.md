# Rider Payments and Receipts V1 production test

1. Deploy Rider with its existing server-only `STRIPE_SECRET_KEY`; no migration or new secret is
   required.
2. Sign in as the Rider who completed the recent paid and refunded test trips and open **Payments**.
3. Confirm the paid trip shows its amount, `paid` state, date, pickup, and destination.
4. Confirm the cancelled $10.59 trip shows `refunded`, the $10.59 refund, and its refund date.
5. Select **View Stripe receipt** for a payment created in the current Connect sandbox. Confirm a new
   tab opens Stripe's hosted receipt with the same amount. Returning to the original tab must preserve
   the ESH Rider session and Payments view, which should now show the sanitized payment-method summary.
6. Confirm pending, failed, and expired attempts do not offer a receipt link.
7. Sign in as a different Rider and confirm the first Rider's payment activity and receipts are not
   visible or retrievable.
8. Refresh Payments and confirm no payment, refund, ledger posting, or Stripe object is duplicated.

Pass requires Rider isolation, correct paid/refunded presentation, safe hosted-receipt access, and no
financial mutation from viewing or refreshing payment history.
