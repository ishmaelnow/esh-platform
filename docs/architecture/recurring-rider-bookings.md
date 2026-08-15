# Recurring Rider Bookings V1

Recurring schedules are Rider-owned templates containing one verified route, selected ISO weekdays,
a tenant-local pickup time, start/end dates, and two to 50 immutable occurrence times. They do not
pre-create dispatch bookings, reserve Drivers, lock future prices, or collect an entire series fare.

Series creation starts from a fresh server-generated route quote so addresses, coordinates, service
area, and tenant identity remain trusted. The database converts the supplied occurrence instants
back into the tenant time zone and verifies their dates, weekdays, pickup time, uniqueness, minimum
notice, and maximum advance window. One series and all occurrences commit atomically and are audited.

An occurrence begins as `awaiting_payment`. When the Rider chooses **Price and pay**, ESH creates a
fresh route quote using the stored normalized route and current tenant pricing. The checkout server
verifies that quote belongs to the same active series and that minimum notice remains available.
The existing wallet/Stripe flow then collects that occurrence only. After payment truth is verified,
one role-derived RPC atomically creates the normal scheduled booking and binds it to the occurrence.
All existing dispatch activation, matching, map, notification, cancellation/refund, pricing, ledger,
Driver-earnings, and audit behavior applies to that booking unchanged.

Riders may skip one unpaid occurrence or cancel all remaining unpaid occurrences. A paid occurrence
is already an ordinary scheduled trip and must be cancelled individually so its Stripe and wallet
refund lifecycle is honored. Cancelling a series never silently cancels or refunds paid trips.
Tenant dispatch managers receive read-only series and occurrence visibility; Rider RLS prevents
cross-Rider and cross-tenant access.

Recurring Rider Autopay V2 adds explicit per-series authorization, one saved Stripe payment-method
reference, current-price off-session collection, bounded retries, action-required email, and manual
recovery without changing V1's safe cancellation boundary.

Deferred: multiple saved payment methods, series editing, rolling generation beyond the tenant
advance window, bulk cancellation/refund of paid occurrences, advance Driver reservation, and
series-level fare guarantees.
