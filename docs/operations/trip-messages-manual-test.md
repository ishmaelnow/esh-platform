# Trip messages release and manual checks

## Owner release

From the repository root run `corepack pnpm exec supabase db push --dry-run`. Confirm only
`20261010000100_trip_messages.sql` is listed before applying. Deploy Rider, Driver and Admin from
the same committed version. No native rebuild, credentials or new variables are needed.

## Controlled two-account acceptance

Use clearly identifiable test bookings and consenting accounts; never use production credentials
in shared screenshots. Driver should reply only when safely stopped.

1. Before Driver acceptance, no Trip messages action should appear. After acceptance open Rider
   Trips / Driver Dispatch and expand Trip messages on both devices.
2. Send a short message each way. Verify sender identity and time, plain text wrapping, navy
   controls, readable lists and access to the composer/button at 414 x 896 and with keyboard open.
3. Close and reopen the conversation: confirmed messages reload. Drafts are not saved to storage.
   Put the receiving app in the background with mobile alerts enabled: generic message alert should
   arrive through the normal minute delivery/retry job; text must not be visible in the alert.
   Tap it and confirm authenticated Trips/Dispatch opens. Check both iPhone and Android separately.
4. Keep email OFF; verify native alerts still work and no message email/SMS is generated. With
   device alerts OFF, messages remain available in-app without prompting for new permission.
5. Lose network while sending: text stays for retry; reconnect and retry without a duplicate.
   Foreground/resume refresh recovers messages. No offline send should occur automatically.
6. Confirm another Rider/Driver/tenant and anonymous caller cannot fetch or send for this booking.
   Reassign through existing authorized dispatch: old Driver loses access and new thread is empty.
7. Start the trip: messaging remains available. Complete or cancel: controls disappear, RPCs deny
   access and messages are deleted. Any unclaimed native message alerts must be discarded.

Cancel/finish test rides, restore preferences and return Drivers Offline. Record device results
separately from browser fixtures. Do not initiate another real paid ride solely for layout checks.

## Local verification

- `node tooling/scripts/trip-messages-sql-check.cjs` uses an ignored disposable PGlite install and
  minimal legacy schema; no environment credentials/remote connection. It is not a full-chain test.
- Shared Supabase, Admin, Rider and Driver unit tests; production builds and scoped lint.
- Rider and Driver preview scripts with `--tests`, sequentially after builds. Each preview clears
  the shared test-results directory. Complete expanded screenshots are local fixture evidence:
  `test-results/rider-trip-messages-414.png`, `test-results/driver-trip-messages-414.png`.

Limitations: no guaranteed real-time push receipt, transcript after closure, attachments, delivery/read
receipts or background polling. Existing notification operational history records provider attempts.
