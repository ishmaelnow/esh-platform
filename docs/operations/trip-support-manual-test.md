# Trip support release and manual checks

## Owner release

Run from the project root in the shell authenticated to Supabase:

    corepack pnpm exec supabase db push --dry-run

The initial migration `20261010000400_trip_support.sql` is already owner-applied. For response alerts,
confirm only `20261010000500_trip_support_notifications.sql` is listed. Only after that confirmation,
apply through the normal owner-controlled database push. Deploy Rider and Admin (the sender and
minute worker). Transportation's review RPC stays unchanged. No native rebuild or environment changes.

## Manual acceptance

Use a clearly identified existing completed/cancelled test ride; no new real payment is necessary.

1. Rider: Trips → Show history → Get help. Confirm the correct route remains visible. Select Lost
   item, describe a TEST item, submit, and verify Received plus a report reference. Reopen/refresh
   and confirm one report. The same report type should no longer be offered for that trip.
2. Submit a Trip issue on that test ride if needed. Empty/short text is blocked. Do not include real
   card numbers, ID documents or other sensitive data. Text containing HTML must display as text.
3. Transportation: open Trip support. Confirm the report, Rider, booking and route. Select Under
   review, enter a Rider-visible response and Save response. Return to Rider Get help, refresh and
   verify the response. Resolve with another response; both responses remain visible.
4. Try concurrent Admin tabs: after one saves, a stale different review must be rejected; refresh
   before editing again. A failed update must not falsely show the selected status as confirmed.
5. With network disabled, verify a failed submit keeps text and explains uncertainty. Reconnect,
   refresh first, then retry the same text only if not received. Never create a second report for
   the same category/trip. Confirmed submission plus failed refresh must still say Report received.
6. Verify other Riders, Drivers, unrelated tenant administrators and anonymous users cannot read,
   submit or review this trip's cases. Suspended/inactive identities must lose access. Switch
   account/provider with a pending load and confirm no previous account's report appears.
7. At 414 × 896, 320px width and with the real keyboard open, scroll to all fields and action
   buttons without overlap/sideways overflow. Confirm existing booking, payment and trip history
   remain usable. Test iPhone and Android independently.
8. Confirm no refund, SMS, emergency action, Driver message or dispatch change is triggered.
   Follow the response-alert checklist below. Restore test preferences,
   resolve clearly labelled TEST reports, and restore any Driver availability/bookings changed
   during separate tests. Audit metadata must omit report and response bodies.

## Local checks

- `node tooling/scripts/trip-support-notifications-sql-check.cjs`: actual native, channel, preorder,
  support and support-alert migrations against minimal legacy stand-ins. Checks no-channel,
  mobile-only and email-only delivery, review retry deduplication, generic metadata, exact native
  routing and suppression after access revocation. No production credentials or delivery.

- `node tooling/scripts/trip-support-sql-check.cjs`: ignored local PGlite installation, disposable
  minimal schema only. Does not read production credentials or connect remotely.
- Shared controller/unit tests plus Rider/Admin regressions, scoped lint and production builds.
- `node tooling/scripts/rider-preview.cjs --tests`: Rider 414 × 896, uncertain send/retry, response,
  short viewport and 320px overflow; screenshot `test-results/rider-trip-support-414.png`.
- `node tooling/scripts/trip-support-preview.cjs`: isolated Transportation server on port 3014 and
  mocked auth/data, Admin review/filter/failure/short viewport. Screenshot
  `test-results/admin-trip-support-414.png`. Run browser suites sequentially: Playwright clears
  test-results between runs. Copy evidence elsewhere before starting another suite if retaining it.

## Response-alert acceptance

Use an identifiable existing TEST report, not a real support incident. Restore preferences afterward.

1. Turn Rider Trip update emails off; leave mobile alerts enabled on the intended account/device.
   Admin saves one new reply. Within the worker's processing window, check a generic device alert
   and no support email. Tap it: the correct report and response should open directly in Trips.
2. Resolve with a new response. Confirm another generic update and Resolved on the same report.
   Retrying an identical uncertain Admin save must not create a second review/event. Provider
   timeout retries can still duplicate receipt under the existing at-least-once delivery contract.
3. Enable email and disable device alerts. Save another TEST response and verify generic email
   with the correct report link, no private text/address/name, and no alert to a disabled device.
4. Disable both channels. Save a response: no new outbound event; Get help still shows the response.
   Reenabling a channel must not replay the disabled review. No support SMS should be attempted.
5. Test tapping on iPhone, Android and browser; include foreground and closed app. If signed out,
   sign in with the owning account and reopen the alert. Another account/tenant must not see the
   report. Revoked registrations/sessions and inactive identities must not receive queued native
   alerts. Verify ordinary trip/offer alerts still work; do not trigger SOS or real payments.
6. Check Admin /api/cron/native-notifications logs: authenticated scheduled runs succeed, support
   delivery results are visible, and unauthorized calls fail. Queue/provider outages must not
   falsely report device receipt. Inspect Admin delivery history for failures before retrying.

Production migration/deployment, real account isolation, physical keyboards and actual provider
receipt remain owner acceptance checks. No attachments or Rider follow-up thread; reports and
responses are retained with trip history.
