# Realtime Driver Location

## Purpose and boundary

Realtime Driver Location provides a privacy-bounded current coordinate for dispatch operations and
an accepted Rider's active trip. It stores a single mutable snapshot per Driver, not route history.
It does not track Riders, perform routing, calculate arrival time, or rank automatic matching by
distance.

## Driver control

Location sharing is off by default. A Driver must first be eligible and online, then explicitly use
**Enable live location** and grant the browser precise-location permission. The portal submits at
most one reading every ten seconds. The Driver can stop sharing at any time.

The Driver portal keeps a dedicated **Location** tab visible in both online and offline states. It
shows availability, selected operating area, browser permission, last update, accuracy, automatic-
stop behavior, and the current sharing control. Offline and blocked-permission states explain the
exact prerequisite instead of hiding the feature.

Sharing and the coordinate are automatically cleared when the Driver goes offline or an assigned
trip completes or is cancelled. Completing a trip requires the Driver to explicitly enable sharing
again if they want it for later work. Permission denial, unavailable GPS, timeout, stale readings,
and boundary failures are shown as actionable Driver messages without changing availability.

## Validation

The database resolves the authenticated Driver and never accepts a Driver or tenant identifier from
the browser. A reading is accepted only when:

- sharing is enabled and requested availability is online;
- latitude, longitude, accuracy, and capture time are valid;
- capture time is no more than two minutes old or thirty seconds in the future; and
- the accuracy-adjusted coordinate is inside the selected active circular service area.

Browser validation is advisory. The database is the enforcement boundary.

## Exposure policy

- Tenant dispatch managers may read current locations for their own tenant through RLS.
- Drivers access only their own sharing state and submit only their own coordinate through RPCs.
- A Rider RPC returns a coordinate only for that authenticated Rider's booking after Driver
  acceptance and only while status is `accepted`, `arrived`, or `in_progress`.
- Candidate Drivers, declined offers, completed trips, other Riders, and other tenants never expose
  a coordinate.
- Rider and Admin map links are explicit outbound links to OpenStreetMap; coordinates are sent to
  that provider only when the user chooses the link.

Readings at most sixty seconds old are labeled live. Older readings remain visibly stale rather than
implying current presence.

## Operations and audit

Driver updates use a current-row upsert, so database growth does not reveal a movement trail. Sharing
enable, disable, and automatic-stop transitions create tenant audit events; routine coordinate
updates do not create high-volume audit records. Admin Dispatch refreshes every five seconds and the
Rider portal every ten seconds. Supabase remains the only realtime data authority.
