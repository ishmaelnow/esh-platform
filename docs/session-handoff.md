# Session Handoff

Last updated: 2026-10-05

## Current objective and checkpoint

Owner clarified the camera crash is Rider iOS, while repeated session loss affects BOTH Android
apps. Rider correction is owner-pushed as 3bf1fbb (main/origin main agree). Current work is the
missing Driver Android session correction. Driver-only encrypted session/PKCE storage and native
foreground recovery are implemented locally, using Driver keys/origin/preferences/Keystore alias.
Legacy WebView values migrate only after durable save; explicit sign-out clears both stores.
Home/callback share the adapter; initial reads cannot overwrite newer Auth events. iOS auth,
working camera and EmbeddedNavigation are preserved. No Auth limits, domain settings, tenant
permissions, Driver availability or review states are changed. No migration.

Release target: Driver Android 1.0.4/code 5; owner must push, verify hosted Driver Ready, build
ESH Driver Android and install the signed update. Driver iOS is unchanged. Physical-device
restart/reboot/refresh/sign-out acceptance remains pending; exact original Android failure was not
established from device logs. Rider Android 1.0.2/code 3 and Rider iOS 1.0.2 builds remain separate.
Read docs/architecture/driver-native-session-recovery.md and
docs/operations/driver-android-session-manual-test.md. Preserve generated tsconfig edits.

Local validation: 58 Driver unit/API tests (including six camera tests), Driver typecheck and scoped
lint pass. Android Java compilation and merged manifest pass, including camera/navigation.
Initial native attempts needed the installed SDK path and a missing Kotlin cache dependency;
online retry succeeded. Backup XML and whitespace checks pass. All 24 mobile browser tests pass,
including native restart/expired-token refresh/sign-out, application/document/camera/map regressions.
Driver production build passes with existing Supabase/Next warnings. Tests use bridge/business
fixtures; signed-device Keystore durability and the original symptom remain owner acceptance.

## Rider release checkpoint

Owner approved Rider profile work: editable name, optional contact phone and optional personal photo.
Session-duration policy changes are deferred. Owner authorized repairing iOS camera crashes and
Android session persistence after profile deployment. Preserve approved Rider map/home/booking.
Existing onboarding already stored name/phone/notes; Account now edits those details with read-only
verified email and an optional private JPEG/PNG photo. Photo selection uploads immediately; text
edits require Save profile. Preview/removal is own-account only with five-minute signed links.
The original profile release added no Driver sharing, booking gate, notification, SMS consent or
session policy. Provider changes scope the editor to that provider's Rider profile.

Owner pushed the full profile feature as 8e05193 after documentation-only 63017b3 and supplied
the Rider Production Ready deployment. Subsequent native fix is 3bf1fbb. Preserve the preexisting
Driver/Rider tsconfig edits outside feature staging.
Owner applied 20261005000100_rider_profile_account.sql successfully after a dry-run listing only
that migration. Owner supplied the successful remote db push output. Existing server-only Supabase
service configuration is reused.

Checks passed: 32 Rider unit/API tests; all 14 mobile browser tests including profile save/reload,
photo upload/removal/failure and approved map/booking regressions; Rider production build and shared
Supabase type build. Existing Supabase bundler, Next ESLint plugin and vehicle-image warnings remain.
Full Account screenshot test-results/rider-profile-account-414.png was visually inspected.
414 x 896 and compact/reduced-height focused-input checks passed. Physical iOS/Android keyboard,
picker and real-account persistence/tenant isolation remain owner acceptance.
Rollback-only SQL fixture tooling/sql/rider-profile-account-test.sql is prepared but NOT executed:
local Docker daemon is stopped. API/browser mocks are not proof of real database/RLS execution.

Current device follow-up: owner reports Rider iOS live-camera photo upload fails; iOS sign-in
persists without repeated verification. Android Rider repeatedly asks for email verification.
Owner clarified iOS crashes immediately on selecting Camera, before upload. Rider Info.plist
lacked camera/photo-library purpose descriptions. Local correction adds both and an image-element
decode fallback for older WebViews. iOS authentication and existing location declarations are
preserved. Android adds a Rider-only Capacitor session vault: AES-GCM/Android Keystore, ciphertext
in app-private preferences excluded from backup/device transfer, own isolated Auth key plus PKCE
verifier only. Existing WebView session migrates only after successful native save; explicit
sign-out clears both copies. Failed vault operations report errors without silently clearing it.
Older Android shells/browser/iOS retain existing storage. Shared client storage option is additive.
Android foreground return restores/refreshes session; successful callback closes external browser.
Initial portal reads cannot overwrite a newer auth event. Supabase session limits/revocation remain
authoritative. Exact original Android device failure is not confirmed; real acceptance is required.

Checks for this follow-up: 37 Rider unit/API tests, 15 mobile browser tests (simulated native restart,
expired-token refresh, foreground return and sign-out plus profile/photo/map/booking regressions),
Rider/shared type checks and scoped lint pass with existing vehicle-image warning. Android Java
compilation and merged manifest pass; first offline attempt lacked aapt2, online retry fetched it.
Native plist and backup XML parse; whitespace check passes. Final Rider production build passes
with existing Supabase/Next warnings. No signed iOS build or device acceptance was run here.

Rider fixes were owner-pushed as 3bf1fbb. Owner waits for Rider hosted Ready, builds both ESH Rider iOS
and ESH Rider Android and installs the newer releases. Rider iOS marketing 1.0.2 with Codemagic's
unique build number; Android 1.0.2/code 3. Preserve signing/bundle IDs. No additional migration.
Verify camera prompt/capture/upload/cancel/denial, iOS sign-in regression and Android background,
relaunch, reboot, valid token refresh and explicit sign-out. Read
docs/architecture/rider-native-session-recovery.md and the updated manual acceptance guide.
Disposable SQL tests remain unexecuted. Read docs/architecture/rider-profile-account.md
and docs/operations/rider-profile-account-manual-test.md. No Git mutation, production mutation or
deployment was performed. Preserve preexisting apps/driver/tsconfig.json, apps/rider/next-env.d.ts
and apps/rider/tsconfig.json edits; exclude generated/local configuration from feature staging.

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
