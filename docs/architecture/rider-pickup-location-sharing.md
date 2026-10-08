# Optional Rider pickup location sharing

The Rider explicitly selects Share my location with my driver in the active trip. This is separate
from device permission, map centering, saved places, and the booked pickup address. It is off by
default and available only after acceptance and before trip start (accepted/arrived).

Migration `20261008000100_rider_pickup_location_sharing.sql` stores one mutable snapshot per
booking, bound to the consenting Rider's current assigned Driver. The private table has RLS and no
ordinary client table privileges. Security-definer RPCs authenticate the Rider against the existing
active tenant Rider profile; clients cannot choose another Rider or tenant. Consent and automatic
stop are audited without coordinates. GPS updates overwrite the snapshot and do not create a trail.

Updates validate coordinates, accuracy, and capture time (at most two minutes old, thirty seconds
future clock tolerance). Booking row locks serialize updates/consent with assignment and lifecycle
changes. A trigger deletes consent and coordinates on trip start, cancellation, completion,
reassignment, Rider change, or tenant change. A newly assigned Driver requires new Rider consent.

The Driver RPC exposes a point only to the current assigned authenticated Driver while status is
accepted/arrived, consent remains bound to that assignment, and the capture is no older than sixty
seconds. Other Drivers, Riders, anonymous callers, and ordinary Admin table clients cannot read
the coordinates. Service-role operational access remains privileged. This is not candidate-driver
discovery, arrival verification, or an automatic change to pickup, fares, or dispatch.

The Rider publishes actual foreground GPS readings at most once per ten seconds from the active
trip screen. Background/hidden app states pause publication; leaving that screen stops the publisher.
Consent can remain active until explicitly stopped or lifecycle cleanup, allowing return to that
trip. A network failure may prevent immediate deletion; Driver exposure expires with the last capture
after sixty seconds. GPS denial/failure reports a limitation, never substitutes coordinates.

The Driver refreshes every five seconds, displays freshness/accuracy and a separate navy passenger
pin, and preserves booked pickup navigation. An explicit View shared passenger location action uses
the existing installed-maps resolver. Only that action sends the coordinate to a navigation app;
the embedded map sends displayed points to the existing map provider. No SMS, email, or push event
contains the Rider's coordinates. No native permissions beyond existing geolocation are added.

Apply the migration before hosted Rider/Driver deployment. No native rebuild. Minimal isolated
PostgreSQL smoke checks cover consent, ownership, role restrictions, stale filtering and lifecycle
cleanup; they do not certify the full Supabase migration chain or concurrent production sessions.
