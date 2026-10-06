# Rider saved Home and Work acceptance

## Owner release sequence

This hosted feature needs one additive migration and a Rider deployment, not a Codemagic rebuild.
The owner runs Git/deployment/database mutations. Preserve unrelated Driver/Rider generated
tsconfig edits. Existing native session recovery and approved design must stay unchanged.

In the shell with the existing Supabase connection:

```bash
corepack pnpm exec supabase db push --dry-run
```

Confirm the only intended new migration is `20261005000200_rider_saved_places.sql` before
running the real push. If the list differs, stop and inspect it. Then the owner runs:

```bash
corepack pnpm exec supabase db push
```

Deploy the feature through the existing Rider project and verify its commit is Ready.
The configured Mapbox account must support the permanent geocoding already used by quoting.
Failures leave the prior saved address intact and display an error; never insert sample places.
Before the migration, the UI reports that saved addresses cannot be loaded or updated.

## Manual checks

1. Use an identifiable Rider account with an active profile/provider. At 414 × 896, verify
   Request ride, plus, Home, Work and horizontal recent destinations. The panel/map proportions,
   attribution, menu, safe area and full-width layout must remain unchanged.
2. With Home unset, tap Home. Search for a real complete street address, select the suggestion,
   and tap Save as Home. Confirm success, exit with Home, then use the Home shortcut again:
   the actual address appears in B with its map marker. Repeat for Work. Typed text without
   selection cannot be saved.
3. Reload, close/reopen the app, and sign in to this same provider/account on another device.
   Home/Work must still be present. No additional verification beyond existing authentication
   is introduced by this feature.
4. Account → Your destinations: Edit Home, select another real address and Save Home. Cancel
   must preserve the old record. Remove Home, reload and verify it is unset while Work remains.
   Use Add Home to save it again. Confirm editing is accessible during an existing trip.
5. Switch providers: stored addresses must not appear in another provider's profile. Sign out
   and use a different Rider: the first Rider's addresses must never appear or be editable.
   Switch during a slow save/read; late results must not populate the new account.
6. Disconnect the network during load/save/remove. Verify clear errors, no false success,
   preservation of the previous server state, and recovery with Refresh saved addresses.
   Refresh after uncertain writes before repeating. Try an ambiguous/unsupported address:
   it must not replace a saved place with invented or unverified geography.
7. Use a saved destination with a valid pickup and Review fare. Current server geocoding,
   coverage and pricing remain authoritative; a saved address cannot permit an uncovered trip.
   Check actual vehicle/time/payment/note controls and recent trips. Do not create a production
   payment solely for appearance testing. Cancel unfinished test bookings; keep test Drivers Offline.
8. At 320 px and with the physical keyboard open, verify readable address labels, no horizontal
   page overflow, reachable Save/Cancel and normal vertical scrolling. A resized browser viewport
   alone is not proof of a physical iOS/Android keyboard test.

## Isolated checks

The existing Rider preview tests intercept all business/auth/map data; they do not write production.
They cover Home/Work save/reload/edit/remove, failures, permanent-geocoding endpoint authorization
and the existing map/booking/auth regressions. Test fixtures are not production destinations.

Run the rollback-only SQL fixture on an owner-controlled disposable/local database with all
migrations installed:

```bash
psql -v ON_ERROR_STOP=1 -f tooling/sql/rider-saved-places-test.sql
```

It creates clearly marked users/providers, verifies anonymous/direct-write denial, same-provider
Rider isolation, cross-provider isolation, expected-profile mismatch, Manager read denial,
invalid geography, unverified/inactive rejection, upsert/remove and private audit metadata, then
rolls back. This is not a production Supabase SQL Editor script. Local execution is pending because
the Docker database daemon is unavailable. Browser/API mocks do not prove live RLS execution.
