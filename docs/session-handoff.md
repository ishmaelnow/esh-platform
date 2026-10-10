# Session Handoff

Last updated: 2026-10-10

## Current objective and checkpoint

Current objective: owner approved optional participant photos after trip messaging acceptance.
Latest owner feedback: Driver photo remains too small after the 64px refinement pushed as 01e2a4e.
Local CSS now increases Driver photo in Rider home/current tracking to 88px; Driver app's Rider
avatar remains 36px. Browser size assertion and durable docs updated. No backend, schema, upload
or native change. All 26 Rider mobile checks pass, 414 x 896 full screenshot inspected, scoped test
lint and whitespace check pass. Next: owner push/Rider Ready confirmation and device recognition-size
retest. Preserve generated config edits and local docs. No migration or native rebuild required.
Prior 64px refinement passed all 26 Rider mobile checks, scoped lint and whitespace check.
Production acceptance found a confirmed legacy-path bug: owner SQL shows Ish Coach's latest
personal_photo is approved image/jpeg, no expiry, object exists, correct driver-application-files
bucket, but path_matches_tenant=false. No active ride is needed to inspect existing photo eligibility.
Local correction: new 20261010000300_legacy_driver_trip_photos.sql and signer remove Driver tenant
prefix assumption; still select through exact tenant/assigned profile/latest personal_photo and
retain bucket/traversal/active-participant/recheck protections. Rider namespace is unchanged.
No reupload, file move or approval change. Previous release reduced avatars from 44px to 36px;
latest Rider recognition refinement above supersedes that size only for Driver photos in Rider.
Shared 25 unit tests, shared type/lint and updated disposable SQL smoke pass (legacy selection,
other-tenant/other-Driver evidence exclusion plus prior privacy/lifecycle cases).
Owner supplied successful Applying migration / Finished supabase db push for only
20261010000300_legacy_driver_trip_photos.sql. Remote correction is applied. Owner pushed correction
as e69f2a4; supplied Git output confirms main matches origin/main with generated Driver next-env
and Driver/Rider tsconfig edits remaining. Next: verify Rider/Driver Ready at e69f2a4, then retest
Ish Coach's image and compact avatars. No native rebuild required. This checkpoint is a local docs edit.
Local implementation shows Driver profile photo in Rider home/current tracking and optional Rider
photo in Driver active dispatch, only accepted/arrived/in_progress. Initials are the fallback.
No photos in offers, preorders, history or notifications; no ID/compliance documents displayed.
Latest Driver personal_photo evidence must be approved, unexpired JPEG/PNG; pending/rejected/PDF
replacements never resurrect older images. Rider uses the existing optional private profile image.
Owned metadata RPC reuses active tenant/person/profile/assignment checks, audits without paths,
and broadens no table or storage grants. Server routes fix viewer role, verify session, validate
bucket/path, sign for 60 seconds and recheck assignment/photo before returning no-store responses.
UI keeps URLs in memory, renews only while visible, clears hidden/offline/expired/error images,
and aborts stale requests. Existing signed links remain usable until expiry; downloaded images
cannot be revoked. Account/Documents explain active-trip photo visibility.

25 shared unit tests pass; prior Rider 94/Driver 67 unit checks remain the last app-unit checkpoint.
All 26 Rider and 28 Driver mobile browser
checks pass including photos, missing/broken fallback and existing messaging/booking/document flows.
Both full mobile screenshots inspected at 414 x 896 (preview runs clear older test-results).
Disposable minimal PostgreSQL ownership, role, anonymous, other-Driver, tenant, lifecycle,
reassignment, latest-image eligibility and audit smoke passes. This is not full Supabase-chain,
concurrent-session or physical-device certification. Shared type build and scoped lint pass with
existing Rider img warning; both production builds pass for the compatibility correction.
No credential/env/native changes, remote DB mutation or Git mutation by Codex.

Owner supplied successful Applying migration / Finished supabase db push for only
20261010000200_trip_participant_photos.sql. Remote migration is applied. Owner pushed application
changes as 7ddcc76; supplied Git output confirms main matches origin/main with only Driver/Rider
tsconfig edits remaining. Acceptance found the legacy bug above; new correction is local and still
requires migration/application deployment, then two-account device acceptance. No native rebuild
required. This checkpoint update is a local documentation edit.
Preserve generated Driver/Rider tsconfig and next-env changes; exclude from feature staging.
See architecture/trip-participant-photos.md and operations/trip-participant-photos-manual-test.md.

