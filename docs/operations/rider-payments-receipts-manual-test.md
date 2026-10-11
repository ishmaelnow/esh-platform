# Rider Payments and Receipts V1 production test

1. Deploy Rider with its existing server-only `STRIPE_SECRET_KEY`; no migration or new secret is
   required.
2. Sign in as the Rider who completed the recent paid and refunded test trips and open **Payments**.
3. Confirm the paid trip shows its amount, `paid` state, date, pickup, and destination.
4. Confirm the cancelled $10.59 trip shows `refunded`, the $10.59 refund, and its refund date.
5. Select **Load Stripe receipt** for a payment created in the current Connect sandbox. Confirm it
   becomes a visible **Open Stripe receipt** link and shows the sanitized payment-method summary.
   Select the link and confirm a new tab opens Stripe's hosted receipt with the same amount. Returning
   to the original tab must preserve the ESH Rider session and Payments view.
6. Confirm pending, failed, and expired attempts do not offer a receipt link.
7. Sign in as a different Rider and confirm the first Rider's payment activity and receipts are not
   visible or retrievable.
8. Refresh Payments and confirm no payment, refund, ledger posting, or Stripe object is duplicated.

Pass requires Rider isolation, correct paid/refunded presentation, safe hosted-receipt access, and no
financial mutation from viewing or refreshing payment history.

## Trip history receipt acceptance

No database migration or new credential is required. After the owner pushes, confirm Rider Ready
at that commit. Preserve the existing server-only Stripe configuration. No native rebuild needed.

1. Rider menu → Trips → Show history → completed trip → View trip receipt.
   Compare its full trip reference, route, dates and recorded fare with the existing trip/payment.
2. Check the upfront breakdown, including tolls/vehicle option/minimum where recorded. It must sum
   to the upfront quote, not silently substitute current rates or a later reviewed fare.
3. Check paid card, wallet-only and split-funded examples if already available. Credit and online
   payment remain separate. Open payment receipt and compare the sanitized method/processor receipt.
4. Check an existing cancelled/refunded example. Booked fare is not labelled a charge; processing
   refunds and restored credit are distinguished. Fare review/balance due/dispute records must not
   be presented as a new completed charge. Do not create new money movement merely for this test.
5. Download receipt and open the `.txt` file. Share receipt should open the device sheet or copy
   text for pasting. Verify route/reference/amounts match, with no access token or processor URL.
   Test Android and iPhone installed apps as well as browser; if WebView download is unsupported,
   verify share/copy separately and report the platform limitation.
6. At 414 × 896, 320px width and with a reduced keyboard viewport, scroll all receipt content and
   reach the export controls. Approved home/booking layout must stay unchanged.
7. Temporarily disconnect and Refresh receipt. Old receipt data clears and a professional error
   appears. Restore connectivity and retry. A different Rider/provider cannot fetch this trip's
   receipt, even by replacing booking ID. Active trips are not eligible for this history receipt.
8. Legacy unpriced/incomplete records show unavailable details, never invented fares or payment.
   Existing Payments receipt links, support, booking and payment-return flows remain intact.

Use clearly identifiable existing test records. Viewing/exporting must create no booking, payment,
refund, ledger entry or notification. Restore temporary settings and Driver availability afterward.
