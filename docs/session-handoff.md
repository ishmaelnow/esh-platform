# Session Handoff

Last updated: 2026-10-02

## Current objective

Let a new Driver complete an application, including the requested insurance document, and check its review status inside Driver. The owner
authorized this after approving and pushing Driver map polish at `ba115a1`. Rider remains approved
at `95c8ae2`; Rider product source is untouched. No environment or authentication URL changed.
The scoped Admin/Transportation extension lets company administrators view and hand off application
insurance to the actual assigned vehicle's existing review/compliance workflow.

Local implementation adds New driver? Apply to drive, verified-email account creation, company
selection, name/optional phone, private photos/registration/insurance document uploads, persistent own-status,
missing-file completion for submitted legacy records and Continue after approval. Existing Driver
sign-in still disallows identity creation. Existing administrator review, activation, compliance,
trip/availability, document replacement and notification contracts stay authoritative.

Migration `20261002000100_driver_applicant_portal.sql` adds verified own-status and a server-only
atomic application/evidence transaction. Company/identity retries and approval are serialized;
reviewed evidence cannot be overwritten. Upload failures clean confirmed unused files, while an
ambiguous RPC outcome retains files and asks the applicant to refresh. No automatic admission,
public evidence URLs or client table-write permission was added.

Checkpoint: 40 Driver unit/API/source-contract checks and 6 Admin insurance authorization/API checks
passed. Driver/Admin typechecks, scoped lint, preview syntax and Driver/Admin production builds
passed with existing Supabase/Next ESLint warnings. Transportation Admin production build also
passed with isolated, process-only dummy public configuration; its initial build lacked local
public Supabase configuration. No environment file was changed and actual deployment configuration
was not verified. All 18 browser checks passed (8 application plus 10 existing Driver map regressions), including
manual applicant-preview upload receipt and a reduced viewport approximating keyboard occlusion.
Complete 414 mobile form/status and compact captures were visually checked.
Browser auth/upload/review responses are fixtures; map regressions use unchanged real street tiles.
Live database/RLS, insurance linkage/review/concurrency, real email/native camera/file selection
and administrator acceptance are pending. The rollback SQL acceptance script includes insurance
storage/ownership, wrong-vehicle/self-link denial, idempotent linkage and pending compliance checks.

Insurance is required independently of the generic reference document. It is stored privately
before vehicle assignment. The administrator must match the policy and explicitly link it after
application approval/assignment; linking creates pending vehicle_evidence insurance and does not
approve it. Existing review, future expiration, notifications/reminders and online eligibility
remain authoritative. Reviewed evidence and existing vehicle policies are not overwritten.

Owner subsequently requested replacing Driver's unclear Reference document application label with
Vehicle registration document. The form/help/status label now asks for registration; multipart
`document` and legacy `reference_document` storage/review remain unchanged. Historical files are
not rewritten or reclassified. Assigned-vehicle registration compliance is still a separate existing
upload/review; this label change adds no automatic registration handoff. Insurance remains separate.
The registration-label follow-up passed scoped lint and all 18 isolated mobile/browser checks.

All application changes are uncommitted/unpushed. Codex performed no Git mutation, deployment,
database mutation, production application/file upload, email, emergency, payout or trip action.
Preserve Rider generated changes and Driver preview/build generated TypeScript paths.

## Authoritative checkpoint

- Local main and recorded origin/main are at owner-pushed `ba115a1`, following `95c8ae2` and `1f0ff5d`.
  The owner's terminal confirms the push; the new production deployment is not independently verified.
- Rider is approved. No Rider product source or environment change is part of Driver work.
- Driver preview/build generate Driver next-env/tsconfig paths; those are not release feature files.
- Latest local migration is the new, unapplied `20261002000100_driver_applicant_portal.sql`.
  Prior baseline is `20260904000700_community_starter_content.sql`; remote state was not queried.
- The owner performs all Git/deployment/database mutations.
- Current Driver architecture: `docs/architecture/driver-map-home.md`.
  Manual verification: `docs/operations/driver-map-home-manual-test.md`.
- Application architecture: `docs/architecture/driver-applicant-portal.md`.
  Release/acceptance: `docs/operations/driver-application-manual-test.md`.
  Owner-run local transactional database checks: `tooling/sql/driver-applicant-portal-test.sql`.
- Preserve deferred native Rider sign-in/payment return, successful payment/booking records,
  SMS/provider approval, and all unrelated Community/Admin work below.

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

## Exact next action

Owner reviews the applicant form with `node tooling/scripts/driver-preview.cjs --applicant`
from their PowerShell session. It supplies an already verified fixture identity and simulates
uploads/review status locally, sending no real email or application. Normal preview without the
flag still opens approved Driver map home. Close the browser to stop its server.

Before production release, owner runs the rollback SQL acceptance script on a disposable local
Supabase database with the repository schema. Database behavior has not been executed by Codex;
migration source assertions and API/browser mocks are not live RLS/transaction evidence. Then the
owner runs `corepack pnpm exec supabase db push --dry-run`, confirms only the intended new migration,
and only then applies it. Deploy Driver, the Admin backend route and Transportation Admin shared UI
after the migration. Transportation's existing API rewrite stays unchanged. Existing Driver server-only
SUPABASE_SERVICE_ROLE_KEY is also required for uploads; never expose or copy secrets across apps.

Complete real email/native callback, camera/library/PDF upload, authorized Admin review/private-file
viewing, under-review/rejected states, approval/activation, explicit insurance linkage and vehicle
insurance review/expiration/compliance acceptance using the new
manual procedure. Do not change hosted Auth settings based on assumptions. Do not use a production
payout/emergency/trip for onboarding review; leave identifiable test Drivers Offline.

New screenshots are ignored `test-results/driver-apply-verify-414.png`, `driver-apply-form-414.png`,
`driver-apply-status-414.png`, `driver-apply-incomplete-320.png` and `driver-apply-short-414.png`.
The form scrolls naturally; the reduced viewport is a keyboard approximation, not a physical-device
keyboard proof. Unreferenced storage objects after ambiguous failures may need owner reconciliation.
Do not delete referenced evidence. Unlinked legacy email-only applications are not automatically
claimed; rejected/withdrawn cases receive company-contact guidance rather than automatic reapply.

Preserve previously documented map-home backend gaps (SOS, advance preorders/offline preference,
daily distance/online duration) and all approved Rider/deferred callback/payment work.

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
