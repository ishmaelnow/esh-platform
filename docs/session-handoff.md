# Session Handoff

Last updated: 2026-08-01

## Current objective

Deploy and manually verify Realtime Driver Location across Driver permission/control, service-area
enforcement, Admin visibility, Rider active-trip privacy, freshness, and automatic stop behavior.

## Repository and deployment state

- Branch: `main`
- Automatic Driver Matching commit `72c3f93` is deployed; production manual testing passed.
- Realtime Driver Location is implemented locally and is not yet committed or deployed.
- New migration: `20260801001300_realtime_driver_location.sql`.
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

No known unresolved production defect. Realtime Driver Location awaits validation and deployment.

## Cleanup still required after testing

- Cancel unfinished test bookings.
- Return test Drivers to Offline.
- Restore the tenant's intended scheduling settings.
- Re-enable Rider trip emails if disabled during preference testing.
- Confirm no test booking remains `requested`, `offered`, `accepted`, `arrived`, or `in_progress`.

## Exact next action

Commit the feature, dry-run and deploy migration `20260801001300`, push production, then execute the
Realtime Driver Location production manual test plan.

## Required reading for recovery

- `AGENTS.md`
- `docs/roadmap.md`
- `docs/architecture/scheduled-rider-bookings.md`
- `docs/architecture/rider-trip-notifications.md`
- `docs/architecture/verified-rider-booking.md`
- `docs/architecture/manual-dispatch-trip-core.md`
- `docs/architecture/automatic-driver-matching.md`
- `docs/architecture/realtime-driver-location.md`
