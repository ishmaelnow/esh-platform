# Trip Pricing V1

Trip Pricing V1 calculates a locked Rider fare from a trusted Mapbox road route before booking.
Tenants configure a base fare, per-mile rate, per-minute rate, and minimum fare in their permanent
ledger currency. All configuration and calculated amounts use integer minor units.

The Rider server re-geocodes the selected addresses and requests traffic-aware distance and duration
from Mapbox. A service-only database RPC applies the current tenant formula and stores a 15-minute
quote with normalized addresses, coordinates, route metrics, currency, and a pricing snapshot.
Browser callers cannot supply their own fare or directly invoke the internal quote function.

The Rider reviews the estimate before confirming. Confirmation atomically creates the geocoded
booking and links the quote. The quoted fare is locked as both estimated and final fare in V1;
changing tenant rates cannot alter an existing booking. Rider, Driver, and Admin show the same fare.

When a priced trip becomes completed, a database trigger posts an immutable balanced transaction:
debit Rider receivables and credit platform fee revenue. Driver Earnings and Wallet V1 then posts a
second immutable reclassification from platform fee revenue to the assigned Driver's payable
account. Together, the postings preserve the whole Rider fare while separating the Driver share
from the platform fee. This represents amounts owed, not payment collection. Unpriced Admin-created
bookings remain supported and do not post a fare or Driver earnings.

Tenant owners and administrators require `pricing.management`. Pricing cannot be enabled before the
tenant ledger is initialized. Configuration changes and completed-trip fare posting are tenant
audited. Quote and booking access remain tenant- and Rider-scoped under RLS.

Deferred: actual-distance adjustments, taxes, tolls, discounts, cancellation fees, card collection,
refunds, collection settlement, payouts, and reconciliation.
