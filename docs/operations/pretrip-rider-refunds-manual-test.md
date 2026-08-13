# Pre-trip Rider Refunds V1 production test

1. Add the same Connect-platform `STRIPE_SECRET_KEY` to Admin as a server-only Production variable;
   Rider already has it. Redeploy Admin after saving it.
2. Dry-run the migration and confirm only `20260813000300_pretrip_rider_refunds_v1.sql`, then apply it.
3. Create and pay for a new identifiable Rider trip, but do not start the trip.
4. Cancel from Rider. Confirm the message says the trip was canceled and payment refunded.
5. Refresh Rider and confirm the cancelled trip permanently shows `Refunded: <full fare>` and
   `Returned to the original payment method`. Confirm Stripe shows one full refund and Admin Rider
   payments shows `refunded` plus the full refund amount/status.
6. Confirm Admin Journal contains `Paid canceled trip refunded`: debit Rider prepayments and credit
   cash/payment clearing for the full fare. Confirm no fare, Driver earnings, or transfer posting was
   created for this unstarted trip.
7. Repeat with a second paid unstarted trip canceled by Admin. Confirm the same result and that
   unauthorized tenant users cannot invoke it.
8. Refresh and repeat the action. Confirm no duplicate Stripe refund, refund record, or journal.
9. Confirm an in-progress or completed paid trip is rejected and remains unchanged.

Pass requires full-amount refund, cancellation only after Stripe acceptance, idempotency, balanced
reversal, tenant/Rider authorization, and no automatic reversal of completed or transferred earnings.
