# Driver Preorders verification

## Owner release

Run `corepack pnpm exec supabase db push --dry-run` from the repository root. It must list only
`20261009000100_driver_preorders.sql`. Review that output before real database push. Deploy Admin,
Transportation, Driver and Rider after migration. No native rebuild or new variable is needed.

## Local checks

`node tooling/scripts/driver-preorders-sql-check.cjs` runs rollback-only minimal PostgreSQL checks.
`node tooling/scripts/driver-preview.cjs --tests` uses explicit business fixtures with live geographic
tiles at 414 x 896. Run previews separately from production builds and Rider preview, which clears
the shared test-results directory. Screenshots: ignored `test-results/driver-preorders-*.png`.
Run Admin, Driver, Rider and shared Supabase tests and relevant production builds.

## Controlled account checks

Use identifiable test bookings and consenting accounts. Respect schedule notice limits and existing
pricing/payment; never bypass them with production SQL.

1. Open Home/Preorders, both tabs and back at 414 x 896. Check counts, scrolling, empty, loading and
   network error states. Failed writes must not falsely confirm reservations or preferences.
2. Create a priced future scheduled trip in an eligible area. New shows real time/fare without
   exact addresses. Unrelated tenants and ineligible Drivers cannot see/reserve it.
3. Reserve while offline. Assigned shows addresses; Driver remains offline and Rider scheduled.
   Reload. Another Driver cannot reserve the same trip; overlapping reservations are rejected.
4. Release while scheduled: Rider booking remains intact. Rider cancellation clears reservation.
   Admin Dispatch shows tenant-only history.
   In Rider Trips, Cancel trip must appear on scheduled bookings. Verify refund/wallet restoration
   as applicable and that a failed cancellation leaves the trip visible for retry. After success,
   open Show history / Book again, review addresses, select the new pickup time and confirm a fresh
   fare/payment. Check the old Driver reservation disappears; the new trip is independently reservable.
5. Enable Receive while offline and reload; availability stays unchanged. With email OFF/device
   ON, a newly available preorder alerts the device without email. Offline receipt OFF suppresses
   new availability while offline. Opting in does not replay old trips. Taps open Preorders.
6. Be online and eligible at readiness: expect one normal timed priority offer. Test acceptance,
   decline/expiry and offline fallback through existing lifecycle. Busy, noncompliant or vehicle-less
   Drivers must not receive priority assignment. Disabled matching waits for normal manual dispatch.
7. Another active Rider trip delays activation without losing reservation. Network resume recovers
   confirmed state. Check native notifications on both platforms separately from browser mocks.

Finish/cancel test bookings, restore preferences, return Drivers Offline, and clear unfinished
offers. Full concurrent-session and complete Supabase-chain verification remain release checks.
