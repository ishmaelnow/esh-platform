# Driver daily activity

`my_driver_daily_activity()` is an authenticated, read-only security-definer RPC. It uses
`require_preorder_driver()` to require the existing active person/Driver/tenant ownership contract;
there is no caller-selected Driver or tenant. Raw audit events and locations are never returned.
Execute is denied to public/anonymous callers. Existing availability writes and their audit remain
unchanged. A partial audit index supports owned availability history lookup.

The day is defined by `tenant_configurations.default_time_zone`, with server-generated midnight
boundaries (including 23/25-hour daylight-saving days). All completed trips in this interval count,
including unpriced or refunded trips. Trip distance sums only trusted `driver_location_aggregate`
measurements on those completed bookings; it excludes pickup travel and active trips. If any trip
has missing or untrusted distance, the total is unavailable rather than a misleading partial sum.
An empty completed-trip day has zero distance. No quoted route is substituted for measured distance.
The entire trip is attributed to its completion day; distance is not split at midnight.

Time online sums committed `driver.availability_changed` audit spans, clipped to the company day
and server time. The final event before midnight carries overnight availability forward. Repeated
Online requests create no new change event; reconnects and foreground refresh do not reset totals.
The last audit status must agree with the current availability row; inconsistent/missing online
history returns unavailable. This measures the availability setting, including waiting and trips.
It does not prove internet connectivity, background GPS, or continuous historical compliance.
No retrospective eligibility calculation or additional GPS retention is introduced.

Driver fetches on account/profile changes, confirmed availability changes, active-trip list changes,
foreground return, reconnection and every visible minute. Reads have a ten-second abort, do not
overlap within a scope, and ignore cancelled account results. Failed refresh removes stale totals.
Existing earnings and fee definitions are preserved, using the server day window when available;
the separate earnings statement remains unchanged. No Rider UI, dispatch, payment, notification,
authentication or native permission change is included. No Codemagic rebuild is required.

Local SQL checks use an isolated minimal schema and do not certify the full production Supabase
stack. Full owner database and physical-device acceptance remain release checks.