Previous feature: owner applied 20261010000100_trip_messages.sql, pushed b16276b and reports private
trip messaging PASSED. Text-only current-assignment messaging, bounded duplicate-safe retry,
generic device alerts (no email/SMS/body previews), and deletion on trip end/reassignment remain
intact. Its previous local unit/browser/SQL/build checks passed. Do not repeat completed acceptance.
See architecture/trip-messages.md and operations/trip-messages-manual-test.md.

Owner deployed 65b7ae3 Ready and reports cancellation/rebooking passed with flying colors.
Preorder offer for booking 6c54f2a7... was offered at 2026-10-09 21:20:00.032 CDT and accepted
21:21:06.768 CDT, before its 21:21:30 expiry. Supplied SQL confirms server timing for that booking;
another cancelled booking had no offers. Owner requested leaving the earlier display-time question
alone and moving on. Do not implement a speculative timezone/activation fix.

Owner reports preorder Assigned works. Rider Cancel trip was hidden because the UI cancellable
status set omitted scheduled. Owner approved cancellation/rebooking, not in-place editing. Local fix
adds scheduled to that set; existing refund/wallet/unpaid cancellation and preorder cleanup remain
authoritative. Book again prefills a new form requiring fresh confirmation, without old reservation.
94 Rider tests, Rider production build and preorder SQL smoke pass. All 24 mobile browser tests
pass, including scheduled cancellation/refund failure/retry/history/rebooking. Diff check passes.
No migration/native rebuild. Owner pushed 65b7ae3, confirmed Rider Ready and accepted cancellation,
rebooking and reservation cleanup as recorded above.

Previous objective: owner approved and authorized implementing Driver Preorders after inspection.
Owner applied migration 20261009000100_driver_preorders.sql after an intended-only dry run;
supplied output confirms Applying migration / Finished supabase db push. Driver/Admin UI remains
owner-committed/pushed as a5223dd; supplied Git output confirms main matches origin/main with only
the four generated Driver/Rider next-env.d.ts and tsconfig.json edits remaining. Hosted Ready
confirmation and controlled manual acceptance are pending.
Reservations remain separate from active rides; dispatch-time priority uses existing timed offers
with online/compliance/area/free-Driver checks, then ordinary matching/manual fallback. Driver UI
has owned lists/counts, reservation/release and saved offline alerts; available cards hide addresses.
Generic preorder notifications use existing email/mobile choices. Native tap routing accepts only
the known preorder type; stale availability alerts are checked at send/claim time.
Minimal PostgreSQL smoke passes with actual automatic matcher and Rider active guard: reservation,
overlap, priority, decline fallback, offline fallback, release/cancellation, audit and owned reads.
Admin 107, Driver 67, Rider 94 and shared native-push 13 unit tests pass. Admin, Driver, Rider and
Transportation production builds pass (Transportation uses temporary nonsecret public fixtures).
Shared Supabase type build passes. All 23 Rider and 26 Driver mobile browser checks pass.
Complete 414 x 896 New/Assigned screenshots are in test-results/driver-preorders-new-414.png and
test-results/driver-preorders-assigned-414.png. SQL smoke passes after the final audit patch.
Remote migration succeeded per owner output. Full Supabase-chain, true concurrent-session and
physical preorder delivery/dispatch acceptance remain unverified. No new native build/env required.
See architecture/driver-preorders.md and operations/driver-preorders-manual-test.md.
Preserve generated configs. Next: owner confirms hosted deployments at a5223dd are Ready,
then performs controlled manual checks. This checkpoint update is a local documentation change.

Inspection findings:
Repository confirms DriverShell has unavailable content, unknown counts and a disabled offline
setting; no advance reservation RPC/types exist. Scheduled Rider bookings already persist pickup
time and dispatch_ready_at, then activate into ordinary online-only dispatch. Latest activation
preserves the Rider active-booking guard. Do not repurpose 90-second immediate offers as advance
reservations or expose tenant-wide Rider addresses to all Drivers. No runtime/schema changes from
that inspection. Owner subsequently approved the flow and said Go; current local work is above.
Owner confirms Admin, Rider and Driver Ready at 01a6546 and email-off/mobile-on workflow all passed.
Transportation deployment was not separately identified; do not infer its status. No new tests or
production actions were needed for this read-only implementation review.

