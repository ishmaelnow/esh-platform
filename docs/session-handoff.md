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
passed. The Admin notification section was subsequently found under **Drivers**, confirming that
the original failure was discoverability rather than missing data.

Reported failure:

- No dedicated **Transactional notifications** tab exists in Admin.
- Notification records and delivery controls live inside the Drivers view, which does not match
  their tenant-wide operational scope.
- Production evidence showed 10 Rider lifecycle notifications queued and a Driver dispatch-offer
  notification delivered, confirming outbox enqueueing and delivery-state visibility.
- The project owner used **Deliver notifications**, and the accumulated Rider emails were delivered
  in a single batch, producing a noticeable notification flood across their devices. This confirms
  end-to-end delivery but exposes the need for batch-size disclosure and safer delivery controls.
- Treat the remaining issue as Admin information architecture plus an operational delivery backlog,
  not missing notification generation.

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

- Dedicated Admin **Notifications** tab, bounded batches, exact message/recipient warning,
  confirmation, status filtering, and individual delivery/retry have been implemented locally and
  require production deployment and focused retesting.

## Cleanup still required after testing

- Cancel unfinished test bookings.
- Return test Drivers to Offline.
- Restore the tenant's intended scheduling settings.
- Re-enable Rider trip emails if disabled during preference testing.
- Confirm no test booking remains `requested`, `offered`, `accepted`, `arrived`, or `in_progress`.

## Exact next action

Deploy the dedicated Admin Notifications tab, then repeat only notification visibility, bounded
batch confirmation, individual delivery/retry, status filtering, and Rider scheduled-email tests.

## Required reading for recovery

- `AGENTS.md`
- `docs/roadmap.md`
- `docs/architecture/scheduled-rider-bookings.md`
- `docs/architecture/rider-trip-notifications.md`
- `docs/architecture/verified-rider-booking.md`
- `docs/architecture/manual-dispatch-trip-core.md`
