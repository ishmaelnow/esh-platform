# Live Trip Maps, Routing, and ETA

Every newly created booking resolves its pickup and destination through Mapbox Geocoding v6 and
stores the coordinates once. The database validates all coordinates, requires an all-or-nothing
payload, confirms pickup is within the selected service area, and permits writes only from tenant
dispatch managers or the Rider who owns the booking.

Free-form geocoding is biased toward the selected service area's center and evaluates up to five
results rather than accepting an unbounded country-wide first match. Both the client workflow and
database reject a destination more than 800 km from that center. This regional boundary prevents an
ambiguous local landmark or airport abbreviation from silently producing a cross-country route;
long-distance transportation remains outside this product slice.

Rider pickup input must resolve as a credible street address inside the selected service area before
a booking is created. Exact, high-, and medium-confidence regional matches are accepted so Mapbox
can correct ordinary spelling mistakes; the normalized Mapbox address is stored and displayed
instead of preserving the misspelled input. Destination input must resolve within the supported
regional boundary. One security-definer RPC creates the booking and persists both coordinates in a
single database transaction. Any validation or persistence failure rolls back the booking,
automatic offers, audit events, and notification outbox work together, so a mapless trip cannot
enter dispatch. The older Rider creation RPCs are no longer executable by browser users.

The Rider form uses Mapbox Search Box suggestions after three characters with a 350 ms debounce and
one session token per field selection. Pickup suggestions are bounded to the selected service area;
destination suggestions include addresses and POIs within the supported 800 km region. Editing a
selected value invalidates it, and submission requires explicit suggestion selection. Search Box
data is used only for the interactive selection; the normalized label is re-resolved through
permanent Geocoding v6 before its coordinates are stored.

Admin, Driver, and Rider render the same embedded street map and traffic-aware road route. Before
assignment the route connects pickup to destination. During an active assignment it connects the
Driver's latest consented location through pickup to destination, with distance and ETA. If routing
fails, saved address markers remain useful and the interface reports the temporary limitation.

Driver privacy remains enforced at the data boundary. Riders receive current location only for an
active accepted trip. Stop-sharing, offline transition, and trip completion clear exposure. Admin
and Rider maps also refuse to render a Driver marker when sharing is disabled.

`NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is intentionally browser-visible. Use a Mapbox public token with
only required scopes and URL restrictions for approved origins. Permanent geocoding must be enabled
because resolved coordinates are stored. Never place a Mapbox secret token in a public variable.

Existing bookings remain valid; embedded maps begin with newly geocoded bookings.
