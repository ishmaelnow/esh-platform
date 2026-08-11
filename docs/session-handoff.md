# Session Handoff

Last updated: 2026-08-10

## Current objective

Deploy and manually verify Live Trip Maps, Routing, and ETA across Admin, Driver, and Rider.

## Repository and deployment state

- Branch: `main`
- Admin session stabilization is deployed and passed production testing. DFW Metroplex and
  Philadelphia service areas were created successfully; Realtime Driver Location passed its live
  production test.
- Live Trip Maps commit `bba70b8`, regional geocoding commit `7b3dcd9`, pre-booking validation commit
  `a3f9ccb`, and migrations through `20260809000200_rider_geocoding_context.sql` are pushed and
  deployed. `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is required in all three Vercel projects.
- Atomic Rider booking/geocoding commit `7ed2442` is pushed and requires migration
  `20260810000100_atomic_rider_geocoded_booking.sql` plus a Rider deployment. A current dry run
  lists only that migration.
- Automatic Driver Matching commit `72c3f93` is deployed; production manual testing passed.
- Realtime Driver Location commit `7121a36` and migration
  `20260801001300_realtime_driver_location.sql` are deployed to production.
- Trigger hotfix commit `6da5ba0` and migration
  `20260802000100_fix_location_stop_triggers.sql` are deployed; Rider booking creation retest passed.
- Confirm migration state with a dry run rather than assuming it from this handoff.

## Delivered capabilities relevant to the test

- Verified Rider email access and tenant-scoped Rider profiles.
- Ride-now self-service booking and cancellation.
- Manual Admin Dispatch and Driver trip lifecycle.
- Driver offer deadlines, expiration recovery, alerts, and email.
- Rider lifecycle emails and Rider-controlled trip-email preference.
- Tenant-time-zone scheduled pickup selection.
- Tenant-controlled minimum notice, maximum advance window, dispatch lead, and reminder lead.
- Scheduled bookings remain unavailable to drivers until dispatch activation.
- Database-native one-minute scheduled activation using `pg_cron`.
- Scheduled confirmation, reminder, and dispatch-started Rider emails.

## Current test checkpoint

Scheduled Rider Bookings production testing passed. The dedicated Admin **Notifications** tab is
visible and functional. Automatic Driver Matching passed production manual testing. Realtime Driver
Location passed Driver, Rider, and Admin typechecks, full repository lint/tests, all three production
builds, and diff checks. Production manual testing has not started.

Verify opt-in and browser permission handling, ten-second coordinate refresh, in-boundary enforcement,
out-of-boundary rejection, five-second Admin visibility, Rider invisibility before acceptance,
ten-second active-trip visibility, stale labeling, cross-tenant isolation, explicit stop, offline stop,
trip-completion stop, audit events, and absence of route history.

Live Trip Maps production testing started with a Philadelphia booking from
`6434 GARMIN ST PHILADELPHIA` to `PHL AIRPORT`. After Driver acceptance, the rendered route reported
42 hr 48 min and 2,866 mi, so the test failed before location-sharing and cleanup checks. Repository
inspection found that geocoding sends only the free-form address plus `country=us`, accepts the first
result, and supplies no service-area proximity/bounds or result-confidence validation. Pickup is
database-checked against the selected service area, but destination locality/distance is not checked;
the destination is therefore the likely incorrect match. Do not continue the live-marker test using
this booking as though its route were valid.

After deploying the regional geocoding correction, a new Aug 10 booking from the same misspelled
`6434 GARMIN ST PHILADELPHIA` pickup to `6800 ELMWOOD AVE` was created and accepted without a map.
This exposed a second failure: the Rider workflow saved the booking after coordinate persistence was
rejected. Pre-booking validation initially required an overly strict street-address confidence and
then rejected the ordinary `chesnut` spelling error. The local correction now accepts medium or
better regional address matches and stores Mapbox's normalized address, while still rejecting low-
confidence and out-of-area results.

Production then accepted a 1:10 AM Philadelphia booking from `PHL AIRPORT` to
`DFW Airport Terminal A` without a map. This proved that compensating cancellation is not a safe
substitute for atomic persistence: booking insertion triggers can begin automatic matching and
notification work before the separate coordinate write fails. Local atomic ride-now and scheduled
RPCs now create the booking and persist coordinates in one transaction, so any coordinate failure
rolls back the booking, offers, audit, and notification outbox work. Browser execution of the older
mapless Rider creation RPCs is revoked.

## Temporary production settings

The test plan recommends temporarily using:

- Minimum notice: 15 minutes
- Maximum advance window: 90 days, or temporarily 1 day for boundary testing
- Dispatch lead: 5 minutes
- Reminder lead: 1 hour

These values are recommendations, not a confirmed statement of current production configuration.
Record the actual values here when the owner reports them.

## Confirmed recent production results

- Rider production portal loads at `https://rider.eshapp.com`.
- Existing Rider identity was recovered successfully in another browser when the magic link was
  requested and opened in that same browser.
