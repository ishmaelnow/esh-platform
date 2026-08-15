# Recurring Rider Autopay V2 production test

Use Stripe sandbox cards and a clearly identifiable recurring series. Keep pickup at least 48 hours
away unless invoking the protected cron manually, and clean up unfinished test trips afterward.

1. Dry-run the database and confirm only `20260815000200_recurring_rider_autopay_v2.sql`; have the
   owner apply it before deploying Rider/Admin.
2. Confirm Rider has `CRON_SECRET`, `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, Mapbox, and the
   existing notification-delivery variables. No new secret is introduced.
3. Add `payment_intent.succeeded` and `payment_intent.payment_failed` to the existing Rider Stripe
   webhook destination. Deploy Rider and Admin, then confirm the Rider Vercel project registers
   `/api/cron/recurring-autopay` once daily.
4. Pay one recurring occurrence through ordinary Stripe Checkout with test card `4242 4242 4242
   4242`. Return to ESH, request the trip, refresh, and confirm the schedule now offers **Enable
   autopay** with only brand/last-four display.
5. Enable autopay and confirm the Rider warns that future occurrences use current pricing and wallet
   credit first. Refresh and confirm it remains on; Admin Dispatch must show `Autopay: on`.
   Eligible future occurrences must say **Autopay scheduled**, offer quiet **Pay early** and **Skip**
   controls, and no longer present manual **Price and pay** as the primary action.
6. For a controlled test, invoke the protected cron from Vercel or wait for its scheduled run with an
   unpaid occurrence inside 48 hours but outside minimum notice.
7. Confirm exactly one new Stripe PaymentIntent for the current fare/card remainder, exactly one
   scheduled booking, occurrence `paid automatically`, existing payment/prepayment ledger posting,
   and the normal scheduled-trip email. Re-run the cron and confirm no duplicate charge or booking.
8. Add Rider wallet credit, repeat with another occurrence, and confirm Stripe collects only the
   remainder while the immutable wallet application covers the rest.
9. Use Stripe's declined-payment test method on a separate test Rider/series. Confirm no booking or
   Driver offer is created, Rider shows an actionable failure with manual **Price and pay**, Admin
   shows `need attention`, and an action-required email is queued/delivered.
10. Turn autopay off and confirm later unpaid occurrences remain manual. Cancel remaining schedule
    and confirm already paid trips retain their individual refund lifecycle.
11. Verify another Rider and tenant cannot read the saved method or series. Confirm audit includes
    enabling/disabling autopay and successful automatic booking.

Pass requires explicit consent, no stored card credentials, current-price charging, exact wallet
split, one charge/booking per occurrence, safe failure recovery, tenant isolation, audit, and normal
dispatch/refund/ledger compatibility.
