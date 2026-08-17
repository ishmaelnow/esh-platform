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

Toll pricing V1 adds a trusted route metadata request for named toll collection points and a
database-backed catalog of authorities, facilities, aliases, and effective-dated rates. The initial
Philadelphia catalog covers DRPA bridges for passenger automobiles and SUVs traveling westbound
into Pennsylvania at the official $6.00 rate effective 2024-09-01. Mapbox names are resolved through
catalog aliases; unknown or unnamed toll facilities are rejected rather than silently undercharged.
The quote RPC validates every submitted rate reference and amount against the active catalog before
creating the quote. The resolved toll lines and source references are copied into the locked quote
snapshot, so later catalog changes cannot alter historical quotes.

The catalog already carries vehicle class, payment method, direction, effective date, currency,
source, and optional time-window fields for later authorities and rate changes. Current route
matching uses a trusted server-side direction heuristic and the default passenger/SUV rate. The
client cannot invoke the quote RPC or supply an unverified toll amount.

When Mapbox reports a toll collection point that cannot be resolved to the ESH catalog, the trusted
Rider server may request a Google Routes toll estimate using the server-only `GOOGLE_MAPS_API_KEY`.
Mapbox remains the source for route distance and duration. Google estimates are explicitly marked
as estimated and `google_routes` in the locked snapshot; the database validates their currency,
positive amount, and estimate marker before accepting the quote. If Google cannot provide a known
estimate, pricing remains blocked rather than undercharging. Catalog-matched rates remain the
authoritative path.

Deferred: actual-distance adjustments, taxes, additional toll authorities and vehicle classes,
discounts, cancellation fees, card collection,
refunds, collection settlement, payouts, and reconciliation.
