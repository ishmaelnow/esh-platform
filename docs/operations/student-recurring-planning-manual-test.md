# Student internal review and recurring planning acceptance

Source release pending. Migration 20261017000100 is owner-confirmed applied. Use clearly labelled TEST-only students,
policy/evidence references and dedicated resources. No real minors' data or student transportation.
Preserve ordinary products and Student operational lock; use existing NEXT_STUDENT_SUPABASE_SECRET_KEY
and public Mapbox configuration. No new variable, callback, native build, email or payment setup.

## School-specific policy release and acceptance (2026-11-24)

Current checkpoint: owner supplied an intended-only dry-run and successful application of
20261122000100_student_school_policy_rules.sql. Database prerequisite is satisfied; do not
repeat the push. Next owner commits/pushes the application changes through GitHub and verifies
the Student deployment Ready before hosted acceptance.

The latest local change adds migration20261122000100_student_school_policy_rules.sql. Apply it
before releasing the new UI; it is backward compatible with existing policies/clients. Owner runs
`corepack pnpm exec supabase db push --dry-run` from C:\Users\koshi\esh-platform. Confirm that
ONLY that intended migration is listed before providing/running the real push command. Do not
reapply old migrations, reset a database, or change credentials. Owner deploys through GitHub.

After migration and Student deployment Ready, use TEST-only policy data in staff /admin:

1. Open route planning, select the existing test school request, then School setup and advanced
   reviews -> Add qualification policy. Only choose qualification categories that this school's
   documented policy requires. No invented Driver/attendant codes or unrelated equipment entries.
2. A policy with no additional qualification requirements may leave all qualification toggles off.
   Set route minimum0 if no general monitor is required; dedicated student needs still apply.
   Enter policy references/dates/reason and explicitly review it. Save must work. Selecting a
   qualification category requires its actual qualification names; removing that category stops
   demanding its inputs, including clearing its validation error.
3. A different school policy can require named Driver training, equipment training and/or a route
   monitor. Its rules must be applied only to that customer's route, with reserved attendant seats.
   Missing required training, lift/restraints or capacity must still block planning approval.
4. Existing legacy policies remain legacy on reopen/revision. Only the explicit checkbox to use
   school-specific rules may change that interpretation, with a new reviewed revision. Do not
   modify the owner's saved TESTING TODAY policy simply to repeat already accepted form tests.
5. Review coverage defaults to whole term. Per-service-date mode may plan beyond evidence expiry,
   but each manifest must have valid evidence for its actual date. A batch crossing expiry fails
   atomically; no partial manifests. Renew/review evidence and explicitly revise/reapprove linked
   schedule versions before later dates. An existing manifest's immutable snapshot stays intact.
6. Optional school loading procedure appears beside stop review; it does not approve geocoded pins.
   Customer accounts/unrelated schools/tenants must not gain policy write or planning access.

Local automated tests use isolated SQL and intercepted browser fixtures; no production student,
policy, resource, reservation or manifest mutation is performed by those tests.

## Owner release

Owner supplied an intended-only dry-run followed by successful application of
20261017000100_student_recurring_planning.sql on 2026-10-17. Do not reapply it,
20261016000100 or any earlier accepted migration. Owner performs all staging/commit/push/deployment
and checks Student Vercel Ready. Existing unrelated config/assistant/preorder changes remain separate.

## Guided route acceptance (new release)

Use the existing saved TEST request and reviews; do not recreate the customer, policy, resources
or students. This local change is not live until owner Git push and Student deployment Ready.
Apply the school-policy migration above before this UI release. No environment-variable change
is required; no old planning/geography migration needs to be reapplied.

1. Open https://school.eshapp.com/admin as admitted staff ishmaelkosh@gmail.com. Select ESH
   Education -> Requests and planning -> Open route planning.
2. In Source geographic request choose the existing December12 THIRD SCHOOL TEST request.
   Plan this request opens at 1. Review request. Saved same-school students are suggested;
   inspect the school reference and requirements and explicitly confirm each child. No name
   match may check the confirmation automatically. Missing/ambiguous identities resolve beside
   that student. A new identity still needs its real school reference and authority review.
3. Continue to stops. The list contains three homes plus school; saved reviews appear only at
   their exact request stop. RETESTING's actual binding is still unverified until seen here.
   Use Review this stop only for missing points. Its inline form locks the source stop and
   generates its internal reference. Staff supply real dates/site evidence/verified coordinates
   and review attestation; test entries certify software behavior only, not physical safety.
   Save stays within the flow. Use Show proposed road route for context; it does not approve stops.
