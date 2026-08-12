# Trip Pricing V1 manual test

1. Confirm the Rider deployment has `SUPABASE_SERVICE_ROLE_KEY` as a server-only secret and the
   existing restricted Mapbox public token. Never expose the service-role key in a public variable.
2. In Admin, initialize the Ledger if needed, then open **Pricing**.
3. Use test rates: base `5.00`, per mile `1.50`, per minute `0.25`, minimum `10.00`; enable pricing.
4. In Rider, choose verified pickup and destination suggestions and press **Review fare**.
5. Confirm a normalized route, distance, duration, currency, locked fare, and expiry appear before a
   booking exists. Independently verify the displayed formula within normal rounding tolerance.
6. Press **Confirm trip at this fare**. Confirm Rider and Admin display the identical fare.
7. Offer the trip. Confirm Driver displays the identical Rider trip fare and clearly says it is not
   Driver earnings.
8. Change Admin pricing rates. Confirm the existing booking fare does not change and a new quote uses
   the new rates.
9. Complete the trip. In Admin Ledger, confirm one `Completed trip fare` transaction debits
   `rider_receivables` and credits `platform_fees` for the exact fare.
10. Confirm `pricing.settings_updated` and `pricing.trip_fare_posted` in Audit.
11. Switch tenants and confirm quotes, fares, settings, and ledger entries do not cross tenants.

Also verify zero/negative malformed pricing inputs fail, an expired quote requires recalculation, and
refreshing does not duplicate the completed-trip ledger transaction. Card payment is not expected.
