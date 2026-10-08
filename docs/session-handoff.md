# Session Handoff

Last updated: 2026-10-08

## Current objective and checkpoint

Owner agreed to optional Share my location with my driver. Implemented locally alongside the
uncommitted Rider tracking polish: private booking/assignment-bound snapshot, audited explicit
consent, foreground actual GPS publisher, assigned-Driver-only fresh reads and separate passenger
map pin/navigation. Automatic deletion on start/cancel/completion/reassignment. New migration
20261008000100_rider_pickup_location_sharing.sql was applied remotely by the owner on 2026-10-08,
after an intended-only dry run. Feature code remains uncommitted/unpushed. Owner requests native
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
Next: owner commits/pushes the scoped feature, confirms hosted Rider/Driver deployments Ready,
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
Email trip preferences currently gate outbox events for native push,
so keep them enabled for controlled delivery tests. Native-only preferences are separate future work.
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