4. Continue to schedule. Enter school time zone, term, service times/days and calendar review.
   Student/point links are already carried over. Compatible unique resources/policy are suggested
   after dates are entered; resolve alternatives or missing evidence in School setup and advanced
   reviews. Existing TEST qualifications are not guaranteed to match until actually checked.
   Back to stops then Continue to schedule must preserve entered schedule fields.
5. Save schedule draft. Success selects that saved draft under Recurring schedule; use Preview
   reviewed route for its reviewed-point road proof. Only then test planning approval. Preserve
   hard locks for expired/missing credentials, insufficient vehicle/attendant capacity, changed
   reviews, unsafe calendar/service windows and overlapping reservations. No ride is released.
6. One browser refresh after successful draft save should retain the persisted draft. Unsaved
   choices are intentionally memory-only; do not refresh between the steps. Existing record
   history and immutable daily-manifest generation/cancellation tests below still apply.

Local automated evidence covers exact binding, confirmation/revocation, missing-stop inline
save/retry, resource suggestions, draft save/selection, Back navigation and320/736/desktop layout.
Browser fixtures use intercepted APIs; separate isolated actual migration SQL checks enforce
authorization, versioning, reservations, approval and manifest contracts. Hosted acceptance pending.

## Advanced setup and regression reference

The longer sequence below describes the retained setup/editors and foundational regression
coverage. It is not an instruction to repeat already accepted setup in the current owner test.

1. Create a fresh disposable geographic customer request through the existing /school flow (do not
   reuse a withdrawn request). Include distinct TEST students requiring a lift, a restraint and a
   dedicated attendant. Keep its source request submitted during planning checks.
2. In /admin -> Customers and transportation requests (/clients), sign in as an explicitly admitted
   internal reviewer. Click Open route planning. Customer and owner-only accounts must not gain
   planning records; staff without reviewer permission have read-only inspection.
3. Select the source geographic request, then add its customer-bound qualification policy: use an approved TEST policy reference, required base Driver/attendant
   credential keys and equipment-specific keys matching the TEST credential records you will enter.
   Explicitly review the policy. Do not enter assumed legal requirements or real credentials in TEST.
   Save reviewed revision should start disabled, with one short message beside it. Complete
   required fields and confirmation: Save enables. Type a credential such as `"District Driver"`
   or a name wrapped in backticks: formatting is handled internally, Save stays enabled, and
   leaving the field preserves what was typed. The UI calls these qualifications, not credential
   keys. Test base/equipment and resource qualification fields consistently. Reopen a saved
   review: readable qualification names retain the exact original matching identifiers on save.
   No long lowercase/format warning list should appear. Reverse effective dates, clear a required
   field/reason, uncheck review, or enter an unusable credential such as ***: Save disables with
   short guidance. Correct the entry: Save enables again. Optional equipment lists
   may stay blank; this does not bypass later route qualification requirements. A server/network
   rejection must also appear beside Save and preserve entries for unchanged retry. A successful
   save closes the editor and shows the policy revision in Reviewed record register after refresh.
4. Add dedicated vehicle, Driver and attendant records. Record reviewed effective dates/evidence.
   Use the actual dropdown (mouse/keyboard), not only automation's selectOption: a new resource
   must allow Vehicle -> Driver -> Attendant. Vehicle capacity fields disappear for people.
   Open a saved Vehicle review: its role remains locked; click Add dedicated resource and verify
   the new form has an empty reference and allows a different role. No saved Vehicle is converted.
   Use one reviewed vehicle configuration and reserve attendant seating separately. Enter required
   human credential keys/dates/evidence references. Do not use resources shared with live products.
5. Select the source geographic request. Register canonical student identities with stable school
   references and authority/requirements review, including a deliberate review when no tags apply.
   Click Register student1 identity: its form appears directly beneath that button inside student1's
   card, before student2. Repeat for students2/3: exactly one form, under the selected student,
   with that student's name/requirements. Unsaved reference text must not carry between students.
   Cancel closes it; changing source request clears it. Check320/414/desktop without overflow.
   A child name alone must not automatically bind identity or parent access. An occupied wheelchair
   position must not be counted as a passenger seat. Source requirements cannot silently disappear.
6. Review each home and school loading point: exact coordinates, meaningful label, curb/driveway/
   designated-zone type, effective dates, loading instructions and site/district approval reference.
   Verify coordinates on the actual site; do not treat the geocoder as an approval. Revise one point
   after creating a draft and verify the old reference fails until explicitly updated.
   Change Source stop using the actual dropdown and confirm the selection remains selected.
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
