# Tenant Fare Policy and Rider Fare Contract V1

ESH locks the fare contract, not a physical road route. Navigation may reroute for traffic, safety,
closures, or Driver judgment. The traffic-aware quote preserves the route metrics, pricing rates,
tolls, service type, fare policy, and any protected maximum before payment.

Tenant Admin selects one policy for future quotes:

- **Guaranteed upfront**: the quoted fare is final through ordinary traffic and rerouting. Trusted
  actual metrics remain available for operational comparison but create no adjustment.
- **Metered actual**: the quote is an estimate; trusted actual in-trip time and mileage determine
  the contract fare after completion.
- **Protected flexible**: trusted actual time and mileage may reduce the fare. Increases are capped
  by a disclosed percentage or fixed amount calculated and stored with the quote.

Only new quotes use changed settings. Existing quotes retain their accepted contract. A material
Rider-requested destination change, stop, or waiting-time contract requires a future requote flow;
normal Driver rerouting never authorizes a higher cap.

Aggregate route metrics retain no point history. Suspect GPS segments prevent trusted fare inputs.
Reconciliation stores both the raw meter calculation and policy-limited contract fare. Only the
difference between prepaid quote and contract fare is eligible for reviewed, idempotent settlement.

Lifecycle proximity is separate from pricing. Arrival and completion use a nominal 250-foot
(76.2-meter) boundary. GPS accuracy worse than 75 meters is rejected; acceptable uncertainty is
added to the nominal radius. This boundary never changes the fare.