Owner authorized independent email/mobile preferences with Go. Local implementation adds explicit
Rider trip/payment and Driver offer/earnings/expiration email fields, preserving existing choices.
Device consent remains per installation. Derived legacy gates keep existing producers eligible for
mobile-only events; opt-out masks email without canceling shared events/native attempts. Driver
Notifications adds an owned/audited new-trip-offer email control. Admin shows Email disabled honestly.
Owner applied 20261008000200_notification_channel_preferences.sql remotely after an intended-only
dry run; supplied output confirms Applying migration / Finished supabase db push on 2026-10-09.
Owner committed/pushed application changes as 01a6546; supplied Git output confirms main matches
origin/main with only four generated Rider/Driver next-env.d.ts and tsconfig.json edits remaining.
Admin/Rider/Driver deployment and controlled email-off/mobile-on acceptance are owner-confirmed.
Transportation deployment confirmation remains separate.
No Git mutation, production notification, remote DB change or deployment by Codex.
104 Admin, 94 Rider and 64 Driver tests, minimal PostgreSQL smoke, Admin lint, and Admin/Rider/Driver
production builds pass. All 23 Rider and 25 Driver mobile browser checks pass, including Driver
email save/reload and failed-save confirmed-state preservation at 414 x 896. The complete notification
screen screenshot is test-results/driver-notification-channels-414.png (local fixture).
Final Driver feedback is scoped to its email control; screenshot inspected without duplicate text.
Transportation production build also passes with temporary nonsecret public fixture configuration;
its first local build lacked Supabase public variables. No populated environment file was modified.
Do not overlap Driver builds and preview tests: the production build disturbed the preview's nested
generated directory. The isolated final rerun passed all 25 checks after the build finished.
Smoke exercises the actual existing booking producer, email masking,
native claim independence, preserved opt-outs, web eligibility, audit and denied access. Full
Supabase migration-chain/concurrency and physical native channel acceptance are not certified.
See architecture/notification-channel-preferences.md and
operations/notification-channel-preferences-manual-test.md. Channel feature owner acceptance passed;
next work is the Driver Preorders inspection/alignment described above.
Transportation shares the Admin history component and needs its hosted UI update as well.
Existing push-capable shells suffice; no new APK/IPA, environment variable or credential is required.
Preserve all generated next-env/tsconfig edits; Google Play remains owner-deferred.

Current checkpoint: Rider cleanup is owner-pushed as 25aadc9; main matches origin/main.
Owner reports its manual test passed. Booking replaces Working
on the primary action; Android payment return attempt/manual link target com.esh.rider explicitly
with an intent URI, while iOS and browser checkout remain unchanged. 94 Rider unit/API tests,
production build (lint/types included), all 23 mobile browser checks and diff whitespace check pass.
Tests cover Android package/non-Android scheme attempts exactly once, manual recovery targets,
no automatic attempt without app-origin opt-in, existing callback/session/booking regressions.
No migration/APK/auth-policy change. Checks use local fixtures, not real Stripe/device launches.
Owner reports USB feature checklist passed. Google Play/internal store testing is deferred at
owner request. Automatic fresh-install link verification without manual settings remains a
separate release gate unless that exact scenario is confirmed. Do not promise every browser permits
automatic app launch: Chrome can require a gesture; manual app/browser recovery stays available.
Owner also reports the proposed Rider/Driver network recovery checklist passed: offline/online,
stale location handling, same-ride recovery, session continuity and no duplicate booking. Exact
device/build and per-step observations were not separately supplied; record this as owner manual
acceptance, not fault-injected automation or full concurrent-session certification.
Roadmap review identified email-preference-gated events and missing Driver Preorders backend.
Independent channels are now authorized local work as above; Preorders remains future work.
No additional recovery implementation is needed from the passing test. Google Play remains deferred.
Next action is the independent-channel release checkpoint above. Preserve generated configuration
edits. No Git mutation/deployment or production ride/payment by Codex.

Driver link/session checkpoint: owner pushed signer alignment as d6f5652 after replay correction
06cea20. Driver domain selection in Android Open supported links restored opening inside Driver;
owner replied Boom and subsequently reports the manual USB feature checklist passed. Do not reopen
this as a confirmed vault failure. Exact clean-install automatic verification remains unconfirmed.
The earlier report was Driver recurrence after pushing 06cea20, with email links
opening the web instead of Android Driver. Compared Rider/Driver: vault adapters, native auth redirect
and manifest App Link intent match apart from product identity. Concrete mismatch found in public
assetlinks: Rider trusts the actual Codemagic signer 8E:0A:3D:FB:...; live Driver trusts only 71:F7:... .
Read-only apksigner verification of Downloads/track-driver.apk (com.esh.driver, 1.0.5/code6) and
rider-track.apk confirms BOTH use 8E:0A:3D:FB:... . Driver JSON now includes this verified public
certificate fingerprint while retaining its existing certificate and separate package/domain.
64 Driver unit/API tests pass, including association regression. No auth/session policy, Rider
runtime, secret, signing key, manifest, native build or database change. This explains link
verification failure for the inspected APK; actual installed-device link state was not read.
ADB read-only device discovery failed in sandbox; no device setting was changed.
Owner selected the domain as above. Browser and native vault remain separate; no new APK or
migration required. Replay protection alone did not resolve the owner symptom; do not claim it did.

