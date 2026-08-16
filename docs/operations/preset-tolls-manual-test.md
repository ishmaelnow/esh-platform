# Preset toll pricing manual test

1. Confirm the Rider app can price a normal Philadelphia route that does not cross a toll
   facility. The locked fare should not show an `Includes tolls` line.
2. Use a route from New Jersey westbound into Philadelphia that crosses one of the DRPA bridges
   (Ben Franklin, Walt Whitman, Commodore Barry, or Betsy Ross).
3. Review the locked quote. It must show `Includes tolls: $6.00` and the matched bridge name.
   The quote's toll snapshot must include the catalog rate reference, authority, facility, matched
   alias, direction, effective date, and official source.
4. Confirm the fare total equals the base distance/time fare plus $6.00.
5. Confirm the paid checkout amount exactly equals the locked total.
6. Complete the trip and verify Rider, Driver, Admin, payment, refund, transfer, and ledger totals
   all use the same fare total.
7. Test the reverse eastbound direction. DRPA's westbound-only collection must not add a toll.
8. Test a route whose toll facility is not in the preset catalog. Pricing must stop with a clear
   configuration message rather than undercharging the Rider.
9. Add a future-dated catalog rate in a non-production test environment and confirm that existing
   quotes retain their original snapshot and total.

The initial catalog source is the [DRPA toll schedule](https://drpa.org/travel/toll-schedule.html),
effective September 1, 2024. This is an operational pricing test, not a tax statement.
