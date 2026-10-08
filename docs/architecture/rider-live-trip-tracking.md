# Rider live trip tracking

This hosted Rider refinement reuses existing owned portal/location RPCs, real saved trip coordinates,
Mapbox traffic-aware routing, and the approved light Home map and bottom booking panel. It adds no
database schema, native permission, payment mutation, or notification event.

When a current ride exists, a compact Home card shows its state and a Track ride action. Trips keeps
the existing driver/vehicle, fare, route map, and cancellation functionality. Requested/offered trips
show the driver-search state without exposing candidate locations. Accepted trips show pickup ETA;
arrived trips show arrival; in-progress trips estimate travel to destination. ETA is advisory, never
an arrival guarantee or an authority for trip lifecycle, fare, or service coverage.

The existing Rider location RPC exposes only accepted, arrived, or in-progress owned bookings and
honors Driver sharing consent. The client applies the same status filter and validates coordinates.
Readings are fresh only when the server marks them fresh and their captured timestamp is within
60 seconds, allowing the existing 30-second future clock tolerance. The local clock ages cached
readings every ten seconds even when refresh fails. Last-known coordinates are labeled accordingly
on Home; they are excluded from ETA calculations and the trip map's live Driver marker.

Directions requests require a fresh Driver location, valid target coordinates, and the existing
public map token. Missing location/token and invalid or failed route responses show ETA unavailable.
Each request has an eight-second timeout and cleanup cancellation. Estimates are keyed to booking,
phase, location capture, and target so old results cannot appear on a new trip or status.
The shared trip map resets summaries and cancels obsolete route requests; started trips with a
fresh Driver route to destination rather than back through pickup.

Portal refreshes discard results superseded by a newer refresh or a different account/provider.
Provider switching clears location state. Location-RPC failure clears cached Driver exposure, and
existing polling remains every ten seconds. This is foreground snapshot tracking, not background
GPS or a stored movement trail. Driver background tracking remains separately deferred.

No backend authorization or tenant boundaries change. Actual physical-device movement, consent
revocation, and network recovery require owner acceptance in addition to local mocked tests.
