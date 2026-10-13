# Admin saved coverage map

Admin Service areas displays saved circular boundaries on a real interactive street map, reusing
the existing shared Mapbox client and `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`. Both Admin and the
Transportation app render the same panel. No schema, RPC, authorization, coverage validation or
dispatch change. Existing add/edit/deactivate and selected-Driver coverage controls remain intact.

The map receives only the current authorized tenant summary's service areas, never a second tenant
query or Driver/Rider positions. Each saved center/radius becomes a 128-segment geographic polygon,
using the same 6371km spherical Earth radius as existing database distance checks. This is an
approximate visual boundary; server distance checks remain authoritative. It is not a fixed-size
screen circle, route shape, editable polygon, production sample location or placeholder artwork.
Invalid coordinates/radii are excluded from drawing; saved text records remain available.

All saved areas are fitted initially; the Coverage area selector fits one saved area or all again.
Active areas are navy and inactive areas gray. Overlaps are intentionally visible. Selection only
changes the camera/rendered shapes, never saved center/radius, activation or Driver eligibility.
Missing/deleted selection falls back to all current areas; tenant map keys prevent retaining the
previous tenant's map instance. Empty tenants retain their existing empty-state form without a map.
Unsaved edits do not appear as saved coverage until the normal authorized save/refresh completes.
Edit names the selected area in the existing form and scrolls/focuses its saved Radius field above
the map. This makes widening coverage discoverable without changing save permissions or semantics.

Dragging, zooming and rotation use the existing provider controls. Map attribution remains visible;
controls have 44px targets. The responsive map is 360px high, 320px on compact widths; resizing
refits the displayed boundaries. Cleanup removes
the old map and startup timeout on selection/unmount. No GPS request, new map provider/dependency,
directions/geocoding call, backend write, location tracking, offline cache or new audit event.
Provider errors/missing public config show a customer-readable fallback and explicit Retry while existing text/edit
controls remain usable. Existing read authorization and mutation audit apply unchanged.

No migration, native rebuild, new secret or new environment-variable name. Owner deploys the
reviewed hosted source to Admin and Transportation. Existing public provider configuration must
be present separately in each deployed project, as for its existing trip maps.

Tests independently verify geographic radius and closed-ring math, then use isolated identity,
area and basemap fixtures for UI selection, actual SDK camera movement, attribution, compact
width, provider failure and absence of Settings mutation requests. Browser screenshots are fixture
evidence, not proof of production basemap/network availability. Owner checks actual streets and
the correct company's saved circles after deployment.
