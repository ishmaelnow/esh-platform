# Driver Earnings Statements V1 production test

1. Deploy Driver. This feature has no migration or new environment variable.
2. Sign in as a Driver with completed trips, open **Earnings**, and locate **Earnings statement**.
3. Select a range containing known pending, collected, and transferred earnings. Confirm the trip
   count, Rider fares, Driver earnings, platform fees, and three earnings states match the wallet
   rows and immutable Admin ledger.
4. Confirm **Bank payouts paid** and payout activity use only Stripe-reconciled payouts inside the
   selected range. The UI must explain that payouts are not allocated to individual trips.
5. Move the start/end dates to exclude a known trip and payout. Confirm totals and rows change without
   changing the wallet, ledger, Stripe transfer, or payout records.
6. Select **Download CSV**. Confirm its dates, amounts, statuses, booking references, and currency
   match the screen. Confirm it contains no card, bank, Stripe secret, Rider identity, or processor ID.
7. Select **Print statement** and confirm the print preview contains the period, totals, trip table,
   payout activity, and operational-statement disclaimer without portal navigation clutter.
8. Sign in as a different Driver and confirm only that Driver's authorized earnings appear. Refresh
   and confirm no record or total is duplicated.

Pass requires accurate minor-unit totals, inclusive date filtering, Driver/tenant privacy, honest
separation of transfers and bank payouts, usable CSV/print output, and no financial mutation.
