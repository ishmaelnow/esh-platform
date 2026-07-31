# Session Handoff

Last updated: 2026-07-31

## Current objective

Complete production verification of Scheduled Rider Bookings across Rider, Admin Dispatch, Driver,
automatic activation, and transactional email.

## Repository and deployment state

- Branch: `main`
- Repository was clean and synchronized with `origin/main` at this checkpoint.
- Latest confirmed commit: `f74265d feat: add scheduled rider bookings`
- Scheduled booking migration: `20260801001100_scheduled_rider_bookings.sql`
- The project owner reported beginning the production manual test after deployment.
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

Scheduled Rider Bookings production testing is complete. All tested scheduled-booking behavior
passed except Admin notification discoverability.

Reported failure:

- No dedicated **Transactional notifications** tab or clearly discoverable navigation action was
  visible in Admin.
- Notification records and delivery controls currently live inside the Drivers view, which does
  not match the operational scope or the manual test expectation.
- Treat this as an Admin information-architecture/usability defect, not evidence that scheduled
  notification enqueueing or delivery failed.

Use the professional test plan already provided in the active conversation. If that conversation
is unavailable, reconstruct it from `docs/architecture/scheduled-rider-bookings.md` and verify at
minimum:

1. default and updated tenant scheduling rules;
2. unchanged Ride now behavior;
3. future booking creation and Admin visibility;
4. confirmation email and privacy boundary;
5. minimum-notice and maximum-advance enforcement;
6. Rider and Admin cancellation;
7. one scheduled reminder;
8. automatic activation within approximately one minute of `dispatch_ready_at`;
9. one dispatch-started notification;
10. normal offer, acceptance, trip execution, and completion after activation;
11. notification preference behavior, tenant isolation, and cross-browser persistence.

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

- Add a dedicated Admin **Notifications** tab for tenant-wide Driver, vehicle, dispatch, and Rider
  transactional notifications.
- Move the existing notification summary, delivery action, status/history, errors, and retry
  controls out of the Drivers view into that tab.
- Preserve the current tenant authorization and shared outbox behavior.

## Cleanup still required after testing

- Cancel unfinished test bookings.
- Return test Drivers to Offline.
- Restore the tenant's intended scheduling settings.
- Re-enable Rider trip emails if disabled during preference testing.
- Confirm no test booking remains `requested`, `offered`, `accepted`, `arrived`, or `in_progress`.

## Exact next action

Implement and validate the dedicated Admin Notifications tab, then repeat only the notification
visibility, manual delivery, failure/retry, and Rider scheduled-email test cases.

## Required reading for recovery

- `AGENTS.md`
- `docs/roadmap.md`
- `docs/architecture/scheduled-rider-bookings.md`
- `docs/architecture/rider-trip-notifications.md`
- `docs/architecture/verified-rider-booking.md`
- `docs/architecture/manual-dispatch-trip-core.md`