Owner reports Android Driver asks for email verification again when returning to the app.
Owner authorized direct investigation without further repeated clarification. Local correction
prevents successfully consumed Android launch auth links from being replayed on home/callback
mounts; prior deduplication was memory-only. Bounded SHA-256 fingerprints preserve fresh links,
account switches and failed-callback retry without storing URLs/tokens. Existing vault and foreground
recovery remain unchanged. This is a plausible failure path, not a device-confirmed root cause.
63 Driver unit/API tests, production build, all 24 mobile browser checks and diff whitespace checks
pass, including recovery/replay and explicit sign-out. Hosted push/deployment and Android device acceptance pending; no migration
or new native rebuild needed. Next: finish verification, owner deploys Driver correction, fresh
sign-in once then reopen/foreground/normal refresh and explicit sign-out acceptance.
Do not reset app data, remove credentials or change auth policy to mask the symptom.
Rider cleanup is now resumed as described at the top. Preserve all existing configuration files.
Owner confirms sharing/tracking physical test passed after hosted 511d75a deployments Ready and
Android rebuilds. Rider iOS 1.0.3 (1791478052) and Driver iOS 1.0.5 (1791482356) are available in
TestFlight; internal groups and Rider notes saved. Exact sharing test device scope was not supplied.

Owner agreed to optional Share my location with my driver. Delivered alongside the
Rider tracking polish: private booking/assignment-bound snapshot, audited explicit
consent, foreground actual GPS publisher, assigned-Driver-only fresh reads and separate passenger
map pin/navigation. Automatic deletion on start/cancel/completion/reassignment. New migration
20261008000100_rider_pickup_location_sharing.sql was applied remotely by the owner on 2026-10-08,
after an intended-only dry run. Owner committed/pushed the feature as 511d75a; main matches origin/main.
Only the four generated Rider/Driver next-env.d.ts and tsconfig.json edits remained after the push.
Vercel Ready and native build results have not yet been supplied. Owner requests native
rebuilds; none have been started by Codex.
Minimal PostgreSQL privacy smoke passes (including another Driver and tenant); 93 Rider and 61
Driver unit/API tests, shared types/Maps lint, both production builds, 22 Rider and 24 Driver mobile
browser checks pass. Driver real map fixtures needed unsandboxed public tile access; the known
sign-out test navigation race now waits for vault cleanup. Rider GPS publications use explicit
timestamped fixture readings, not physical device GPS certification. Rider tests also confirm
server-revoked consent restores the opt-in control. 414 × 896 sharing screenshots
are generated/inspected; no production location/payment/booking was published by Codex.
Existing generated files and prior acceptance notes preserved. Full Supabase/concurrency and
physical iOS/Android acceptance remain pending.
See architecture/rider-pickup-location-sharing.md and operations/rider-pickup-location-sharing-manual-test.md.
Next: owner confirms hosted Rider/Driver deployments for 511d75a are Ready,
then starts the requested Rider/Driver Android and iOS main-branch Codemagic workflows and performs
device acceptance. Existing shells load their separate hosted URLs; no native configuration change
is required for this feature. No feature Git mutation or remote migration by Codex.

Owner authorized Rider live trip tracking polish. Existing tracking uses owned RPCs every ten seconds
and shared real traffic-aware maps. Local changes add compact current-trip Home/Trips status and ETA,
status/age-aware location exposure, destination ETA after trip start, obsolete request cancellation,
and account/provider-safe portal result handling. Preserve approved booking design, payment return,
native consent/session behavior, and generated tsconfig/next-env work. No migration or native rebuild.
93 Rider unit/API tests, 16 Maps unit tests, Maps types/lint, and Rider production build pass.
All 22 mobile browser tests pass, including tracking states and 320-pixel overflow; 414 × 896
Home/Trips screenshots inspected in test-results/rider-tracking-home-414.png and
test-results/rider-tracking-trip-414.png. Provider/GPS fixtures are isolated; actual movement,
permission revocation, network recovery and cross-device privacy acceptance remain owner tests.
See architecture/rider-live-trip-tracking.md and operations/rider-live-trip-tracking-manual-test.md.
Next: owner stages scoped feature/docs, pushes/deploys and performs real-device acceptance.
No feature commit/push, production booking/payment or location publication was performed by Codex.

