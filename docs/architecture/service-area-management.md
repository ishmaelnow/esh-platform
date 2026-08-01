# Service Area Management

## Scope

Service Area Management defines tenant-owned circular operating boundaries, tenant-wide or
restricted driver coverage, and assignment history. It does not collect driver coordinates, imply
location consent, expose drivers to riders, or perform dispatch matching.

## Ownership and boundaries

- `service_areas` belongs to the transportation domain and is always tenant-scoped.
- `driver_service_area_assignments` links tenant-owned driver profiles to tenant-owned areas.
- Driver Management entitlement gates the first version because service-area assignment is an
  operational driver-management function.
- Tenant owners and tenant administrators manage areas and assignments.
- Drivers receive active tenant-wide areas plus their own active restricted-area assignments
  through `my_driver_service_areas()`.

## Area model

The first version uses a center latitude, center longitude, and radius in kilometers. This keeps the
contract explicit and reviewable while deferring polygon editing, geocoding, routing, and geospatial
indexing until a real dispatch requirement exists.

Areas have `active` and `inactive` states. Deactivation does not delete the area or assignment
history. Inactive areas are excluded from the Driver portal.

## Assignment model

Each area has a driver coverage mode:

- `all_drivers` makes the area available to every active driver in the tenant.
- `selected_drivers` restricts the area to drivers with an active assignment.

Drivers may be selected for multiple active areas. Only one active assignment may exist for the
same driver and area. Removing a driver ends the assignment with an actor and timestamp; it does
not delete history. Active selections remain stored while an area uses `all_drivers`, allowing an
administrator to restore the prior restricted set without rebuilding it.

## Driver operating-area selection

Authorization and driver choice are separate:

- Tenant administrators define which active areas are available to all drivers or a selected set.
- An offline driver chooses one operating area from the areas available to that driver.
- When only one area is available, it is selected automatically.
- A driver must go offline before changing the selected area.
- Going online requires a selected area that remains active and authorized.
- Availability audit metadata records the selected area, and selection changes create their own
  tenant audit events.

This selection declares an intended operating boundary. It does not collect the driver's physical
coordinates and therefore is not location tracking or location consent.

## Security and audit

- RLS requires active tenant membership for reads.
- Mutations require `tenant_owner` or `tenant_admin` plus the Driver Management capability.
- Cross-tenant foreign keys prevent mismatched driver and area records.
- Creation, update, status and coverage changes, assignment, and unassignment create tenant audit
  events.
- The Driver RPC resolves the driver through `auth.uid()` and never accepts a caller-supplied driver
  or tenant identifier.

Realtime current-location sharing and circular-boundary enforcement are now delivered under
`realtime-driver-location.md`. The following remain deferred:

## Deferred

- Polygon and multipolygon boundaries
- Geocoding and address search
- Route-aware geofence enforcement
- Routing
