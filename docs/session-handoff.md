# Session Handoff

Last updated: 2026-10-04

## Current objective and checkpoint

Current follow-up: owner confirmed Driver 1.0.2 (1791080231) is assigned to the internal TestFlight
group, saved testing instructions and accepted the invitation after the app initially was absent.
Owner initially compared OCTODRIVER TEST's rejected ID with a different existing approved Driver
signed into iOS. Owner confirmed the account mismatch, rejected the correct Driver's ID, and verified
replacement controls, live camera capture, successful upload and return to Pending on iOS.
Do not retain the earlier Pending/Rejected mismatch as an unresolved backend defect.
Current issue: owner confirms installed Android 1.0.2 Take photo opens existing files. Native
WebView capture can silently substitute the picker; precise device-specific failure is not known.
Local correction installs pinned official @capacitor/camera 8.0.0 in Driver only and synchronizes
Android. Take photo uses CameraSource.Camera, orientation-corrected bounded JPEG/DataUrl, no edits,
no gallery saving. Returned File uses existing in-memory reduction and upload/review contracts.
Cancellation leaves selection intact; camera denial/unavailability shows errors, never substitutes
files. Older shells missing the plugin request an update. iOS/browser retain verified HTML capture.
Android release is 1.0.3/code 4; iOS remains 1.0.2 and Rider untouched. No migration, new storage/
camera permission, auth change or production mutation. If Android kills the app during camera
capture, refresh and retake; no restored result is automatically uploaded to a potentially changed
identity. Local checks: six camera contract tests, all 23 mobile browser checks, typecheck and lint
pass. Camera Java compilation and merged manifest pass after fetching missing AndroidX artifacts;
offline attempt was cache-blocked. Driver production build passed with baseline Supabase/Next
warnings; whitespace check passed. Physical camera acceptance and
full signed APK build remain owner actions. Preserve existing generated TypeScript config edits.
Repository summary reads latest reviewed evidence but
the client previously refreshed it only during full account loading/upload. Added Documents-entry,
foreground/focus, visible 15-second polling and manual refresh with error feedback. Reads reuse
the own-only summary RPC; no activation, availability or review mutation. Driver identity/profile
changes and leaving Documents discard late reads and stop polling. All 23 mobile browser checks,
Driver typecheck, scoped lint and production build passed with existing Supabase/Next warnings.
Owner committed/pushed refresh as fdcde75; local main/origin main agree. Owner saw the new manual
refresh button in the installed app. iOS rejected-ID replacement/upload acceptance is confirmed.
The earlier status-refresh change needed no migration/native rebuild; the new Camera plugin requires
an Android-only rebuild/install. Preserve generated config edits and the
prior local handoff. Owner performs staging, commit, push and deployment. Rider is untouched.

Owner authorized Driver private own-document viewing and live photo capture while preserving
library/file uploads, original Admin review, tenant isolation and the approved Rider product.
Local work adds View document to uploaded application status and current Driver Documents,
including pending, approved and rejected files. Missing files have no view action. Images/PDFs
open inside a dialog with Close, Escape, back dismissal and focus return.

New Driver POST /api/documents verifies Auth getUser and confirmed email, then uses existing
own-only my_driver_applications or my_driver_portal_summary to establish ownership. It derives
tenant and latest evidence from the owned record before privileged signing. Client-supplied tenant,
driver, bucket or path never grants access. Private URLs expire in five minutes and no-store
responses contain no raw paths; do not log or persist signed links. No RLS grant, migration,
document copy or review mutation. Driver's existing server-only service-role configuration is reused.