Owner requests automatic app return after app-originated checkout, with browser checkout remaining
in the browser. Local change adds returnTo=app only to new native checkout success/cancel URLs,
then attempts the validated fixed Rider scheme once on the return page. Existing manual app/browser
links remain fallback. No migration or native rebuild; existing Stripe sessions retain old URLs.
86 unit/API tests, production build, 20 existing mobile browser tests and a focused automatic
scheme-attempt/fallback browser test pass. Owner pushed as 51b1a53; main matches origin/main.
On 2026-10-08 owner confirms automatic return to the app passed on the tested device.
Automatic handoff acceptance is complete for that device; other device/browser paths were not
separately reconfirmed. No Git mutations or remote deployment by Codex.

Owner clarified the limit applies only to a current ride, including requested/offered/accepted/
arrived/in_progress; future scheduled and recurring reservations remain available. Local migration
20261007000100_rider_active_booking_guard.sql adds an atomic person-wide booking slot, private RLS,
an owned boolean check, and blocked scheduled activation isolation. Rider UI and checkout preflight
preserve future scheduling. Owner's WSL dry-run listed only this migration, then db push successfully
applied it on 2026-10-07. Owner pushed application code as 0ec12c2; Git main matches origin/main.
Owner reports clicking checkout X returned to the installed app, and another ride was blocked
while a valid ride was pending. These two manual checks passed. This does not establish a successful
payment return or the dedicated cancelled-return link path; Vercel Ready was not separately supplied.
Subsequently, owner completed payment, saw browser/ESH return choices, selected Return to ESH app,
and confirmed it returned successfully. Successful-payment app handoff is now owner-confirmed.
Owner also confirmed the paid trip appears only once after the requested reopen check.
Successful-payment app handoff and single-booking reopen recovery passed on the owner's device.
Dedicated cancelled-return link acceptance remains separate from the already-passed checkout X dismissal.
86 Rider unit/API tests, shared
Supabase types and Rider production build pass. Minimal PGlite smoke checks pass; full Supabase
and concurrent-session certification remain pending. All 20 mobile browser tests pass at 414 × 896,
including current-ride blocking with future timing available. Legacy duplicates are preserved; old/open
checkouts can still produce paid unbooked quotes, so recover the same quote without charging again.
See architecture/rider-active-booking-guard.md and operations/rider-active-booking-manual-test.md.
Next: future scheduling while a current ride is active, then complete/cancel that ride and verify
a new immediate request is available. Concurrent-session acceptance remains pending.
No financial production action, payment, refund or new booking was created by Codex. Preserve all
existing notification checkpoint documentation and generated tsconfig edits.

Owner approved Android Driver pickup/destination navigation through installed maps, matching iOS.
The hosted change bypasses EmbeddedNavigation and its missing APK Mapbox token. Android uses the
existing geo resolver; iOS retains Apple Maps; browsers retain HTTPS directions. Real trip coordinates,
ESH's live map, sessions and trip lifecycle are preserved. Native SDK removal is outside this change.

Owner pushed navigation as fa0ecf0. Driver Vercel deployment failed because the regression tests
awaited the newly synchronous navigation function (await-thenable errors at lines 12 and 18).
Owner pushed the test correction as 7e2ad74 and confirms Android navigation now works.
The correction removes async/await from those tests; production behavior is unchanged.
Preserve generated next-env and Driver/Rider tsconfig
edits. No migration or native build is needed. All 61 Driver unit/API tests pass after correction;
fresh production build/type/lint verification passed with existing warnings. Previous mobile suite:
23 passed directly, one existing Android sign-out test
passed on retry after its page.evaluate raced navigation; no failing tests remain. Physical map
launch is owner-confirmed. Current work is the Admin-only once-per-minute native retry schedule.
Owner pushed/deployed the schedule as 3e8ff47 and confirmed Ready. Admin Cron Jobs lists both the
daily email job and native job every minute. Owner provided scheduled GET 200 logs at Oct 07
05:54 through 05:58 against the new Pro-team deployment host. This confirms authenticated endpoint
execution; logs alone do not prove a transient provider failure was retried. No new migration,
app rebuild or production request by Codex.
Owner now confirms all final notification checks passed, including tapping alerts to open the
correct app/trip screen and stopping future account alerts after sign-out. Notification release
checkpoint is closed with device delivery and scheduled execution verified. No controlled provider
outage was performed, so observed HTTP 200 does not prove fault-injected recovery. Test-booking
cleanup/Driver Offline was requested; no individual cleanup state was inspected by Codex.
Next authorized pending acceptance is Rider iPhone payment return. Do not create a new payment,
refund or production booking merely to recover context; owner controls any real-money test.
JSON configuration checks and all 11 focused native worker/provider tests pass; diff whitespace
check passes. No application runtime code changed, so no new full build/browser run was needed.
Read docs/architecture/driver-map-home.md and docs/operations/driver-map-home-manual-test.md.

## Native release and notification checkpoint