- Continued-search Rider email was automatically delivered after an unresolved Driver offer.
- Rider Trip Notifications manual verification produced successful results before scheduled
  booking testing began.

## Known operational detail

Supabase PKCE magic-link exchange must be completed in the same browser/device that initiated that
specific sign-in attempt. The Rider account is portable, but each new browser must request and open
its own link in that browser. Email-app embedded browsers and link scanners can consume or disrupt
one-time links.

## Open issues

Live Trip Maps production testing exposed an implausible cross-country route for a Philadelphia trip:
42 hr 48 min and 2,866 mi from `6434 GARMIN ST PHILADELPHIA` to `PHL AIRPORT`. The geocoder currently
accepts Mapbox's first country-wide result without service-area context or verifying the resolved
place. A local correction now biases Mapbox toward the selected service-area center, evaluates up to
five candidates, and rejects destinations more than 800 km from that center in both application code
and a database trigger. The Rider receives the narrowly scoped active-area context through a new
authenticated RPC. Mapping tests, repository lint, all three production builds, and diff checks pass.
The required database dry run lists only `20260809000200_rider_geocoding_context.sql`.

The subsequent pre-booking validation correction is deployed without another migration. Mapping
tests include the low-confidence `GARMIN` case and pass 6/6; maps lint/typecheck and Rider/Admin
production builds pass, but production proved its compensating-cancellation design was insufficient.

The atomic persistence correction adds `20260810000100_atomic_rider_geocoded_booking.sql`. Mapping
tests pass 9/9, including regional Search Box suggest/retrieve sessions and normalization of
`3141 chesnut street philadelphia`; maps and Rider lint/typechecks plus the Rider production build
pass. The required migration dry run lists only
`20260810000100_atomic_rider_geocoded_booking.sql`.

Production Rider booking creation exposed PostgreSQL `42703` after Realtime Driver Location deploy.
Root cause: one polymorphic automatic-stop trigger referenced availability-only columns while running
for a booking row. Migration `20260802000100_fix_location_stop_triggers.sql` replaces it with two
table-specific functions. The hotfix is deployed and Rider booking creation passed its retest.

The Driver location control was discoverable only inside Overview and only while online. A permanent
Location tab with prerequisite, permission, freshness, accuracy, map, and sharing status is now
deployed in commit `a1381f6`.

Production testing found that the Add Service Area form lost its in-progress values when the Admin
workspace remounted after the browser was backgrounded. A tenant-scoped session draft, controlled
inputs, explicit-clear behavior, and restoration tests were deployed in commit `5236a24`, but the
whole tenant workspace still visibly reloaded on browser refocus. Root cause is repeated same-user
Supabase `SIGNED_IN` events being treated as a new login. Event classification now ignores refocus and
token-maintenance events, performs profile updates in the background, and reserves blocking reloads
for genuine identity changes or sign-out. A second hardening pass keeps resolved content mounted
during refreshes/errors, commits refresh results atomically, rejects stale overlapping responses, and
session-restores the active Admin section. This stabilization is implemented locally.

## Cleanup still required after testing

- Cancel unfinished test bookings.
- Return test Drivers to Offline.
- Restore the tenant's intended scheduling settings.
- Re-enable Rider trip emails if disabled during preference testing.
- Confirm no test booking remains `requested`, `offered`, `accepted`, `arrived`, or `in_progress`.

## Exact next action

Commit/push the regional autocomplete and spelling-normalization correction, apply
`20260810000100_atomic_rider_geocoded_booking.sql`, and deploy Rider. Cancel the active 1:10 AM
mapless test booking; confirm regionally relevant suggestions appear, selection is required, and
`chesnut` is normalized to `Chestnut`, while invalid coordinates create no booking, offer, audit, or
notification. Create a valid booking afterward and restart the shared Rider/Driver map test.

## Required reading for recovery

- `AGENTS.md`
- `docs/roadmap.md`
- `docs/architecture/scheduled-rider-bookings.md`
- `docs/architecture/rider-trip-notifications.md`
- `docs/architecture/verified-rider-booking.md`
- `docs/architecture/manual-dispatch-trip-core.md`
- `docs/architecture/automatic-driver-matching.md`
- `docs/architecture/realtime-driver-location.md`
