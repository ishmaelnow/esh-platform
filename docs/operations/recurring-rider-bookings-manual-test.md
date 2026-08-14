# Recurring Rider Bookings V1 production test

Use Stripe sandbox data and a short, clearly identifiable schedule. Restore temporary scheduling
settings and cancel unfinished trips afterward.

1. Run `pnpm exec supabase db push --dry-run` and confirm only
   `20260815000100_recurring_rider_bookings_v1.sql`, then have the owner apply it.
2. Deploy Rider and Admin. No new environment variable or Stripe webhook event is required.
3. In Rider **Book trip**, choose **Repeat on selected weekdays**, verified addresses, a pickup time,
   two or more matching dates within the tenant advance window, and selected weekdays.
4. Select **Review recurring route**. Confirm the route and fare are shown only as route verification
   and the page explicitly says no payment is collected yet.
5. Select **Create recurring schedule**. Confirm My trips shows one series and the exact expected
   local occurrence dates, each labeled **Awaiting fare review and payment**.
6. In Admin Dispatch, confirm the series, Rider, route, pattern, total count, booked count, and unpaid
   count appear. Confirm no dispatch booking or Driver offer exists for unpaid occurrences.
7. In Rider, select **Price and pay** for one occurrence. Confirm current pricing is calculated and
   Stripe collects only that occurrence, including any automatic Rider-wallet split.
8. Return to Rider and select **Request this trip** once. Confirm the occurrence becomes booked and
   one normal scheduled trip appears with the occurrence pickup time. Refresh and confirm no duplicate.
9. Confirm Admin sees that booking in scheduled dispatch. Let dispatch activation occur or use a
   sufficiently near test time; confirm existing matching and lifecycle behavior remains unchanged.
10. Use **Skip** on another unpaid occurrence. Confirm only that occurrence becomes cancelled and no
    payment, booking, notification, or ledger posting is created.
11. Create or retain at least two unpaid occurrences, select **Cancel remaining schedule**, and
    confirm all remaining unpaid occurrences cancel while the paid scheduled trip remains unchanged.
12. Cancel the paid scheduled trip from My trips. Confirm its normal Stripe/card refund and wallet-
    credit restoration behavior; series cancellation must not bypass this financial recovery.
13. Verify another Rider and another tenant Admin cannot read the series or occurrences. Confirm the
    audit trail includes series creation, skipped occurrence, and remaining-series cancellation.

Pass requires exact tenant-local recurrence, no unpaid dispatch bookings, individual current-price
payment, one booking per occurrence, safe cancellation boundaries, tenant/Rider isolation, audit,
and compatibility with existing wallet, refund, notification, and dispatch lifecycles.
