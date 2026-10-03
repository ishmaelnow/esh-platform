# Session Handoff

Last updated: 2026-10-03

## Current objective and checkpoint

Owner authorized a separate Driver ID photo accepting any ID for manual administrator approval
or rejection. Keep the original portrait as Profile photo. Local implementation is complete;
owner applied the database migration successfully; application code remains uncommitted/unpushed.

Document order across Driver intake/status/history and Admin application/history/replacement:
Profile photo, Driver ID photo, Vehicle photo, Vehicle registration document, Vehicle insurance
document. Existing personal_photo and reference_document keys remain; ID uses driver_id_photo.
No license-only validation, OCR, automatic approval or added vehicle linking/assignment step.

Git main/origin main remains owner-pushed f0aa537. Both prior applicant migrations are owner-applied:
20261002000100_driver_applicant_portal.sql and 20261003000100_application_insurance_review.sql.
Owner dry-run listed only 20261003000200_driver_id_photo.sql and the subsequent db push applied
it successfully. No further database push is needed for this addition.

The migration extends existing evidence constraints and trusted atomic submission/self-service
RPCs. New submissions require all five documents. Older submitted four-file applications can add
only the missing ID without replacing reviewed files. ID accepts JPEG/PNG and defaults to optional
for activation with no required expiration; existing approved Drivers are not retroactively gated.
Tenant requirement controls, verified identity, private storage, tenant isolation, review audit,
notifications and original application approval remain authoritative. RPC signatures and existing
text-based manual client types remain compatible. No historical evidence is deleted or relabeled
as ID. The legacy Admin-hosted three-file application remains compatible; the Driver intake is five.

Client compressed files must total at most 4 MB; existing streamed request cap stays 4.4 MB.
Each file remains at most 1 MB. Registration/insurance retain PDF support. ID is a separate photo.

Validation: 58 scoped unit/API/source-contract tests and 20 isolated browser tests passed.
Driver/Admin typechecks and Driver/Admin/Transportation production builds passed. Scoped lint,
preview syntax and whitespace checks passed; baseline Supabase/Next build warnings remain.
Browser coverage includes five-file submission, tab-switch persistence and adding only missing ID
to an older application while preserving reviews. Mobile form screenshot was visually inspected.
Fixtures/source checks do not prove live authentication, database execution, RLS or production
upload/review. Owner local rollback SQL was extended for five-file and missing-ID cases but not run.
Native picking and physical-device acceptance remain pending.

Prior production checkpoint: cache fix f0aa537 resolved stale Transportation UI. Owner confirmed
one insurance entry, registration label and original review controls without linking. Owner then
approved OCTODRIVER TEST; vehicle photo, registration and insurance were approved with dates,
while profile photo remained pending. Test PDFs are placeholders, not valid compliance documents;
reject them with a reason during controlled acceptance and leave test Drivers Offline. Codex did
not change production review state.

Preserve the four existing generated Driver/Rider next-env.d.ts and tsconfig.json edits and exclude
them from feature staging. Rider product source, auth URLs, populated env files, domains and hosted
configuration remain unchanged. Owner performs every Git mutation, deployment and database change.

## Exact next action

Owner stages the explicit feature files, commits and pushes the application changes. Exclude the
four generated Driver/Rider configuration edits. Do not rerun applied migrations. After deployment,
verify new five-file intake,
missing-ID-only completion, private viewing, ID approve/reject and stable evidence order in live
Transportation Admin. Restore test state and do not approve placeholder identity/compliance files.

Keep both projects: transport-platform-admin serves admin.eshapp.com and the trusted API backend;
esh-platform-transportation serves transportation.eshapp.com and /transportation operations.
Only legacy admin.eshapp.com/transportation UI is eventually redirected after full acceptance.
Do not retire either domain or backend. f0aa537 scoped Turbo inputs include shared Admin sources;
the earlier stale cached UI issue is resolved and requires no new hosted settings change.

Architecture: docs/architecture/driver-applicant-portal.md,
docs/architecture/transportation-admin-application.md and docs/architecture/driver-map-home.md.
Manual checks: docs/operations/driver-application-manual-test.md,
docs/operations/transportation-admin-application-manual-test.md and
docs/operations/driver-map-home-manual-test.md. Owner local SQL:
tooling/sql/driver-applicant-portal-test.sql.

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