Owner pushed payment-return/native push as b501da0 and confirmed Vercel Ready. Native migration
20261006000100_native_push_notifications.sql is owner-applied; do not reapply. Both Android builds
are owner-installed: Rider #5 version 1.0.3/code 4, Driver #8 version 1.0.5/code 6.
Apple profiles were regenerated with push and uploaded into Codemagic. Rider iOS 1.0.3 (1791314879)
and Driver iOS 1.0.5 (1791318004) reached Apple; compliance was cleared and internal groups assigned.
Updated iOS installation is not confirmed. Rider HTTP 500 upload and Driver post-processing errors
did not prevent those TestFlight builds being available; do not rebuild merely for red CI status.

Owner enabled NEXT_PUBLIC_NATIVE_PUSH_ENABLED=true in Rider/Driver Production and redeployed.
Initial unavailable state was resolved after fresh deployment. Owner confirms alerts On in both apps;
Owner subsequently confirmed actual native notification receipt on iPhone and Android, with iPhone
more prominent; Android delivery is accepted and no presentation change is requested. Exact tested
product/event scope was not explicitly confirmed. Android email app-links were restored through Open
supported links. Preserve accepted sessions, camera, domains and the deferred Driver icon.
Owner reports two Codemagic client variables in esh_native_push and four Admin-only sender variables:
FIREBASE_SERVICE_ACCOUNT_JSON, APNS_PRIVATE_KEY, APNS_KEY_ID, APNS_TEAM_ID. Remote secrets were not
inspected; private files stay outside Git/chat.

Previous push verification: 192 unit/API tests, 19 Rider and 24 Driver browser tests, type/lint/build
and embedded minimal PostgreSQL smoke check pass. Full Supabase/RLS/concurrency acceptance was not
performed; Docker unavailable. Owner confirms device receipt as above. No production event
or alert was created by Codex. Payment-return iPhone physical acceptance is still pending.
Read docs/architecture/rider-payment-return.md and docs/operations/rider-payment-return-manual-test.md.

Independent native retry scheduling is deployed and scheduled HTTP 200 execution owner-verified.
Owner verified original ESHA team is Hobby, then
transferred only transport-platform-admin to an existing Pro team instead of purchasing another
subscription. Destination was the blue-avatar team, renamed ESH Platform Admin (not ESH Platform),
Team ID team_vhxr74AxOIzBUmhwy0MOS660. Owner confirms transfer complete; review listed five aliases,
23 environment variables and all deployments. Other live ESH projects stay in ESHA. The green team
with fairfareride.com is preserved; no duplicate projects/teams were deleted and no slug change
was authorized. Owner confirms Transportation interface opens cleanly, transferred Admin Ready
at 7e2ad74 with admin.eshapp.com/apply.eshapp.com, main source, and destination Pro. Remote secret
presence and integrations were not inspected by Codex. apps/admin/vercel.json now deploys
/api/cron/native-notifications every minute; existing daily email cron remains intact. Repeated
scheduled HTTP 200 is owner-verified, demonstrating the protected route accepts cron requests. Do not
print it or run manual production delivery just to verify configuration. Integrations may need
reconnection if later checks reveal a missing binding.
Before the pending independent-channel migration, email trip preferences gate native events.
After migration and hosted release, use the independent-channel manual test linked above.
Read docs/architecture/native-push-notifications.md, docs/operations/native-push-setup.md and
docs/operations/native-push-notifications-manual-test.md.

## Previous Home/Work release checkpoint

Owner approved adding persistent Rider Home and Work addresses after confirming both installed
apps now meet expectations and E2E passed. Owner committed and pushed the feature as e13935c;
main/origin main agree. The Supabase migration is owner-applied. Vercel Ready confirmation and
real-account saved-address acceptance remain pending. Preserve preexisting
apps/driver/tsconfig.json and apps/rider/tsconfig.json. Rider next-env.d.ts can be generated by preview;
exclude generated configuration from feature staging.

The feature adds optional tenant/Rider-owned Home/Work records, existing horizontal shortcuts,
progressive Account Add/Edit/Remove, and real address search. Saving uses authenticated
POST /api/places and the existing permanent geocoding helper before an own-profile audited RPC.
Only permanent server geography is persisted in the normal UI flow; client hints cannot authorize
coverage/pricing. Existing fare quoting validates current geography and service coverage.
No Driver, authentication, session policy, native permission, payment or dispatch change.

Migration 20261005000200_rider_saved_places.sql is owner-applied. The owner supplied a WSL dry run
listing only this migration, followed by successful Applying migration / Finished supabase db push
output. Do not reapply it. Code is pushed as e13935c; hosted deployment confirmation remains pending.
No Codemagic rebuild is required for this hosted feature.

