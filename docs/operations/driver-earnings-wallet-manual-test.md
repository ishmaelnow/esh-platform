# Driver Earnings and Wallet V1 Manual Test

## Preconditions

- The Driver earnings migration and all earlier ledger/pricing migrations are deployed.
- The tenant ledger and trip pricing are enabled.
- Use an approved Driver with an assigned compliant vehicle.
- Use clearly identifiable production test data and return the Driver offline afterward.

## Test

1. In Admin **Pricing**, set **Driver share of Rider fare** to `80` and save.
2. In Rider, request a priced trip and record the locked fare.
3. Complete the normal Driver lifecycle: accept, arrive, start, and complete.
4. In Driver, open **Earnings**.
5. Confirm the completed trip appears once, with the same Rider fare, an 80% Driver share, and the
   residual platform fee. Minor-unit rounding is expected; for $48.94 the split is $39.15/$9.79.
6. Confirm **Pending earnings** and **Ledger amount owed** increased by the Driver earnings amount.
   **Available to withdraw** and **Paid** must remain $0.00 in V1.
7. Refresh and sign out/in. Confirm the wallet and trip remain unchanged and are not duplicated.
8. In Admin **Ledger**, confirm a Driver-specific payable account exists and its balance matches the
   Driver wallet. Confirm the trip has the original fare posting plus one Driver earnings allocation.
9. Change the configured share, refresh the old trip, and confirm its locked split does not change.
10. Complete a second priced trip and confirm only the new trip uses the new share.
11. Sign in as another Driver and confirm they cannot see the first Driver's wallet or trips.

## Pass criteria and cleanup

Pass when the split is correct and stable, the ledger is balanced, wallet privacy holds, and the UI
does not imply collection or payout. Cancel unfinished test bookings and return test Drivers offline.
