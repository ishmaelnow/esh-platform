# Student internal review and recurring planning acceptance

Owner pushed b75afc6 and confirmed Student Vercel Ready. Migration 20261017000100 is owner-confirmed applied.
Internal manual acceptance remains pending. Use clearly labelled TEST-only students,
policy/evidence references and dedicated resources. No real minors' data or student transportation.
Preserve ordinary products and Student operational lock; use existing NEXT_STUDENT_SUPABASE_SECRET_KEY
and public Mapbox configuration. No new variable, callback, native build, email or payment setup.

## Owner release

Owner supplied an intended-only dry-run followed by successful application of
20261017000100_student_recurring_planning.sql on 2026-10-17. Do not reapply it,
20261016000100 or any earlier accepted migration. Owner performs all staging/commit/push/deployment
and checks Student Vercel Ready. Existing unrelated config/assistant/preorder changes remain separate.

## Internal acceptance

Current owner checkpoint (2026-10-19): the existing December TEST request is submitted, visible
internally and has working road previews. Do not recreate it. Policy save is unconfirmed; resume
at step 3 after the local save-feedback repair is released. Select the correct Operating business
first: Community Hub previously displayed a separate empty queue. /school is the customer intake;
/clients is internal review. Sign out only when actually changing identities.

Opening Add qualification policy now scrolls to its form. Required-field and key-format errors
appear beside Save; the invalid required field receives focus. Credential keys use lowercase
letters, digits and underscores, start with a letter, and contain no backticks/quotes. Empty
equipment-specific lists remain optional. Correct validation entries in place. A confirmed SQL
rejection permits a fresh corrected save; a transport failure has uncertain outcome, so retry
unchanged or refresh planning to inspect records before changing it. A successful save closes the
editor, displays "Planning revision saved" and adds a register entry. A visible form alone never
proves persistence. Copy the visible error/SQL code if a failure remains; no DevTools required.

1. Create a fresh disposable geographic customer request through the existing /school flow (do not
   reuse a withdrawn request). Include distinct TEST students requiring a lift, a restraint and a
   dedicated attendant. Keep its source request submitted during planning checks.
2. In /admin -> Customers and transportation requests (/clients), sign in as an explicitly admitted
   internal reviewer. Click Open route planning. Customer and owner-only accounts must not gain
   planning records; staff without reviewer permission have read-only inspection.
3. Select the source geographic request, then add its customer-bound qualification policy: use an approved TEST policy reference, required base Driver/attendant
   credential keys and equipment-specific keys matching the TEST credential records you will enter.
   Explicitly review the policy. Do not enter assumed legal requirements or real credentials in TEST.
4. Add dedicated vehicle, Driver and attendant records. Record reviewed effective dates/evidence.
   Use one reviewed vehicle configuration and reserve attendant seating separately. Enter required
   human credential keys/dates/evidence references. Do not use resources shared with live products.
5. Select the source geographic request. Register canonical student identities with stable school
   references and authority/requirements review, including a deliberate review when no tags apply.
   A child name alone must not automatically bind identity or parent access. An occupied wheelchair
   position must not be counted as a passenger seat. Source requirements cannot silently disappear.
6. Review each home and school loading point: exact coordinates, meaningful label, curb/driveway/
   designated-zone type, effective dates, loading instructions and site/district approval reference.
   Verify coordinates on the actual site; do not treat the geocoder as an approval. Revise one point
   after creating a draft and verify the old reference fails until explicitly updated.
7. Create recurring schedule: name/reference, inbound/outbound direction, school time zone, term,
   weekdays, pickup/drop-off window, explicit reservation buffer and reasoned school closure dates.
   Confirm the calendar. Explicitly match each request child to a canonical student, confirm each
   match, select reviewed points and inspect/reorder stops. For afternoon choose school-to-homes
   and a separate template. No automatic optimization or multi-school grouping is promised.
8. Select policy and dedicated resources. Incompatible vehicle/credential choices should be disabled.
   Save draft. Refresh/reopen: draft and selected record versions persist. Fail a save in local
   fixtures and retry unchanged: same key, one revision. Changed unresolved writes require refresh.
9. Preview reviewed route. Check actual geometry/point order and recover from provider failure.
   Approve planning data with a reason. Expect a new planning-approved revision, never a released ride.
   Missing credentials, dates expiring before term end, missing equipment/attendant, occupied seating
   mismatch, stale point/authority or own customer self-review must block approval server-side.
10. Generate a small future range (maximum 14 dates). Verify weekdays/closures, school time zone,
    frozen student/loading/resource snapshots, seat demand per segment and reserved absolute windows.
    Repeat unchanged generation: no duplicate revision. Use a second template with overlapping
    resources/student: generation must fail with no partial reservations/manifests.
11. Revise a template/record with a reason and new approval, then generate affected future dates:
    prior daily revisions remain unchanged and the new revision records the new inputs/actor/time.
    A newly excluded day receives cancellation, retaining its old planned snapshot. Review history
    and date-specific history must show both. Past-date generation is denied. DST gap/fold windows
    are denied; choose an unambiguous service time rather than accepting a guessed offset.
12. Cancel a generated TEST date; verify a new cancelled revision and released planning reservations.
    Regenerating the same template must not restore that cancelled day. Use a newly reviewed template
    revision only if intentionally restoring it. No actual execution, cancellation email or refund.
13. Withdraw the source customer request. Internal refresh must show cancelled schedules/future
    manifests. Do not interpret immutable prior planning records as executed trips. Restore any
    temporary admission/settings; confirm which TEST requests were withdrawn without claiming deletion.
14. Check 414x896, 320px and desktop. Switch tenant/account, revoke access, refresh and sign out:
    private planning state disappears. Verify direct history writes and customer/other-tenant reads
    fail. No ordinary booking, Driver availability, payment, native or parent-tracking change.

## Local verification

`node tooling/scripts/student-enrollment-sql-check.cjs` executes actual new SQL plus existing Student
migrations on minimal legacy fixtures. Planning cases are in student-planning-sql-cases.cjs. Unit/API
checks cover planning parsers/compatibility and the server road-proof boundary. Enabled disposable
localhost build precedes `node tooling/scripts/student-planning-browser-check.cjs`; use the same
nonsecret public config as existing Student browser checks and no production connection. Screenshot
evidence lives under ignored tmp/student-planning-evidence. Restore default-off production output.
These checks are not full deployed Supabase/concurrency, actual district evidence/site approval or
real Driver/vehicle integration certification. Owner actual-account/provider acceptance remains.