Checks so far: 57 Rider unit/API tests, typecheck, scoped lint, shared Supabase type build and
production Rider build pass. Existing Supabase bundler, Next plugin and vehicle-image warnings
remain. All 17 mobile browser tests pass, including late responses after provider switching and
navy Account styling. Full Account and address-editor screenshots at 414 × 896 were inspected;
320 px overflow and existing booking/vehicle/payment/options/foreground regressions pass.
The rollback-only database fixture is prepared but NOT executed: local Docker daemon unavailable.
Mocked API/browser tests are not proof of real database/RLS or physical-device acceptance.

Read docs/architecture/rider-saved-places.md and
docs/operations/rider-saved-places-manual-test.md. Next action: confirm Rider Vercel Ready at e13935c,
disposable SQL isolation check
and real-account/device saved-address acceptance. Preserve existing map and booking design.
The Driver icon showing E instead of ESH is explicitly deferred; owner requested no change.

## Accepted Rider/Driver native and profile checkpoint

Owner confirms Android Driver sessions work after installing the updated app rather than opening
an old duplicate. Rider Android email return/session recovery works after selecting rider.eshapp.com
under Open supported links → Add links. Owner says everything meets expectations and E2E passed.
Do not reopen the resolved session issue or change working native authentication without new evidence.

Driver Android 1.0.4/code 5 is owner-pushed as 577d645; Rider native fix is 3bf1fbb.
Rider Android workflow index 4 built 577d645 on Oct 5 15:37 CDT, APK 26.68 MB/AAB 26.22 MB,
version 1.0.2/code 3. Rider iOS remains a separate build. Existing iOS permission descriptions and
image-decoding fallback address the camera report; both Android apps use separately scoped
encrypted session/PKCE vaults and foreground recovery. iOS/browser auth behavior remains preserved.

Rider Account profile editing/private photo is owner-deployed as 8e05193 after doc-only 63017b3.
Owner applied 20261005000100_rider_profile_account.sql after a clean dry run. Name, optional phone
and notes use the existing owned profile; email is read-only. Private JPEG/PNG photos upload on
selection with own-account short-lived preview/removal. SMS consent remains separate.
Session-duration policy remains deferred. Prior profile SQL fixture has not run locally either.

Prior Driver verification: 58 unit/API tests, all 24 mobile browser tests, typecheck/scoped lint,
Android Java/manifest checks and production build passed. Prior Rider native verification:
37 unit/API tests, all 15 mobile browser tests, typecheck/scoped lint, Android Java/manifest/XML
checks and production build passed. Mock bridge coverage does not certify every reboot/keyboard
scenario; owner has nevertheless confirmed the previously reported behavior is now acceptable.
See docs/architecture/driver-native-session-recovery.md,
docs/operations/driver-android-session-manual-test.md,
docs/architecture/rider-native-session-recovery.md,
docs/architecture/rider-profile-account.md and
docs/operations/rider-profile-account-manual-test.md.

## Completed Driver release checkpoint

Owner confirms Android installation and native Take photo/upload now work. Old installed Driver
was debug-signed 1.0/code 1, incompatible with release APK signatures. Owner removed that old build
and successfully installed the newer release; signing keys were retained. Codemagic Android build
6ac27dcf7394575b200b0590, index 6, main c4c34ef, Oct 4 11:24 CDT, produced APK/AAB.
Android 1.0.3/code 4 explicit native CameraSource.Camera captures bounded JPEG and preserves file
selection on cancellation. Driver iOS 1.0.2 (1791080231) was restored, assigned to internal TestFlight
and owner-confirmed to capture/upload and replace rejected documents.

Driver own-document private previews, latest review refresh and Admin combined application/profile
evidence are delivered. Earlier Pending/Rejected confusion was a different signed-in Driver;
owner verified the correct account and replacement flow. Do not investigate it as an unresolved DB
bug. Document order is Profile photo, separate Driver ID photo (any ID, manual review), Vehicle photo,
Vehicle registration document and Vehicle insurance document. Approved legacy Drivers are not
retroactively gated. Insurance uses original evidence review without assignment/linking steps.
Owner applied prior migrations 20261002000100, 20261003000100 and 20261003000200.
Placeholder test evidence must not be treated as valid compliance; keep test Drivers Offline.
Admin control backend admin.eshapp.com and Transportation operational UI transportation.eshapp.com
remain distinct; no domain retirement is authorized. Products remain separate within the monorepo.

## Repository and deployment state

The owner performs all Git mutation, deployment, and database mutation commands. Before any future
migration, the owner runs `pnpm exec supabase db push --dry-run`, confirms only intended migrations,
then performs the real push. Preserve all existing uncommitted work and use one explicit file per
staging command when the owner later requests staging instructions.

