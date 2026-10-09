# Native notification acceptance

Do not mark production delivery verified from mocked tests or provider acceptance alone.
Follow native-push-setup.md first. Owner performs deployment, builds and database mutations.
After the channel-preference migration and hosted release, also follow
notification-channel-preferences-manual-test.md to verify mobile alerts with email disabled.

## Local checks

Run relevant Vitest suites, app type checks/lint/builds and Rider/Driver mobile preview tests.
The rollback-only tooling/sql/native-push-test.sql is intended for a disposable Supabase database
with all repository migrations applied. Never run its fabricated account fixtures in production.

For a minimal isolated PostgreSQL smoke check (not full Supabase/RLS or concurrency acceptance):

```powershell
npm install --prefix tmp/native-push-sql --no-save --package-lock=false @electric-sql/pglite
node tooling/scripts/native-push-sql-check.cjs
```

The temporary dependency is ignored. The runner applies a test-only minimal bootstrap, this
migration, and rollback fixtures. Current checks cover private token access, actor/provider
ownership, service-only claiming, stale claims, retry after email success, rebinding and expiry.

## Signed devices

1. Install the new Rider and Driver shells on both iPhone and Android; confirm exact package,
   version, production origin and signed iOS production push entitlement. Use existing auth flows.
2. Sign in to an identifiable test account. Native alerts are off initially. Enable from Rider
   Trips/notification preferences or Driver Notifications. Verify pending, success and denial states.
3. Deny permission, then change permission in OS settings and resume. Verify an accurate state;
   do not request permission on every resume. Turn alerts off and confirm no new queued delivery.
4. With owner-approved test bookings/events, verify generic alerts foreground, background and after
   normal app termination. Force-stop behavior depends on OS restrictions. Check actual device
   receipt, not just accepted counts. Taps open owned Trips/Dispatch, not arbitrary URLs.
5. Sign out and sign into a second account; the second account must explicitly opt in. Change Rider
   provider and confirm no previous-provider alerts or token reassignment of old attempts. Test
   offline disabling/sign-out: show failure without falsely completing the account change.
6. Reinstall/token rotation and expired/revoked sessions must not leak another account's messages.
   Verify Driver eligibility and that expired or already accepted/rejected offers are not sent.
7. Simulate provider failure only in a controlled test environment. Email success must not prevent
   native retries; verify bounded backoff, claim recovery and final expiry. Test missing credentials
   and invalid tokens without logging them or showing raw provider responses.

Restore test-driver availability, finish/cancel test bookings and remove temporary settings/data.
Do not exercise SOS. Inspect logs only for sanitized counts/codes; never paste tokens or keys.
Record device, app version, deployment commit, scenario and actual result in the handoff.
