# Service Area Management

## Scope

Service Area Management defines tenant-owned circular operating boundaries and preserves driver
assignment history. It does not collect driver coordinates, imply location consent, expose drivers
to riders, or perform dispatch matching.

## Ownership and boundaries

- `service_areas` belongs to the transportation domain and is always tenant-scoped.
- `driver_service_area_assignments` links tenant-owned driver profiles to tenant-owned areas.
- Driver Management entitlement gates the first version because service-area assignment is an
  operational driver-management function.
- Tenant owners and tenant administrators manage areas and assignments.
- Drivers receive only their own active assignments through `my_driver_service_areas()`.

## Area model

The first version uses a center latitude, center longitude, and radius in kilometers. This keeps the
contract explicit and reviewable while deferring polygon editing, geocoding, routing, and geospatial
indexing until a real dispatch requirement exists.

Areas have `active` and `inactive` states. Deactivation does not delete the area or assignment
history. Inactive areas are excluded from the Driver portal.

## Assignment model

Drivers may be assigned to multiple active areas. Only one active assignment may exist for the same
driver and area. Removing a driver ends the assignment with an actor and timestamp; it does not
delete history.

## Security and audit

- RLS requires active tenant membership for reads.
- Mutations require `tenant_owner` or `tenant_admin` plus the Driver Management capability.
- Cross-tenant foreign keys prevent mismatched driver and area records.
- Creation, update, status changes, assignment, and unassignment create tenant audit events.
- The Driver RPC resolves the driver through `auth.uid()` and never accepts a caller-supplied driver
  or tenant identifier.

## Deferred

- GPS collection and continuous tracking
- Driver location consent
- Rider or public map exposure
- Polygon and multipolygon boundaries
- Geocoding and address search
- Geofence enforcement
- Dispatch matching and routing