Do not submit another Community join request, manually accept an invitation, or create a production
invitation to recover context. Verify actual invitation state and product enrollment before any
future recovery; unrelated Rider/Driver or governance identity must not grant Community admission.

## Operational account note

The Resend account is registered under `ishmaelkosh@gamil.com` (email address recorded as provided).
Keep Resend API keys and all other credentials out of this handoff and out of Git.

## Deliberately deferred work

### Native Rider authentication and payment return

Mobile payment testing is paused. The Rider payment backend is functioning, verified Stripe
webhooks finalize ordinary paid bookings, and wallet-covered ordinary trips finalize directly. Do
not create another payment merely to resume investigation.

The payment-return follow-up is now the authorized local work described above;
Android sign-in recovery is owner-accepted:

- iOS previously left the Stripe browser sheet visible; device acceptance of the new handoff is pending.
- Future payment-return work should reliably dismiss the external browser sheet while preserving
  the now-working native authentication callback and session recovery.

Preserve the successful payment/booking recovery record. Do not refund or recreate it during
callback work. A future controlled test should build Rider once for both iOS and Android after the
callback contract is implemented.

### SMS provider approval

ESH Rider SMS consent is deployed and manually validated. Consent remains separate from phone
storage, number verification, and delivery. No production SMS was sent during consent validation.

Sent compliance remains external work: finish or resubmit the public Fair Fare opt-in evidence,
then obtain the Sent API key, sender/profile, template and OTP behavior, webhook signing secret, and
10DLC approval before implementing delivery. Keep the adapter provider-neutral and Twilio
switchable; never send duplicate traffic through both providers.

Twilio verification remains paused until suspended-account billing ticket `#29018616` is resolved.
Do not retry production SMS verification before reactivation. Sent, Twilio, Meta, and other provider
credentials must not enter documentation or Git.

### Stripe sandbox dispute diagnostic

The out-of-order Stripe dispute diagnostic is deployed, but no post-deployment automatic retry was
observed. This sandbox issue is deferred and does not block ordinary payments or bookings. If work
resumes, inspect a verified automatic retry using sanitized logs only; never log signatures,
payloads, payment credentials, or secrets.

### Native notifications

Rider and Driver native release `1.0.1` was operationally validated. Web Push is deployed; native
APNs/FCM is now deployed and registration owner-confirmed; actual delivery and retry scheduling
remain unverified as described in the current checkpoint.
See docs/operations/native-push-setup.md. Keep Android and Apple signing credentials outside Git and
independently backed up.

### Admin control-plane cleanup

Do not remove or rename `admin.eshapp.com`. Transportation still uses it as the trusted backend
selected by `TRANSPORTATION_BACKEND_URL`. Follow
`docs/operations/admin-control-plane-safe-cleanup.md`: finish the rollback observation window,
retire only legacy product UI routes, prove a stable replacement backend, repoint every consumer,
and only then consider a domain change.

## Durable architecture boundaries

- Shared identity and infrastructure do not imply shared product admission.
- Product access requires an active tenant relationship, enabled and entitled product workspace,
  explicit enrollment, explicit product role, enabled capability, and the expected
  server-authoritative operational session.
- Rider and Driver business identities do not grant Community access.
- Branding, domains, and public configuration are not authorization.
- Community normal publishing, official publication, moderation, emergency publication, and mass
  broadcast authority remain separate permissions.
- Direct client writes stay denied where controlled RPCs enforce reason, audit, lifecycle, or
  authorization contracts.
- Preserve tenant isolation, RLS, audit evidence, notification idempotency, and exclusive product
  sessions in every follow-up.

## Production-test hygiene

- Use clearly identifiable test data.
- Do not manually accept invitations or rewrite successful payment lifecycle records.
- Cancel unfinished test bookings.
- Return test Drivers to Offline.
- Restore temporary tenant settings and notification preferences.
- Confirm no test booking remains `requested`, `offered`, `accepted`, `arrived`, or `in_progress`.
- Never approve a fare adjustment produced by unrealistic simulated GPS movement.

## Required reading for recovery

Read these before changing the current Community flow:

- `AGENTS.md`
- `docs/roadmap.md`
- `docs/architecture/community-platform.md`
- `docs/architecture/community-platform-migration-plan.md`
- `docs/adr/0002-separate-product-applications-shared-platform.md`
- `docs/operations/admin-control-plane-safe-cleanup.md`

For work in another domain, read the matching architecture document and production manual test under
`docs/architecture/` and `docs/operations/` before implementation. Git history and migration files
remain the source of implementation evidence when older prose is stale.
