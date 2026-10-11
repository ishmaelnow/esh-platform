# Driver trip support acceptance

First run `corepack pnpm exec supabase db push --dry-run` in the authenticated environment.
Confirm only `20261010000600_driver_trip_support.sql` is listed before running the real push.
After the owner commits/pushes, confirm Driver, Transportation and Admin sender deployments
are Ready at that commit. No Codemagic rebuild or new secret is required.

Use clearly identified test accounts and finished test trips; do not create a payment,
refund or emergency action just to test support.

1. Driver menu → Recent orders → completed/cancelled order → Get help.
   Submit a clearly labelled test issue. An active trip must not offer this history action.
2. Try a temporary network failure. The explanation stays professional and the draft remains.
   Restore connectivity, refresh reports before retrying, and verify only one case exists.
3. Check a lost-item report, narrow phone width and open keyboard. Every field and Submit report
   remain reachable by scrolling. Switching apps preserves the unsent draft in the current page.
4. Transportation → Trip support → Reports from → Drivers. Review the correct Driver/report,
   save a reply, then resolve it. Rider reports remain available under Riders.
5. Driver refreshes reports and sees the reply/status. Another Driver and the Rider must not
   see this report. Another tenant's Admin must not see or review it.
6. With trip-offer/support email off and device alerts on, save another clearly identified
   response. Confirm generic device alert and exact-report navigation in foreground and cold
   start. With email on, confirm generic email routing. Restore original preferences afterward.
7. Confirm denied/stale report links show an unavailable message, never another report.
   Existing dispatch, preorders, availability, earnings, documents and Rider support still work.

Restore temporary preferences and Driver availability; cancel any unfinished test bookings.
Provider acceptance alone does not establish device receipt. Record physical acceptance separately.