Application and Driver replacement uploads offer separate Take photo and ordinary file selection.
Camera photos are resized to JPEG in memory. The iPhone installed app was verified by owner to
receive the deployed design and upload from library/files, but live camera was unavailable.
Driver iOS Info.plist now includes camera/photo-library purpose descriptions. Native declarations
require a new Driver iOS build/install; hosted deployment cannot fix the old binary's permission
declarations. Android physical-camera result remains unknown. Android bridge inspection found it
requires image/* on the capture input; corrected that while ordinary selectors keep restrictions.
Added a narrow IMAGE_CAPTURE queries declaration for bridge resolveActivity camera discovery.
Both native shell declarations require rebuilds. No new Camera plugin, Android camera/storage
permission or broad package query. Browser capture fixtures do not prove a real camera launched.
Owner committed/pushed the feature and release files as fd0f2dd. Supplied push output confirms
49a6f87..fd0f2dd main -> main; read-only Git inspection agrees. Vercel Ready and signed native
builds remain pending. Codex performs no Git/database/deployment mutation.

Validation: 27 scoped unit/API/security/upload tests, Driver typecheck, scoped lint and production
build pass with existing Supabase/Next warnings. Final browser run passed all 22 checks, including
capture-file transfer, application persistence, previews of pending/approved/rejected documents,
image/PDF rendering, denied viewing, back/focus and live map regressions. Earlier live map readiness
timeout passed on the final run. Initial preview focus timing was corrected. Mobile Documents
screenshot was inspected and replacement controls refined to preserve white/navy appearance.
Driver Info.plist and Android manifest parse as XML. Offline Android processDebugMainManifest
passed and merged the IMAGE_CAPTURE query. Native iOS build/permission acceptance is not run here. Mocks do
not prove live storage/RPC authorization, native PDF rendering or actual camera launch.

## Production and preserved state

Git main/origin main is owner-pushed fdcde75, following fd0f2dd. It includes 49a6f87, which makes Admin Applications include original
application evidence plus explicitly linked Driver-profile uploads in the same tenant. Original
history remains visible, newest within each type is current, and the same existing review controls
operate on the same rows. Owner had verified the later ID in Admin Drivers; combined-view live
acceptance after 49a6f87 deployment is still pending. No migration for that display correction.

Owner pushed Driver ID addition at 69ff8ab and applied 20261003000200_driver_id_photo.sql after a
dry-run listing only that migration. Earlier applicant and insurance review migrations are applied.
New submissions require Profile photo, Driver ID photo (any ID for manual review), Vehicle photo,
Vehicle registration document and Vehicle insurance document, in that order. Legacy personal_photo
and reference_document keys remain. Existing approved Drivers are not retroactively gated.
Original review, private files, authorization, audit and activation requirements are preserved.

Older OCTODRIVER TEST was approved with placeholder PDFs; owner later rejected Profile photo,
registration and insurance as placeholder documents. Codex did not change production reviews.
Do not treat test files as valid identity/compliance evidence. Keep test Drivers Offline.

Preserve the four pre-existing generated Driver/Rider next-env.d.ts and tsconfig.json edits and
exclude them from feature staging. Rider product source, auth URLs, domains, hosted configuration
and populated env files are untouched. Session handoff is also a local edit.
Owner performs every Git mutation, native build deployment and database mutation.

## Exact next action

Local validation is complete; owner stages the scoped Android-camera files,
commits/pushes and waits for Driver hosted Ready. Run only ESH Driver Android on that pushed commit,
install 1.0.3/code 4 over the existing signed app and verify live camera capture/cancel/error/library
fallback/upload-to-Pending. Do not rebuild iOS/Rider or alter reviews for a different Driver identity.
Confirm the installed Driver's name/number matches Admin before any rejection/replacement test.

App Store Connect recovery: owner had removed the app records and found ESH Driver, ESH Rider,
ESH Community and FairfareTransportation Rider under Removed Apps. Guided restoration of the
original ESH Driver record with Limited Access; owner confirmed "restored" after the Driver dialog.
Driver restoration is confirmed by owner; Rider/Community restoration is not separately confirmed.
Keep original bundle IDs/signing; no replacement app records or keys.
Owner Android build succeeded: ESH Driver Android, main/fd0f2dd, Codemagic ID
6ac1b54b7394575b200adc94, started 2026-10-03 21:09 CDT, duration 3m19s, signed APK artifact shown.
Owner iOS build: ESH Driver iOS, main/fd0f2dd, ID 6ac1b6f37394575b200adcc5, started 21:16 CDT,
duration 2m36s, finished with post-processing failed after successful App Store Connect upload.
Build 1791080231 corresponds to 2026-10-03 21:17:11 CDT. Owner answered export-compliance
None and sees Ready to Submit. Owner subsequently confirmed version 1.0.2, assigned build
1791080231 to ESH Driver Internal Testers (two testers), saved What to Test and accepted the missing
invitation to make the app visible. The old 1.0.1 listing was a separate older version section.
Do not rebuild solely for post-processing/compliance. Exact post-processing failure remains unknown;
physical iOS camera capture/replacement upload is owner-confirmed after selecting the correct Driver.
Private viewing acceptance is not separately reconfirmed. Android live capture now has a reported
failure; verify installed version and exact behavior before selecting a repair or rebuild.

Owner requested beginning builds. Prepared Driver-only version 1.0.2: Android versionCode 3 and
iOS marketing version 1.0.2 (workflow already generates unique iOS build numbers). No workflow or
Rider version change. Commit/push is complete. Wait for hosted Driver Ready at fd0f2dd, then owner
starts ESH Driver Android and ESH Driver iOS from main, confirming fd0f2dd as build source. Android workflow
produces signed APK/AAB without auto Play upload; iOS submits to TestFlight. Use existing signing
and protected Mapbox credentials, never new keys or secrets in logs. Verify Android code 3 exceeds
the latest Play upload before publishing. Native builds have not been started by Codex.

No further feature commit/push is needed; this deployment-checkpoint handoff edit is local.
No database migration is needed. Deploy hosted Driver to test private viewing and upload controls.
Build/install Driver iOS via the existing TestFlight workflow and Android via the signed release workflow to verify live photo capture,
permission denial, cancellation, file fallback and safe areas. Android still needs device testing.
Verify another account cannot open these documents, and Admin reviews remain shared after refresh.
Confirm Admin/Transportation Ready at 49a6f87 and later uploads visible in Applications/Drivers.
Do not initiate trips, emergency actions, payouts or approve placeholder files during testing.

Keep transport-platform-admin/admin.eshapp.com as control plane and trusted API backend, and
esh-platform-transportation/transportation.eshapp.com for operations. Only the legacy Admin
/transportation UI is eventually redirected after acceptance. No domain retirement now.

Architecture: docs/architecture/driver-applicant-portal.md, docs/architecture/mobile-app-shell.md,
docs/architecture/transportation-admin-application.md and docs/architecture/driver-map-home.md.
Manual checks: docs/operations/driver-application-manual-test.md,
docs/operations/mobile-app-shell-manual-test.md, docs/operations/ios-codemagic-testflight-release.md,
docs/operations/transportation-admin-application-manual-test.md and
docs/operations/driver-map-home-manual-test.md. Owner local rollback SQL remains
tooling/sql/driver-applicant-portal-test.sql and has not been run by Codex.

## Rider draft and validation

- Bottom-panel follow-up passed 8 browser checks, including 414 × 896, 320 × 600 and desktop
  placement, exposed-map hit testing, vehicle selection, scheduling, GPS and geographic shortcuts.
  Rider typecheck, scoped lint and production build passed with existing warnings. Screenshots
  are ignored under `test-results/rider-booking-*.png`. No production writes or payments.
  A simultaneous build initially removed the nested preview output, causing server errors;
  sequential build then browser validation passed. Do not run those two jobs concurrently.
- Final release review passed: 7 browser checks, 30 Rider/maps unit tests, Rider typecheck,
  scoped lint (existing vehicle-image warning), production build, and whitespace checks. The
  review fixed pre-admission clipping; a 320 × 480 onboarding test verifies scrolling.
- Before the owner's push, read-only remote verification confirmed the previous `86b123d` baseline.
  It is now superseded by owner-pushed `1f0ff5d`. Preview-generated TypeScript paths
  are excluded from the staging list; environment backups and screenshots are ignored.
- Geographic integration inspection confirmed that production already uses real Mapbox/OpenFreeMap
  vector tiles. No simulated grid, sample Rider history, or fictional GPS is imported by production.
  Those fixtures remain solely in the isolated preview/test harness.
- Search retrieval now retains and validates coordinates. Draft destination/pickup pins use them;
  recent trips reuse RLS-authorized stored booking coordinates. Legacy trips without coordinates
  ask for address selection again instead of inventing locations. Home saves a verified address
  and service area in memory for this signed-in session only, clearing on identity/provider change.
- GPS is independent of Mapbox availability. Existing grants enable foreground watches; the
  locate button explicitly requests permission otherwise. Watches stop while hidden, on identity
  changes, and at unmount. GPS denial/unavailability clears the marker and explains manual entry.
  Map gestures remain enabled; live GPS updates do not continually override the user's camera.
- Six browser checks passed: full/short viewport geometry, navigation, scheduling, GPS coordinate
  updates and map gestures, permission denial, and search/Home/recent coordinate selection.
  Maps unit suite: 15 passed; Rider unit suite: 15 passed. Production build passed; scoped lint and
  type checks passed with known baseline warnings. Browser/device GPS and search were fixtures.
- Local real-account testing remains configuration-blocked: Rider `.env.local` has no populated
  public Supabase key or Mapbox public token. Values were not printed or modified. Live tile
  rendering was verified earlier against OpenFreeMap. Physical-device/native permission lifecycle
  and actual configured Mapbox search still require manual validation with Rider's own setup.
- Latest refinement uses a generated transparent silver sedan illustration and bold 24px Request your ride text. Viewport-fit and explicit
  map/panel widths prevent a right-side strip; a ResizeObserver resizes the live canvas. The panel
  includes safe-area padding and its shortcut row remains fully visible at 414 × 896.
- Vector roads are pale blue-gray, buildings almost white with shallow sides, and street names
  are larger with white halos. Broad-area labels are hidden; small POI/transit markers remain.
  The no-token background now uses OpenFreeMap Liberty vector tiles, with individually styled
  road labels and 3m building sides. The former washed-out raster fallback has been removed.
  No token or environment change was made. Existing Mapbox routing/address contracts remain intact.
- Manual preview initializes its fictional, pre-approved GPS through the map-center action only,
  leaving booking addresses empty. Production uses actual GPS
  after permission is granted; a successful fix displays even if address resolution fails.
- Updated browser checks passed (6), including 414 × 600 viewport clipping coverage; production
  build and scoped lint passed with known existing warnings. Live vector rendering was verified
  at 414 × 896 with fictional GPS and Rider fixtures; screenshot: `test-results/rider-live-preview.png`.
  Manual preview uses its actual resizable window viewport rather than forcing a potentially
  off-screen 896px browser content area. UI sizing accounts for height as well as width.
- Home uses live Mapbox Streets, or OpenFreeMap vector tiles without a token, and a bottom Request your ride
  panel. Home uses a verified session address; recent destinations use existing book-again functionality.
  Booking appears in a nonmodal bottom panel with Escape/X dismissal. The donut menu opens Request, Trips, Payments,
  Wallet, and Account with Escape dismissal and focus return.
- Provider switching and sign-out are in Account after profile creation. Onboarding remains visible.
- Fare-policy/payment disclosure and server-authoritative booking behavior remain intact.
- Scheduled trips/history remain accessible during an active ride; the CSS that hid history and
  ratings has been removed. Optional notes and vehicle/time controls expand on request.
- The map uses service-area and authorized active-trip coordinates and existing Driver refresh.
  It introduces no automatic permission prompt, location database writes, or offline caching.
- Locked dependencies were restored because the local compiler was missing; lockfile unchanged.
- Rider type check and production build passed. All 15 existing Rider unit tests passed.
- Scoped lint of Rider source, maps source, and the new browser test passed with the existing
  vehicle `img` warning. Full Rider lint is blocked by pre-existing project-service errors on
  generated native JavaScript and `public/push-sw.js`.
- The existing Google toll test fetch mock now declares `typeof fetch` so its captured request
  arguments pass TypeScript.
- Six updated UI browser fixture checks passed, including exact 414 × 896 panel/menu geometry,
  navigation, scheduling, GPS/gestures, denial, and geographic shortcuts. A screenshot check verified
  the location marker and bottom panel at y=714. Screenshots remain under ignored
  `test-results/`. Checks used dummy public Supabase configuration and intercepted preview data.
- At the owner's request, the local URL/auth troubleshooting changes have been reversed:
  `apps/rider/.env.local` was restored byte-for-byte from
  `apps/rider/.env.local.before-rider-preview`; the backup remains ignored and preserved.
- Rider's entire `sendSignInLink` function matches HEAD again, including the original browser
  redirect behavior. Native Rider URL `https://rider.eshapp.com`, the callback page, Admin code,
  and `supabase/config.toml` match HEAD. The speculative local-auth documentation and its
  callback-specific test were removed. The requested map/donut UI draft is preserved.
- The local Rider preview server was stopped so it cannot keep serving the copied configuration.
  Before resuming preview, verify Rider's own configuration with the owner; do not copy Admin
  values or change authentication based on assumptions.
- No Git mutation, deployment, hosted Auth settings change, or database mutation was performed
  by Codex. Earlier public provider lookup was read-only. Hosted redirects/templates and the live
  deployment were not verified; do not treat the earlier redirect diagnosis as established fact.
- The owner may have edited hosted redirect settings following earlier advice; their state has
  not been inspected. Do not change hosted settings during this rollback.
- Rider imports Mapbox CSS through the shared maps package, which owns the Mapbox dependency;
  this fixes stylesheet resolution with the strict pnpm installation.

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

The remaining defects are native callback/session UX:

- iOS can leave the Stripe browser sheet visible after returning to Rider.
- Android can return from a magic link and refresh into a new unauthenticated WebView session even
  though the server-side booking remains intact.
- The durable follow-up is an explicit native authentication callback contract and a payment-return
  design that reliably dismisses the external browser sheet.

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

Rider and Driver native release `1.0.1` was operationally validated. Web Push is deployed, but native
APNs/FCM delivery remains unimplemented. Keep Android and Apple signing credentials outside Git and
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
