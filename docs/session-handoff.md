# Session Handoff

Last updated: 2026-08-02

## Current objective

Deploy and manually verify the Admin session-lifecycle stabilization, then create DFW Metroplex and
resume Realtime Driver Location testing.

## Repository and deployment state

- Branch: `main`
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
for genuine identity changes or sign-out. This stabilization is implemented locally.

## Cleanup still required after testing

- Cancel unfinished test bookings.
- Return test Drivers to Offline.
- Restore the tenant's intended scheduling settings.
- Re-enable Rider trip emails if disabled during preference testing.
- Confirm no test booking remains `requested`, `offered`, `accepted`, `arrived`, or `in_progress`.

## Exact next action

Commit and push the Admin session stabilization, confirm the entire active Admin view remains mounted
across repeated browser-tab switches, create DFW Metroplex, and resume the location test.

## Required reading for recovery

- `AGENTS.md`
- `docs/roadmap.md`
- `docs/architecture/scheduled-rider-bookings.md`
- `docs/architecture/rider-trip-notifications.md`
- `docs/architecture/verified-rider-booking.md`
- `docs/architecture/manual-dispatch-trip-core.md`
- `docs/architecture/automatic-driver-matching.md`
- `docs/architecture/realtime-driver-location.md`
