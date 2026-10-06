# Rider Home and Work addresses

Each active Rider profile may store one Home and one Work address for its transportation provider.
These are optional destination shortcuts, not a booking prerequisite or a new authentication flow.
The approved map, bottom panel, vehicles, payment and trip lifecycle remain unchanged.

## Data and authority

`rider_saved_places` uses `(tenant_id, rider_profile_id, place_key)` as its primary key and a
composite foreign key to the Rider profile. Only `home` and `work`, a bounded nonempty label,
and finite geographic coordinates are accepted. Deleting a Rider profile cascades to its places.
No addresses are copied between providers. Existing session-only Home is not migrated: it was
never stored on the server. Recent destinations still come from actual bookings.

Authenticated own-profile RPCs list, upsert and remove places. They derive identity from
`auth.uid()`, require confirmed email, an active person/profile/provider and enabled
`driver.management`. An expected profile ID is a precondition against account changes, never
an authorization grant. Direct browser table writes and anonymous access are denied. RLS permits
only the owning Rider to select rows; staff and Drivers receive no new saved-address visibility.
Service-role access remains trusted infrastructure access, not an application UI feature.

Save/remove write `rider.saved_place_updated` / `rider.saved_place_removed` audit events. Audit
contains only the place key and existing actor/resource identifiers, not addresses or coordinates.
Removing a place deletes its address data. No notification is generated: existing trip and payment
notifications continue only through their established lifecycle.

## Geographic verification

The existing Mapbox Search Box supplies temporary suggestions and retrieved coordinates.
`POST /api/places` verifies authenticated ownership before calling the existing
`geocodePermanentAddress` with `permanent=true`, a verified street address and a 2 km maximum
distance from the selected hint. Only the permanent response is saved in the normal UI flow.
Missing configuration, ambiguous addresses, failed permanent geocoding and uncertain database
writes produce actionable errors without fabricated locations or optimistic success.

This reuses the same configured token and permanent geocoding capability as fare quoting.
[Search Box](https://docs.mapbox.com/api/search/search-box/) results are temporary;
[Geocoding](https://docs.mapbox.com/api/search/geocoding/) documents permanent storage and its
account requirements. No new API credential or native permission is introduced.

Stored coordinates are destination hints, not coverage or fare authority. Every quote continues
to resolve addresses on the server and validate current provider coverage. A changed/invalid
service area cannot be bypassed with an old saved place. Controlled own-Rider RPC inputs remain
untrusted geography; permanent verification is performed by the application endpoint, not SQL.

## Experience and refresh

Home and Work appear in the existing horizontal shortcut row. An unset shortcut opens destination
search; after selecting a real result, Save destination offers Save as Home/Work. A set shortcut
fills B and positions the existing map marker. Saving and removing require confirmed server
responses followed by a fresh list. Unknown writes advise refreshing before retrying.

Account → Your destinations supports Add/Edit/Remove. Its progressive address editor reuses
the shared geographic search functions and remains available independently of the active trip's
booking fields. Editing requires a newly selected verified suggestion; typed text alone is not saved.
The editor has Cancel and accessible labels, pending states, touch targets and error messages.

Places are persisted in Supabase, not localStorage. Reads are scoped to user/provider/profile;
late responses are ignored on scope changes. In-memory results clear on sign-out/provider changes.
Reload and foreground refresh read current server state. iOS/Android shells display the hosted
feature without changing session storage, callbacks, signing, application IDs or native builds.

## Release

Additive migration: `20261005000200_rider_saved_places.sql`. Apply before deploying code.
Operations and rollback-only isolation checks are in
`../operations/rider-saved-places-manual-test.md` and `tooling/sql/rider-saved-places-test.sql`.
