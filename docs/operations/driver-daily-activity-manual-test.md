# Driver daily activity acceptance

Owner-only migration/deployment procedure:

1. Run `corepack pnpm exec supabase db push --dry-run` in the authenticated environment.
2. Confirm only `20261011000100_driver_daily_activity.sql` is listed; stop on unexpected migrations.
3. Run `corepack pnpm exec supabase db push` only after that intended-only confirmation.
4. Commit/push the reviewed source and confirm Driver Ready. No native rebuild is required.

Use an identifiable test Driver and restore Offline/temporary settings/unfinished test bookings.
Do not change financial records or approve simulated distance adjustments for these checks.

- At 414 x 896 and a compact phone width, verify the card, map attribution and availability
  switch remain visible without overflow.
- A Driver with no completed trips today shows zero trips and 0 km. Missing measurements on
  completed trips show Unavailable, never quoted mileage or a partial sum.
- Go Online, wait two minutes, then Offline. Time grows while Online and remains stable Offline.
  Reconnect/reload and verify it does not reset. Repeated Online does not double count.
- On a normal trusted measured completed test trip, verify the total refreshes after completion.
  It excludes pickup travel, cancelled trips and other Drivers/tenants.
- Change the device timezone without changing the company timezone: company-day trip/distance
  totals remain consistent. Overnight/DST cases are also covered in disposable SQL tests.
- Block the daily-activity RPC, trigger foreground refresh, and verify unavailable values replace
  stale data. Restore connectivity and confirm the next refresh recovers.
- Switch accounts and verify the previous Driver's totals never appear in the new account.
- Time online is recorded availability-setting duration, not a connectivity or historical
  compliance report. Existing uncertain audit history is deliberately unavailable.

Local checks: `node tooling/scripts/driver-daily-activity-sql-check.cjs` uses the existing ignored
PGlite installation under tmp/native-push-sql; it never connects to production.
