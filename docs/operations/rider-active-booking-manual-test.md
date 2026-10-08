# Rider active booking acceptance

Apply the database migration before deploying the Rider change. The owner runs:

```sh
corepack pnpm exec supabase db push --dry-run
```

Check that only `20261007000100_rider_active_booking_guard.sql` is listed before proceeding
with the real database push. Codex has not applied this migration remotely.

Local isolated database smoke check:

```sh
node tooling/scripts/rider-active-booking-sql-check.cjs
```

This uses the existing temporary PGlite installation and minimal bootstrap schema. Never
run its bootstrap fixture against production. Full Supabase and concurrent-session acceptance
remain required in an isolated test environment.

Use identifiable test accounts and the existing no-charge test configuration. Verify:

1. Requested, offered, accepted, arrived, and in-progress rides each block a second current
   booking. Refresh and test another signed-in device and another provider profile.
2. Scheduled and recurring future reservations remain available while a current ride exists.
3. Complete or cancel the current ride normally; a new current booking then succeeds.
4. Race two current-booking requests in separate sessions. Only one new active booking commits.
   Test direct booking RPC and wallet flows as well as the UI; do not use live paid checkouts.
5. A due scheduled trip waits for its busy Rider. Another Rider's due trip still activates.
   After completion/cancellation, the next scheduler run activates one waiting trip.
6. A repeated paid-quote recovery returns its existing booking rather than creating another.
7. Anonymous and ordinary authenticated clients cannot read or write the private slots or
   invoke the private scheduler. A null tenant must not activate bookings across providers.

Inspect legacy duplicates read-only before release:

```sql
select r.person_id, count(*) as active_rides
from public.dispatch_bookings b
join public.rider_profiles r on r.tenant_id=b.tenant_id
  and r.rider_profile_id=b.rider_profile_id
where b.status in ('requested','offered','accepted','arrived','in_progress')
group by r.person_id having count(*)>1;
```

Existing duplicates are not cancelled by migration. Review through normal operations.
An already-open checkout can still be paid while another ride is active. If its quote is
paid but unbooked, recover the same quote after the active ride ends or use the authorized
refund procedure. Do not create another payment to solve this condition.

Restore test Driver availability and resolve unfinished test bookings afterward. Real iPhone
payment-return acceptance remains separate: start with cancellation before any approved
controlled successful payment, following `rider-payment-return-manual-test.md`.
