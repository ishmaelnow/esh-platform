# Tenant Fare Policy and Rider Fare Contract V1 Manual Test

Use Stripe sandbox, identifiable data, realistic location updates, and a new quote for every policy.

1. Dry-run and apply only `20260822000100_tenant_fare_policy_contract_v1.sql`, then deploy Admin and Rider.
2. Select **Guaranteed upfront**, save, and confirm Audit. Create/pay a Rider quote and confirm its
   final-fare disclosure. Complete with trusted movement; reconciliation may show the raw comparison
   but must show zero contract adjustment and no settlement.
3. Select **Metered actual**, save, and create a new quote. Confirm Rider calls it an estimate and
   discloses actual time, mileage, and tolls. Complete with trusted movement and confirm raw meter
   equals contract fare with the signed difference held for review.
4. Select **Protected flexible**, percentage cap `20.00`, and create a new quote. Confirm the exact
   maximum appears before payment. Complete with a raw calculation above it and confirm contract fare
   stops at the cap. Repeat with a shorter trip and confirm the fare may decrease.
5. Change policy after quote creation; confirm the existing quote and booking retain the old contract.
6. Confirm another tenant/Rider cannot read or mutate the settings, quote, or reconciliation. Retry
   completion/refresh and confirm no duplicate reconciliation, audit, or movement.
7. With precise fresh GPS, confirm arrival/completion fail beyond 250 feet and pass within 250 feet.
   Confirm accuracy worse than 75 meters requests a more precise reading.

Pass requires immutable disclosure, correct policy math, guaranteed protection, cap enforcement,
isolation, audit, idempotency, trusted telemetry, and a fare-independent proximity boundary. Cancel
unfinished bookings and return the Driver offline.
