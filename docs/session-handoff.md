# Session Handoff

Last updated: 2026-08-25

## Community Conversations and Safety checkpoint

Community Conversations and Safety V1 is implemented locally in Migration
`20260825000100_community_conversations_safety.sql`. The Community member application now supports
comments, `like`/`support`/`helpful` reactions, up to four private 5 MB JPEG/PNG/WebP attachments,
private reports, and reversible mute/block controls. Reporting does not automatically hide content.
The independent Community Admin application now has a private moderation queue with reason-required
dismiss, restrict, remove, and restore decisions; related open reports resolve together and every
decision writes tenant audit evidence. Direct client table writes remain denied, product-session
and tenant authorization remain server-derived, and removed content/history is preserved. Shared
types, parser tests, migration security contracts, architecture, roadmap, and the production manual
test are updated. Community, Admin, Community Admin, and Supabase typechecks pass; Community/Admin/
Community Admin lint passes; 3 Community tests, 73 Admin tests, and 4 migration contract tests pass;
and all three affected production builds pass with only the existing Next ESLint-plugin and Admin
Supabase Realtime warnings. No migration, commit, push, or deployment has occurred yet. Next: the
owner runs the dry run, confirms only `20260825000100_community_conversations_safety.sql` is listed,
stages/commits the explicit files,
applies the migration, pushes, waits for both Vercel deployments, and executes the manual test.

## Safe Admin cleanup reminder

The independent Transportation Admin, Community Admin, and tenant-governance UX have passed their
current production checks. The future cleanup sequence for the old Admin surface is memorialized in
`docs/operations/admin-control-plane-safe-cleanup.md`. Do not remove or rename
`admin.eshapp.com` yet: Transportation still uses it as the trusted backend selected by
`TRANSPORTATION_BACKEND_URL`. First end the rollback observation window, retire only the legacy
`/transportation` and `/community` UI routes, establish and prove a stable replacement backend
origin, repoint every consumer, and only then decide whether the public control-plane domain should
be renamed.

## Current objective

Tenant Governance UX is redesigned locally around an explicit scope hierarchy. The active tenant is
repeated in a dedicated governance banner; one product is then selected above all product-specific
controls. The page names `<Product> access governance`, filters current enrollments to that product,
shows only its roles and eligible members, and names the tenant/product in status prompts, reasons,
enrollment buttons, and removal controls. The generic Workspace dropdown and mixed-product access
list are removed. Authorization and RPCs are unchanged; no migration is required. Admin,
Transportation, and Community Admin typechecks plus the 6/6 workspace UX contract tests pass.
Admin and Community Admin lint, all 72 Admin tests, the Admin production build, formatting, and diff
validation also pass; the build retains only the existing Supabase Realtime dynamic-import and Next
ESLint-plugin warnings. Next: owner commit/push the combined Community Admin and governance
checkpoint, deploy Admin, then run `docs/operations/tenant-governance-ux-manual-test.md`.

Independent Community Administration is implemented locally in `apps/community-admin`, following
the proven Transportation extraction. It uses its own `esh-community-admin-auth` browser session,
admits only explicit `community_admin`, `community_moderator`, or `emergency_publisher` roles,
selects from eligible Community tenants, and creates the Community product lease on its own origin.
`community_member` alone and unrelated Transportation/Rider/Driver/governance identity are denied.
The shell exposes only `/` and `/community`, reuses the existing Supabase/RLS/session backend, and
requires no privileged secrets or migration. Admin's Community launcher now targets the distinct
`NEXT_PUBLIC_COMMUNITY_ADMIN_URL` instead of the member application. Admin, Transportation, and
Community Admin typechecks, lint, its production build, all 71 Admin tests, and the 5/5 admission
contract tests pass. The production route manifest contains only `/` and `/community`. Next: owner
commit/push, create the Vercel project rooted at `apps/community-admin`, configure the four
documented public values, test the generated URL, then attach
`community-admin.eshapp.com`. Keep `admin.eshapp.com/community` only through the rollback window.

Cross-application sign-out stabilization is implemented locally after production review found exit
buttons appearing ineffective. Platform, tenant governance, Transportation, Community, Rider,
Driver, tenant invitation account switching, and Driver application email switching now await a
local-device sign-out, disable duplicate clicks, show progress, report errors, and explicitly return
to the appropriate entry state. Community sign-out is no longer blocked by failure to end its
operational lease. Admin, Transportation, Community, and Driver type/lint validation pass; Rider
package typecheck remains blocked by the pre-existing `google-tolls.test.ts` tuple typing error.
No migration or environment change is required. Next: owner commit/push, allow each affected Vercel
project to deploy, and execute `docs/operations/product-sign-out-manual-test.md`.

The white-label application-shell pattern is now memorialized in
`docs/development/white-label-product-guide.md` for junior developers and future recovery. The
durable rule is: reuse the proven product engine, isolate each branded shell and browser session,
centralize the trusted backend, preserve server-authoritative tenant/product access, deploy in
parallel, and cut over only after proof. Direct cross-app source import is an extraction bridge;
after production validation, reusable Transportation UI should move into a neutral product package.
Branding, domains, and configuration never constitute authorization.

The independent Transportation Admin application was committed as `c67f3a1` in
`apps/transportation`. The rollout is now explicitly a parallel interface over the existing proven
Transportation backend, followed by cutover only after production validation. It is a separate
deployable with its own route set, metadata, environment template, and isolated
`esh-transportation-admin-auth` browser session. Authentication alone is rejected unless
`my_workspace_access()` returns an enabled Transportation enrollment with the explicit
`transportation_admin` role. Product entry persists the selected tenant and creates the existing
server-authoritative Transportation lease before loading the proven operations UI. The Admin
control plane now launches `NEXT_PUBLIC_TRANSPORTATION_ADMIN_URL` and does not create the product
lease itself. The standalone app exposes only `/` and `/transportation`; its authenticated
`/api/tenant-admin/*` requests are rewritten to the stable existing Admin backend. Duplicated
privileged handlers and secret requirements have been removed. Platform, governance, Community,
invitation, reset, and cron routes are absent/redirected. No migration is required. The rewrite was
committed as `48b977e`. The Vercel deployment and custom domain
`https://transportation.eshapp.com` passed product-specific admission, unrelated-account denial,
authorized Yahooemail entry, backend-rewrite evidence, operational reads and a reversible write,
prohibited-route isolation, exclusive-session invalidation, and Mapbox rendering. Browser Network
requests returned `200` throughout, with no Mapbox `401` or `403` after its exact origin was added
to the production public-token restrictions. A keyboard-accessible eye control for explicitly
showing or hiding the Transportation sign-in password is now implemented locally; typecheck, lint,
production build, and diff validation pass. Next: owner commit/push this documentation and password
UX checkpoint, deploy Transportation, manually verify the toggle, then begin the independent
Community Admin application. Keep the legacy Admin `/transportation` route only through the agreed
rollback observation window.

Separate ESH products operationally while retaining shared platform infrastructure. Community
Migrations 1–6, exclusive product sessions, stabilized product entry, the independent Community app
at `community.eshapp.com`, and strict Community product admission are deployed through commit
`5c3120f`. The immediate objective is Platform-controlled tenant product entitlement. Migration
`20260824000100_platform_product_entitlements.sql` is implemented locally with paired Platform and
Tenant Governance UI. Existing enabled products receive a migration-sourced grant, preserving all
current Transportation tenants; disabled Community workspaces receive no grant. New tenants receive
no product automatically. Only Platform Owner/Admin can grant, suspend, restore, or revoke a product
with a reason and audit evidence. Tenant Governance shows only entitled products and cannot enable
an unentitled product. A Community grant manages its six required capabilities without activating
the workspace or enrolling anyone. Suspension/revocation ends active product sessions. Local
typechecks, lint, 69 Admin tests, five entitlement contract tests, formatting, diff validation, and
the Admin production build pass. Next: owner dry-run/apply Migration 7, deploy, verify compatibility,
then provision a new Community-only pilot tenant and grant only Community. Transportation
operational follow-ups, native push, Twilio billing ticket `#29018616`, and the Stripe sandbox
dispute retry remain separate work.

Migration 7 and commit `9bed499` are now deployed. During the new tenant-owner invitation test, an
existing Rider identity successfully reset its password but `accept_tenant_invitation` failed with
`column reference "auth_user_id" is ambiguous`. Corrective migration
`20260824000200_fix_invitation_auth_identity_ambiguity.sql` recompiles the existing acceptance
function with an explicit PL/pgSQL variable-resolution rule while preserving its email match,
membership, role, tenant activation, preference, and audit behavior. The invitation remains pending;
after this corrective migration is applied, reopen the original invitation and accept it.

Migration 8 applied successfully and invitation acceptance advanced to the preference update, where
the legacy `active_tenant_preferences_prevent_tenant_id_change` trigger rejected switching the
existing Rider identity from its previous tenant preference to the newly accepted tenant. This is a
foundation guard defect: `active_tenant_preferences` is intentionally one mutable pointer per person,
while the person owner must remain immutable. Corrective migration
`20260824000300_fix_active_tenant_preference_switch.sql` removes only the invalid tenant immutability
trigger and replaces it with a person-identity guard. The composite membership/tenant foreign key and
existing RLS continue enforcing a valid active membership. Invitation acceptance was transactional,
so the invitation remains pending for retry after Migration 9.

## Community Platform checkpoint (2026-08-23)

The first visible Community slice is deployed. `apps/community` uses an
isolated ESH session, lists only enabled Community enrollments, explicitly enters the Community
product lease, renders a chronological feed, and creates ordinary public/member posts through a
narrow RPC. Migration `20260823000600_community_core_content.sql` adds the shared envelope, typed
post/announcement/event/alert/help/opportunity/resource records, tenant-aware targets, structured
actions, search/lifecycle indexes, RLS, typed-kind guards, and a display-safe feed RPC. It creates no
tenant content, does not enable Community, and grants clients no direct writes. Migration 6 is
applied and commit `144bc43` is deployed. Product-specific admission correction `5c3120f` is also
deployed. The pilot direction changed from adding Community to Yahooemail to provisioning a new,
Community-only tenant after Platform entitlement separation is deployed.

The Community product entrance now enforces the clean product-admission contract locally: shared
credential infrastructure is not shared product admission. After credential verification, the app
retains its isolated session only when `my_workspace_access()` returns an enabled Community
enrollment with an active Community role. Any unrelated Rider, Driver, Transportation, governance,
or other tenant account is signed out locally, receives a neutral Community denial, and sees no
Community tenant, navigation, or content. This UX correction requires no additional migration.

The approved product direction is documented in `docs/architecture/community-platform.md`, and the
ordered database/RLS rollout is documented in
`docs/architecture/community-platform-migration-plan.md`. Community will reuse neutral ESH identity,
tenant membership, capabilities, audit, storage, maps, and notification delivery while remaining
independent of Rider/Driver business identities. The design uses a shared content envelope plus
typed records, a separate Services directory, Community-specific areas, explicit verification and
moderation history, announcement promotion rather than privilege elevation, and publication
authority separated from broadcast authority.

V1 targets tenant/community, Community area, and group audiences; delivers an in-app notification
foundation first; and defers poll voting, selected-user targeting UI, polygon/residency verification,
native push, Community mass SMS/email, monetization, provider ratings, booking, advanced ranking,
external search, and AI moderation. Existing tenants receive Community capabilities disabled by
default.

Community Migration 1 is implemented locally in
`supabase/migrations/20260823000100_community_authorization_foundation.sql`. It replaces the growing
capability-key check constraint with a catalog while preserving existing keys, adds six disabled
Community capabilities, introduces permission and controlled role-bundle catalogs, seeds
conservative tenant settings, and adds membership-derived authorization helpers. Active members
receive baseline permissions, tenant owners/admins derive the Community Admin bundle, moderators
are explicitly assigned, and emergency publishers receive a separately assigned emergency-only
bundle. Admin and moderator authority do not imply Emergency authority.

The migration includes tenant-aware assignments, immutable identity/history guards, narrow
assign/revoke RPCs, settings attribution and audit, RLS, and audit events. Platform auth constants
and manual Supabase client types are updated. Tests include a static migration contract plus an
opt-in local Supabase RLS matrix for disabled defaults, member, owner/admin, moderator, emergency
publisher, suspended membership, and cross-tenant denial. Local Docker was unavailable, so the
executable database test remains pending. The static contract test, Auth and Supabase typechecks,
package lint/tests, formatting, and diff validation pass. No migration, environment change,
deployment, or production mutation occurred during implementation.

Migration 1 was subsequently committed as `3b5dd87`, applied, pushed, and manually verified in
production. All 17 configured tenants had six disabled Community capabilities (102 total), all
settings matched conservative defaults, all 20 privilege classifications and emergency separation
passed, automatic role assignments and notifications were zero, and existing applications exposed
no Community UI or Community-related errors. This is memorialized in the Migration 1 manual test.

Community Migration 2 is implemented locally in
`supabase/migrations/20260823000200_community_places_organizations_trust.sql`. It adds tenant-aware
areas, groups/memberships, organizations/representatives, personal or organization-owned provider
profiles, and separate private organization/provider verification records. Controlled RPCs create
areas, groups, organizations and personal providers, submit verification, and make reasoned audited
verification decisions. Public reads are limited to active public areas/groups/organizations of an
enabled active tenant; membership and verification evidence remain self/representative or moderator
only. Community remains disabled and no UI is introduced.

Community Migration 2 was committed as `7aedf3d`, applied, pushed, and passed its production
dark-rollout test on 2026-08-23. All eight tables had RLS and zero rows; all three expected member
permissions were non-privileged; enabled Community capabilities, active Community roles, and
Community notifications were all zero. Admin, Rider, and Driver remained operational with no
Community UI or Community-related errors. Admin separately exposed the Supabase auth Navigator
LockManager contention message while remaining usable; this is a non-Community stabilization item.

Product Workspace Migration 3 is deployed from
`supabase/migrations/20260823000300_product_workspace_foundation.sql`. It formalizes the approved
rule: active identity + active tenant relationship + enabled workspace + explicit enrollment +
explicit workspace role + enabled capability. It adds Transportation and Community workspace
catalogs, tenant workspace state, tenant-aware enrollment and role records, RLS, controlled audited
management RPCs, and `my_workspace_access()`. Community authorization no longer derives baseline
member access from tenant membership or Community Admin from tenant owner/admin. Rider and Driver
profiles are not consulted and no Community enrollment is seeded.

To prevent a production regression, the migration performs a one-time backfill that enrolls active
existing tenant owners/admins into the enabled Transportation workspace with
`transportation_admin`. This is migration-only behavior; future tenant role changes do not create
product access. The legacy Community role-assignment table remains for deployment compatibility but
is no longer an authorization source. Static contract tests and manual client workspace types are
included. Migration 3 was committed as `8e5ae18`.

Migration 3 was subsequently applied and passed the complete production test on 2026-08-23:
17 Transportation workspaces enabled, 17 Community workspaces disabled, four active
`transportation_admin` assignments, and zero Community enrollments. The comparison population
contained two Rider/Driver-related tenant memberships, proving those business identities did not
create Community enrollment. Yahooemail Tenant Administration remained operational and Community
UI remained absent. The Admin favicon 404 and Supabase auth Navigator LockManager contention error
remain unrelated stabilization follow-ups.

That Admin feature is deployed. `/` is a tenant-aware workspace launcher;
`/transportation` hosts the existing application behind an explicit `transportation_admin` gate;
and `/community` is a separate Community Admin foundation behind Community workspace roles. Tenant
owners receive a governance panel to enable/suspend workspaces and deliberately enroll/remove active
tenant members with workspace-specific roles. Every mutation uses the deployed reason-required,
audited RPCs. Disabled Community cannot be opened, and no automatic enrollment was introduced.

Migration `20260823000400_workspace_admin_read_model.sql` adds only
`workspace_admin_snapshot()`: owners/platform admins receive the governance member/enrollment view;
other callers receive only their own workspace access. Admin UI parsing has unit coverage and the
migration has a static authorization contract test. Admin tests pass 68/68, Admin and Supabase
typechecks pass without incremental caches, lint passes, and the production build passes with only
the existing Supabase Realtime dynamic-import and Next ESLint-plugin warnings. Migration 4 was
applied and commit `22fcafe` pushed. Production displayed separate enabled Transportation and
disabled Community cards plus governance controls; the full manual test record remains open.

ADR `docs/adr/0002-separate-product-applications-shared-platform.md` is now accepted locally. The
target is governance-only `admin.eshapp.com` plus separately deployed Transportation Admin,
Community Admin, Community member, Rider, and Driver products. One identity may be eligible for
several products but may operate only one product at a time. The next implementation milestone is a
server-authoritative exclusive product-session lease with stale-tab denial; after that, extract the
two Admin products from the transitional routes. No product/domain/DNS change has been made yet.

That exclusive-session milestone is now implemented locally in Migration
`20260823000500_exclusive_product_sessions.sql`. `product_operational_sessions` permits one active
lease per person across browsers/devices and binds it to the server-derived Supabase Auth session,
tenant, and product. Explicit entry supersedes the prior lease; governance entry ends it; one-minute
heartbeats extend a 30-minute lease; expiration and every entry/exit/supersession preserve history
and audit evidence. Clients receive no table write grants.

Transportation tenant-role authorization now requires both the original foundation tenant role
and an active Transportation product lease. Neutral tenant-owner workspace governance uses the new
ungated `has_foundation_tenant_role`, preventing the session rule from locking owners out of the
control plane. The selector enters products before navigation and never auto-enters from a direct
URL. Transportation and Community routes verify and refresh their expected lease; a superseded tab
clears operational data and denies access within 60 seconds. Community remains disabled and no
Community enrollment/session is introduced. Local validation passes: 68 Admin tests, seven static
product-session/workspace contracts, uncached Admin and Supabase typechecks, Admin lint, formatting,
diff validation, and the Admin production build. Only the existing Supabase Realtime dynamic-import
and Next ESLint-plugin warnings remain. Migration 5 and commit `0d7aef0` are deployed. Production
confirmed that a direct product route is denied without a lease while governance remains
accessible; the full two-tab and database-evidence record remains open. Product-entry UX
stabilization is implemented locally with all 69 Admin tests passing, plus typecheck, lint, diff
validation, documentation formatting, and a successful production build (existing Realtime and
Next ESLint warnings only). Next: deploy and production-test the stabilized entry flow, then
extract the product applications.

Product-entry separation is deployed in commits `fe2fe75` and `0a6f0a0`. A production review still
displayed the obsolete inactive-session copy, although that text no longer exists in current source;
verify the latest Vercel deployment and hard-refresh during the next test. The same review found
user-facing Admin authentication copy that named Supabase. Admin sign-in, password reset,
invitation, Platform Admin, and Transportation fallback messages are now ESH-neutral locally.

Production then exposed a remaining route-boundary gap: signed-out direct navigation rendered the
shared sign-in form inside `/transportation`. Product routes now resolve authentication and redirect
signed-out users to `/`; their temporary state only says they are returning to ESH Admin. The same
boundary is applied to `/community`. Product routes no longer host authentication UI.

Local Migration 3 validation passes: workspace static contract 4/4, Migration 2 domain contract
3/3, Migration 1 static RLS contract 1/1 with its opt-in live database test skipped, Supabase
typecheck, Supabase lint, and `git diff --check`. The Supabase database linter could not connect
because no local Postgres/Supabase instance was running; the production dry run and successful
application subsequently provided the SQL parser/application checkpoint.

## Current checkpoint (2026-08-22)

Tenant Fare Policy and Rider Fare Contract V1 is implemented locally in migration
`20260822000100_tenant_fare_policy_contract_v1.sql`. Admin selects guaranteed upfront, metered
actual, or protected flexible (percentage/fixed cap); every new quote snapshots the policy and
maximum; Rider receives explicit pre-payment disclosure; and completion reconciliation preserves
the raw meter while applying the accepted contract. Guaranteed fares cannot create traffic
surcharges, protected increases stop at the disclosed maximum, and metered fares use trusted actual
time/mileage. The same migration corrects the lifecycle proximity baseline from the mistakenly
implemented 250 meters to the required 250 feet, with bounded GPS-accuracy accommodation. Code
validation and the owner migration dry-run are the next checkpoint.

Apple Universal Link support is prepared locally using Team ID `5BJ7VXSZ3R`: Rider and Driver now
have `apple-app-site-association` files, iOS Associated Domains entitlements, and Xcode build
settings referencing those entitlements. These changes are not committed or deployed. Owner must
enable Associated Domains for `com.esh.rider` and `com.esh.driver` in Apple Developer, regenerate
the App Store provisioning profiles, then commit/deploy and build new TestFlight versions. Verify
the public AASA URLs before testing fresh sign-in links.

The repeatable Apple Developer → Codemagic → App Store Connect → TestFlight procedure, including
Universal Link, signing, export-compliance, and internal-testing checks, is documented in
`docs/operations/ios-codemagic-testflight-release.md`.

## Repository and deployment state

- Hybrid toll fallback commit `728ae13` is deployed and requires `GOOGLE_MAPS_API_KEY` in the Rider
  Production environment. Migration `20260816000300_google_toll_estimates_v1.sql` must be applied
  before a successful Google-backed quote can be persisted. A local diagnostic follow-up is
  validated by Rider tests and typecheck; it will expose only Google's HTTP status and safe error
  status/message in server logs. Owner must deploy it, then inspect the reported status.
- Actual-distance adjustment schema is present in migration
  `20260817000100_actual_distance_adjustments_v1.sql`, but the Driver completion flow does not ask
  users to enter distance. Future candidates must come from trusted server-calculated route/GPS
  data; no automatic fare, payment, refund, or Driver-earnings movement occurs yet. The temporary
  manual-input UI was removed before the follow-up deploy.
- Production route-metrics work is now implemented locally in migration
  `20260817000200_trip_route_metrics_v1.sql`. It aggregates consented in-trip Driver location
  updates into distance/duration on the booking, retains no point history, and captures metrics at
  completion. The migration dry-run lists only this migration. It still needs owner apply, type/
  production validation, and the final fare-adjustment/payment workflow before any fare changes are
  enabled.
- Route metrics are now consumed by local migration
  `20260820000200_trip_fare_reconciliation_v1.sql`. On completion, when trusted aggregate metrics
  are available, it calculates a comparison fare from the immutable quote pricing snapshot and
  records one idempotent `trip_fare_reconciliations` row plus an audit event. The locked fare,
  Stripe payment, Driver earnings, and ledger remain unchanged until a separately authorized
  reconciliation action is implemented. Admin Ledger now exposes a tenant-scoped Fare reconciliation
  workspace for inspection. The migration still needs owner dry-run/apply, generated type
  validation, and production testing.
- Local migration `20260820000300_trip_fare_reconciliation_review_v1.sql` adds an explicit,
  reasoned Admin approve/reject decision with audit evidence. It intentionally does not move money;
  Stripe settlement remains the next financial workflow. Product policy is now: Rider approval is
  not required after completion; Riders receive a fare-difference notice, lower actual fares may be
  partially refunded automatically, and higher actual fares create a separate balance due for
  Stripe Checkout collection rather than a silent charge.
- Local migration `20260820000400_trip_fare_settlement_v1.sql` adds idempotent settlement records,
  Stripe refund/off-session charge preparation, and balanced ledger settlement. Admin approval now
  invokes the settlement route. If an extra charge cannot use the saved payment method, the result
  is `balance_due` for later Rider collection. It still needs owner dry-run/apply, deployment, and
  production Stripe sandbox validation.
- A dispatch usability fix is local in migration `20260820000500_guard_admin_in_progress_cancellation_v1.sql`:
  Admin no longer sees or can invoke pre-trip cancellation for an in-progress trip. The only path
  is the audited **End trip as Admin** action with a required reason. It still needs owner
  dry-run/apply, deployment, and an in-progress Admin completion retest.
- Production manual testing found a separate lifecycle hardening issue: a Driver can currently
  complete an in-progress trip without measurable movement. Leave this behavior unchanged during
  route-metrics validation; later add no-movement/insufficient-telemetry detection and operational
  review rather than silently recalculating the fare to zero.

- Branch: `main`
- Admin session stabilization is deployed and passed production testing. DFW Metroplex and
  Philadelphia service areas were created successfully; Realtime Driver Location passed its live
  production test.
- Live Trip Maps commit `bba70b8`, regional geocoding commit `7b3dcd9`, pre-booking validation commit
  `a3f9ccb`, and migrations through `20260809000200_rider_geocoding_context.sql` are pushed and
  deployed. `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is required in all three Vercel projects.
- Atomic Rider booking/geocoding commit `7ed2442`, regional autocomplete commit `7973e26`, and
  migration `20260810000100_atomic_rider_geocoded_booking.sql` are deployed.
- Automatic Driver Matching commit `72c3f93` is deployed; production manual testing passed.
- Realtime Driver Location commit `7121a36` and migration
  `20260801001300_realtime_driver_location.sql` are deployed to production.
- Trigger hotfix commit `6da5ba0` and migration
  `20260802000100_fix_location_stop_triggers.sql` are deployed; Rider booking creation retest passed.
- Confirm migration state with a dry run rather than assuming it from this handoff.
- Reputation V1 commit `e87655e`, Rider layout fix `75505f7`, and migration
  `20260810000200_trip_reputation.sql` are pushed and deployed.
- Ledger commits through `e54a1b3` and migrations through
  `20260811000200_fix_ledger_currency_summary.sql` are deployed.
- Trip Pricing V1 and completed-fare ledger fixes are deployed through commit `eed38f6`; production
  booking, lifecycle completion, and the $48.94 Rider fare display passed.
- Driver Earnings and Wallet V1, its migration fix, and the Admin six-account validation fix are
  deployed through commit `9e61228`; production wallet and ledger reconciliation passed.
- Rider Payments and Collection V1 is implemented locally in
  `20260812000200_rider_payments_collection_v1.sql`; it is deployed through commit `ee21e67`, and
  paid-trip recovery fix `688693b` is deployed.
- Driver Connect Onboarding V1 is deployed through commit `9eb69ee`, and migration
  `20260812000300_driver_connect_onboarding_v1.sql` is applied. Production showed the Driver wallet
  and payout setup control. Compatibility fixes are deployed through commit `b1c1729`. Production
  Stripe-hosted onboarding passed, the verified Connect webhook synchronized the account to
  `enabled`, and **Manage payout account** is available.

## Delivered capabilities relevant to the test

- Verified Rider email access and tenant-scoped Rider profiles.
- Ride-now self-service booking and cancellation.
- Manual Admin Dispatch and Driver trip lifecycle.
- Driver offer deadlines, expiration recovery, alerts, and email.
- Rider lifecycle emails and Rider-controlled trip-email preference.
- Tenant-time-zone scheduled pickup selection.
- Tenant-controlled minimum notice, maximum advance window, dispatch lead, and reminder lead.
- Scheduled bookings remain unavailable to drivers until dispatch activation.
- Database-native one-minute scheduled activation using `pg_cron`.
- Scheduled confirmation, reminder, and dispatch-started Rider emails.

## Current test checkpoint

Preset Toll Pricing V1 is implemented locally as a generic database-backed catalog with DRPA as the
initial Philadelphia authority. The trusted quote route keeps Mapbox traffic-aware distance and
duration, performs a metadata-only driving request for named toll collection points, resolves
catalog aliases and effective-dated rates for westbound passenger/SUV crossings, validates rate
references inside the service-role quote RPC, and rejects unknown toll facilities rather than
undercharging. Toll amount, rate references, aliases, and source details are stored in the locked
quote snapshot and shown in the Rider quote. Maps tests pass 12/12; Rider tests pass 8/8; Rider and
Supabase typechecks pass; Rider production build passes after adding the generated relationship
metadata for the new catalog view and rebuilding with a fresh Next ESLint cache. The migration has
been dry-run and applied successfully after correcting ambiguous catalog seed references. It
preserves the deployed 10-argument quote RPC during rollout and adds the required 12-argument
toll-aware RPC. Commit `1851c72` is deployed. Next: run
`docs/operations/preset-tolls-manual-test.md` in production.

The first production toll test exposed a matcher false negative: Mapbox reported a detected toll
facility, but its descriptive metadata type did not match the catalog's stored `mapbox_type`. The
local follow-up now treats the normalized facility alias as the pricing identity and retains the
Mapbox type only as metadata. Maps tests pass 13/13; Rider tests pass 8/8; Maps build, Rider
typecheck, and diff checks pass. It needs owner commit/deploy before retesting the DRPA route.

The deployed diagnostic then confirmed the DRPA route returns an unnamed `toll_booth`. A local
coordinate-matching follow-up now captures Mapbox toll intersection coordinates, stores trusted
coordinates for the four DRPA facilities, and matches unnamed booths within a bounded radius. It
adds migration `20260816000200_toll_facility_coordinates_v1.sql`. Maps tests pass 14/14; Rider
tests pass 8/8; Maps/Rider/Supabase typechecks and diff checks pass. Next: dry-run and apply only
that migration, owner commit/deploy, then rerun the DRPA production test.

Live Trip Maps, Routing, and ETA passed production manual testing across Rider, Driver, and Admin.
The successful Philadelphia trip normalized both selected addresses and initially rendered a
plausible 28-minute, 15-mile road route. Driver acceptance, shared-map parity, consented live Driver
marker, refreshed ETA, authorized Rider/Admin visibility, explicit stop-sharing, marker removal, and
saved-route persistence all passed.

Regional autocomplete, required suggestion selection, permanent re-geocoding, atomic booking and
coordinate persistence, and rejection of invalid/mapless booking creation are deployed. Mapping
tests pass 9/9; maps and Rider lint/typechecks plus the Rider production build passed before release.

Reputation V1 has role-derived Rider and Driver submission RPCs, a 30-day submission window,
seven-day/both-submitted disclosure, tenant RLS, audited Admin moderation, and Rider, Driver, and
Admin UI. Production manual testing passed, including the corrected Rider layout and Driver rating
submission experience.

Capacitor Mobile App Shell V1 is implemented locally. Rider and Driver each have separate Capacitor
configuration, Android and iOS projects, native bundle IDs, secure HTTPS hosted URLs, and App,
Browser, Geolocation, and Push Notifications plugin registration. The shell preserves the existing
Next.js backend and web UI; no server secrets enter the bundle. Native push credentials, store
signing, and background-location review remain follow-up work. Rider Android now uses the verified
HTTPS App Link `https://rider.eshapp.com/auth/callback?tenant=<tenantSlug>` with
`apps/rider/public/.well-known/assetlinks.json` and retains `com.esh.rider://auth/callback` as a
fallback. Its native callback handler accepts both PKCE codes and token fragments before restoring
the Supabase session. Driver Android now has the corresponding verified
`https://driver.eshapp.com/auth/callback` App Link, `com.esh.driver://auth/callback` fallback,
browser callback route, and idempotent native session restoration. Rider and Driver tests,
typechecks, and production builds pass. Next: owner commit/deploy the Driver App Links change,
verify the public Driver assetlinks endpoint, then build and install the Driver debug APK using
`docs/operations/mobile-app-shell-manual-test.md`.

Driver embedded navigation is now implemented locally on the Android native boundary. The Driver
dependency uses Mapbox Navigation SDK 3.26.0 with the secret Downloads:Read token remaining in the
owner's global Gradle properties. A Capacitor `EmbeddedNavigation` plugin launches an Android
Mapbox navigation screen with the verified pickup/destination coordinates and the public runtime
token. Web, iOS, and older APKs retain the existing Google Maps fallback. The native screen now
also renders the current written maneuver announcement in a high-contrast banner while retaining
Mapbox voice guidance. The latest native follow-up replaces the custom banner with Mapbox's official
maneuver and trip-progress views plus the NavigationCamera/viewport data source, retaining voice
guidance and route-line rendering. This supplies turn icons, street names, distance-to-next-turn,
ETA, and continuous location-following camera behavior. Driver web tests pass 16/16 and typecheck/diff
checks pass. The native
Android build and device test are still required; do not claim embedded turn-by-turn is
production-ready until the APK visibly opens the Mapbox screen, obtains location permission,
draws a route, follows the Driver location, and displays written maneuver updates.

Admin trip termination is implemented locally in migration `20260818000100_admin_end_in_progress_trip_v1.sql`.
It adds a tenant-authorized `admin_complete_in_progress_trip` RPC, requires a 3–500 character
reason, records the Admin person and completion reason on the booking, and writes an audit event.
The Admin Dispatch panel now shows **End trip as Admin** only for `in_progress` bookings. Admin
tests pass 63/63; Admin and Supabase typechecks plus diff checks pass. Next: owner dry-run/apply the
migration, commit/deploy, and test an in-progress trip from Admin while confirming Rider/Driver
status and financial completion behavior.

Rider/Driver trip-surface cleanup is implemented locally: completed and cancelled Rider bookings
are collapsed into a compact Trip history section while active bookings remain prominent; Driver
pickup navigation is shown only before arrival, and destination navigation remains available after
arrival. Driver tests/typecheck pass (16/16); Rider tests pass (11/11), but Rider typecheck still
reports the pre-existing `google-tolls.test.ts` tuple/body typing error. These are web UI changes
and do not require a native rebuild. The Rider booking form is also disabled while a live trip is
requested, offered, accepted, arrived, or in progress; future scheduled bookings do not block a
new request.

Rider pickup convenience now supports a one-time current-location lookup through Capacitor
Geolocation (with browser fallback) and Mapbox reverse geocoding. The resolved street address is
shown for confirmation and remains editable through the normal verified-address search; raw
coordinates are not persisted by this convenience flow. This is a hosted web change and does not
require a native rebuild because the Geolocation plugin is already present in the Rider shell.

Vehicle service choices are now implemented locally. Vehicles default to `standard` and Admin can
classify each fleet vehicle as `standard`, `larger`, `premium`, or `accessible`; Rider booking
passes the selected type through the priced-booking RPC, and automatic matching requires an active
assigned vehicle of that type. Rider uses a collapsed vehicle-type dropdown with the selected ride
image; vehicle model names and years are not shown to Riders. Migrations `20260819000100_vehicle_service_types_v1.sql` and
`20260819000200_premium_vehicle_service_type_v1.sql` still need owner dry-run/apply, commit,
deployment, and production matching validation.

Tenant ride-type fare adjustments are implemented locally as tenant-configurable fixed surcharges
for Standard, XL, Premium SUV, and Accessible. Admin pricing now edits those four adjustments;
the trusted quote RPC snapshots the selected service type and surcharge before payment. Migration
`20260819000300_service_type_fare_adjustments_v1.sql` still needs owner dry-run/apply, commit,
deployment, and quote/payment validation.

The first production quote attempt exposed an RPC overload ambiguity between the legacy quote
function and the service-type extension. Local follow-up migration
`20260819000400_fix_service_type_quote_rpc_v1.sql` drops the ambiguous overload and uses the
distinct `create_rider_price_quote_with_service_type` RPC. It needs owner dry-run/apply and a
fresh Rider quote test.

The follow-up booking test then exposed the same default-argument overload pattern on
`create_my_rider_priced_booking`. Local migration
`20260819000500_fix_service_type_booking_rpc_v1.sql` removes that overload and exposes
`create_my_rider_priced_booking_with_service_type`. Payment-success auto-finalization remains a
separate follow-up because it requires an idempotent booking intent carried through Stripe
metadata/webhook processing.

Local payment-flow follow-up `20260819000600_auto_finalize_paid_rider_booking_v1.sql` now
finalizes normal paid quotes idempotently from verified Stripe success, carries booking intent in
checkout metadata, and sends the Rider directly to Current trip. Wallet-only normal bookings also
finalize immediately; recurring occurrence checkout remains separate. The first Vercel deployment
failed because the Rider checkout response type omitted the new `booked` field and the fallback RPC
payload omitted its required nullable `scheduled_pickup_at_value`; both are corrected locally and
the Rider production build now passes. Owner must commit/deploy the correction, confirm migration
006 is applied, and then run the Stripe sandbox validation.

The payment return UX now polls payment/booking status for up to 15 seconds and shows a confirming
state instead of immediately exposing the webhook race. It only reports a timeout when booking
finalization does not appear during that window.

Production testing then exposed that the service-role Stripe webhook was invoking a Rider-authenticated
booking function without a Rider JWT. Migration `20260820000100_finalize_paid_booking_service_role_v1.sql`
rehydrates the paid quote's active Rider identity only inside the security-definer finalizer so the
webhook can complete the same authorization checks safely. It needs owner dry-run/apply, commit,
deployment, and a retry of the affected payment webhook.

The payment-status endpoint now also attempts idempotent finalization for a paid, unbooked quote,
so a Rider refresh can recover a missed webhook without another charge. Scheduled checkout returns
carry the scheduled pickup timestamp for this recovery path.
The payment-return query is now retained until confirmation succeeds, so a timeout followed by a
refresh retries the same paid quote instead of losing the recovery context.

The product flow was intentionally returned to two-step confirmation: payment records the paid
quote, and the Rider explicitly selects **Request this trip**. Normal Stripe webhooks no longer
auto-create a booking, and wallet-only checkout likewise returns to the paid-but-unrequested state.

## Temporary production settings

The test plan recommends temporarily using:

- Minimum notice: 15 minutes
- Maximum advance window: 90 days, or temporarily 1 day for boundary testing
- Dispatch lead: 5 minutes
- Reminder lead: 1 hour

These values are recommendations, not a confirmed statement of current production configuration.
Record the actual values here when the owner reports them.

## Confirmed recent production results

- Rider production portal loads at `https://rider.eshapp.com`.
- Existing Rider identity was recovered successfully in another browser when the magic link was
  requested and opened in that same browser.
- Continued-search Rider email was automatically delivered after an unresolved Driver offer.
- Rider Trip Notifications manual verification produced successful results before scheduled
  booking testing began.

## Known operational detail

Supabase PKCE magic-link exchange must be completed in the same browser/device that initiated that
specific sign-in attempt. The Rider account is portable, but each new browser must request and open
its own link in that browser. Email-app embedded browsers and link scanners can consume or disrupt
one-time links.

## Open issues

Rider payment collection, the $49.39 paid-trip recovery flow, booking, and trip completion passed in
production. Driver Connect infrastructure, payout settings, connected-account webhook, deployment,
migration, hosted onboarding, and status synchronization also passed. The Driver account is
`enabled`; wallet totals remained $85.57 pending, $39.51 collected, $0.00 paid, and $125.08 owed.
The sandbox payout bank selected during onboarding ends in `2227`, Stripe's insufficient-funds test
fixture; it did not prevent account enablement but should be changed to the success fixture ending
`6789` before eventual payout execution testing.

The existing $39.51 collected earning cannot be used for a Stripe transfer: its Rider charge was
created in the original RideEasy sandbox, while the Driver connected account was created in the
separate RideEasy Connect Test sandbox. Rider and Driver must use the same Connect-enabled platform
environment for new collection and transfer activity. This version still creates no transfers or
payouts. A new $51.31 Rider payment in RideEasy Connect Test completed successfully; its $41.05
Driver share is the intended first transfer test. Local Driver Transfers V1 now implements a
per-trip, source-payment-verified, idempotent Stripe transfer and balanced payable settlement.
Driver Transfers V1 is deployed through commits `b8e0705` and `6f6008a`, its corrected migration is
applied, and production passed end to end. The $41.05 Driver share created exactly one Stripe
transfer, reduced cash clearing and the Driver payable by $41.05, moved the Driver wallet amount
from Collected to Transferred to Stripe, and left the old-sandbox $39.51 untouched.

Driver Bank Payout Reconciliation V1 is implemented locally. It records signature-verified
connected-account `payout.created`, `payout.updated`, `payout.paid`, and `payout.failed` lifecycle
without a second ledger posting, and exposes Driver/Admin status. Driver tests, Driver/Admin/
Supabase typechecks, Admin tests, both production builds, and diff checks pass. The migration dry-run
lists only `20260813000200_driver_payout_reconciliation_v1.sql`. It needs webhook event selection,
owner commit/deployment, migration application, and production test.

During the payout manual test, **Manage payout account** replaced the Driver page with Stripe
Express and provided no ESH return control. A local UX fix now opens only the Express Dashboard link
in a separate tab while preserving the current-tab hosted-onboarding return flow. It needs Driver
owner commit/deployment; Driver tests, typecheck, and diff checks pass.

The owner requested an Admin Ledger redesign before financial records scale to many Drivers. A local
workspace redesign separates Overview, Driver balances, Rider payments, Bank payouts, Journal, and
Manual journal. Operational lists are searchable and paginated; journal entries and processor IDs
are collapsed by default. Admin tests pass 54/54; Admin typecheck, production build, and diff checks
pass. It needs owner commit/deployment and production UI verification.

Production review found the Driver balances table labeled Stripe capability as `Transfers` and did
not show transferred money. The local follow-up now derives and displays Pending, Collected,
Transferred to Stripe, and Amount owed per Driver, and renames the status column to Transfer
capability. It uses existing trips, paid payment attempts, immutable transfer records, and ledger
balances rather than storing duplicate totals.
Admin tests pass 54/54; Admin typecheck and diff checks pass. It needs owner commit/deployment and
production UI verification.

Pre-trip Rider Refunds V1 commit `b95cbc9` and migration
`20260813000300_pretrip_rider_refunds_v1.sql` are deployed. Rider and authorized Admin cancellation
use server-only Stripe refunds; ESH cancels only after Stripe accepts, marks the attempt refunded,
and posts a balanced prepayment/cash reversal. A database trigger blocks trip start while Stripe is
processing the refund. Completed/in-progress refunds and transferred earnings are deliberately
excluded. A
production $10.59 cancellation passed Stripe, Admin payment status, refund record, and ledger
verification, but the Rider card showed only `Cancelled` and the original fare. The local follow-up
loads the Rider-authorized refund record and permanently displays the refund amount and state on its
booking. Rider tests pass 4/4; Rider typecheck, production build, and `git diff --check` pass. The
existing Supabase realtime and Next ESLint-plugin build warnings remain non-blocking. Next: owner
commit/deploy and refresh that cancelled Rider trip.

The Rider-visible refund follow-up is deployed through commit `4bceb84` and the production $10.59
trip permanently shows its full refund. Rider Payments and Receipts V1 is now implemented locally:
the Payments tab reads existing Rider-RLS payment/refund records, associates finalized payments with
trip addresses, and requests Stripe-hosted receipts individually through an authenticated server
route. It requires no migration or new environment variable. Next: validate, owner commit/deploy,
and run `docs/operations/rider-payments-receipts-manual-test.md`. Rider tests pass 4/4; Rider
typecheck, production build, and `git diff --check` pass. The existing Supabase realtime dynamic
dependency and Next ESLint-plugin warnings remain non-blocking.

Production payment/refund history passed after commit `de62b55`, but **View Stripe receipt** appeared
to do nothing because its asynchronous popup-dependent launch was unreliable. The local follow-up
loads the authorized receipt first, then renders a normal new-tab link and sanitized payment-method
summary; retrieval errors remain visible. Next: validate, owner commit/deploy, and retry the current-
sandbox $10.59 receipt. Rider tests pass 4/4; Rider typecheck, production build, and `git diff
--check` pass. Existing Supabase realtime and Next ESLint-plugin warnings remain non-blocking.

Payment and Payout Notifications V1 is implemented locally on the durable notification outbox. It
adds independent Rider payment and Driver earnings email preferences; idempotent notifications for
payment, refund, earnings, transfer, and bank-payout state; minimal financial payloads; and Payments/
Earnings deep links. It introduces migration `20260813000400_payment_payout_notifications_v1.sql`
and requires Admin/Rider/Driver deployment plus database application. Next: validate all layers,
dry-run only the intended migration, then hand off the production manual test. Admin tests pass
57/57; Rider tests pass 4/4; Driver tests pass 9/9; Admin, Rider, Driver, and Supabase typechecks
pass; all three production builds pass; `git diff --check` passes; and the remote migration dry run
lists only `20260813000400_payment_payout_notifications_v1.sql`. Existing Supabase realtime and
Next ESLint-plugin warnings remain non-blocking.

The first production notification test booked successfully and sent the existing Driver offer email,
but Rider showed a false `Payment status could not be loaded` alongside the successful paid-trip
recovery message, and financial emails had not yet arrived. Repository evidence showed the Stripe
return parameters could retrigger recovery and the shared delivery cron ran only once daily. The
local fix consumes the return parameters before recovery, treats an already-booked trip as success,
and documents immediate delivery through Admin Notifications. A sub-daily Vercel cron was rejected
from the design because Hobby deployments permit only once-daily schedules. Next: validate and
deploy Rider, then deliver the already queued financial notifications from Admin.
Rider tests pass 4/4; Rider typecheck, production build, and `git diff --check` pass. Existing
Supabase realtime and Next ESLint-plugin warnings remain non-blocking.

Production retest still showed the safer recovery warning. The root sequencing issue is now
identified: Stripe-return recovery could run after authentication but before `tenantSlug` had been
selected, causing the service-area context call to fail with an empty tenant even though payment and
booking were valid. The local correction waits for session, Supabase, and tenant selection before
consuming the one-time Stripe return parameters.
Rider tests pass 4/4; Rider typecheck and production build pass after this final guard correction.

The Stripe-return guard is deployed through commit `ca77fef`. Financial notifications still require
Admin **Deliver queued** or the once-daily Hobby cron, which is too slow for transactional email.
Automatic Transactional Email Delivery V1 is now implemented locally without a migration. Trusted
Rider and Driver server routes request tenant-scoped Admin outbox delivery after authoritative
payment, refund, trip-completion earnings, transfer, and connected-account payout transitions.
Admin refunds invoke the delivery service directly. A Driver-authenticated server bridge handles
browser-initiated trip completion. The Admin endpoint accepts only a tenant ID and uses a shared,
server-only high-entropy credential; Resend secrets remain Admin-only. Requests are time-bounded and
best-effort, so delivery failure cannot reverse or falsely fail a financial operation. Durable
outbox retries, manual Admin delivery, and the daily cron remain recovery paths. Next: validate all
three apps, configure the shared delivery secret and Rider/Driver Admin URL, deploy Admin then Rider
and Driver, and run the automatic-delivery manual test.

Validation is complete: Admin tests pass 57/57, Rider tests pass 4/4, Driver tests pass 9/9; all
three typechecks and production builds pass; and `git diff --check` passes. The existing Supabase
Realtime dynamic-dependency and missing Next ESLint-plugin warnings remain non-blocking. No database
migration is introduced by this delivery follow-up.

Automatic Transactional Email Delivery V1 is committed at `97a4ae8`; the repository was clean when
Driver Earnings Statements V1 began. Statements are now implemented locally as a date-bounded
projection of the existing role-derived Driver wallet and bank-payout activity. They show locked
fares, earnings, platform fees, pending/collected/transferred totals, and separately reported paid
bank payouts; provide local CSV download and print output; and explicitly avoid unproven
transfer-to-payout allocation or tax-form claims. The pure calculation/export module has unit tests.
No migration or environment variable is required. Next: complete Driver validation, then owner
commit/deploy and run `docs/operations/driver-earnings-statements-manual-test.md`.

Driver Earnings Statements validation is complete: the Driver typecheck passes with incremental
output disabled for the restricted workspace, all 11 Driver tests pass (including 2 statement
calculation/export tests), the production build passes, and `git diff --check` passes. The existing
Supabase Realtime dynamic-dependency and missing Next ESLint-plugin warnings remain non-blocking.

The owner deployed Driver Earnings Statements V1 and reported the production manual test passed.
Date filtering, period totals, trip rows, separately reported bank payouts, CSV download, and print
output are therefore accepted as the current production checkpoint.

Transfer-to-Payout Reconciliation V1 is implemented locally. For automatic connected-account
payouts, the signature-verified Driver webhook queries Stripe balance transactions using the payout
filter and connected-account context, then a service-only RPC links only same-tenant, same-Driver,
same-currency successful ESH transfers. A tenant-RLS allocation table and payout-level matched,
unmatched, status, error, and reconciliation timestamps support Driver/Admin visibility. Manual
payouts are explicitly unsupported for automatic allocation; partial/unmatched results are exposed
rather than guessed. Replays replace derived links and audit only changed results. No additional
ledger posting is created. Migration `20260813000500_transfer_payout_reconciliation_v1.sql` and
client types are included. Next: validate, dry-run only that migration, then owner apply/deploy and
run `docs/operations/transfer-payout-reconciliation-manual-test.md`.

Validation is complete: Supabase, Driver, and Admin typechecks pass; Driver tests pass 12/12
(including the balance-transaction reference test); Admin tests pass 57/57; both production builds
pass; and `git diff --check` passes. The remote migration dry run lists only
`20260813000500_transfer_payout_reconciliation_v1.sql`. Existing Supabase Realtime and Next ESLint-
plugin warnings remain non-blocking.

The owner accepted Transfer-to-Payout Reconciliation V1 with live payout-event observation deferred
until Stripe creates the scheduled automatic payout. Commit `5522bea` is pushed and the repository
was clean when Manual Ledger Reversals V1 began.

Manual Ledger Reversals V1 is implemented locally. Authorized tenant finance managers can reverse
only `manual:*` journals through a new RPC and Admin Journal control. The database posts the exact
swapped entries, preserves both immutable transactions, stores an immutable one-to-one link with a
required reason and actor, returns the existing reversal on replay, and audits the correction.
Automated fare, payment, earnings, transfer, payout, refund, and booking-linked journals are rejected
because ledger-only reversal would contradict their domain state. Migration
`20260814000100_manual_ledger_reversals_v1.sql`, client types, architecture, and production test are
included. Next: validate, dry-run only that migration, then owner apply/deploy and manual test.

Validation is complete: Supabase and Admin typechecks pass, Admin tests pass 57/57, the Admin
production build passes, and `git diff --check` passes. The remote migration dry run lists only
`20260814000100_manual_ledger_reversals_v1.sql`. Existing Supabase Realtime and Next ESLint-plugin
warnings remain non-blocking.

The owner deployed Manual Ledger Reversals V1 at commit `5f18488`. The first production test exposed
a client-only post-success error: `postJournal` accessed React's `event.currentTarget` after awaiting
the database call, when it was null. The ledger posting itself likely succeeded. A local hotfix now
captures the form element before the await and resets that stable reference. Next: validate and
deploy the hotfix, refresh Journal before posting again, then continue the reversal test using the
single existing test journal if present.

The manual-journal reset hotfix is deployed through commit `afdae77`, and production verification of
Manual Ledger Reversals V1 passed. Two test journals remained immutable, each received exactly one
linked inverse with the required reason, and the entries displayed the correct swapped sides.

Completed-Trip Refund and Driver Recovery V1 is implemented locally. An authorized finance manager
can fully refund a paid completed trip. If its Driver earning was transferred but has not entered an
active or paid bank payout, Admin reverses that exact Stripe transfer first, persists a retry
checkpoint, then creates the full Rider refund. One database transaction posts the transfer recovery
when applicable, Driver-earning reversal, and Rider refund; updates payment, refund, transfer, and
booking state; and audits the recovery without rewriting original history. Stable processor
idempotency keys make retries safe. Rider history and the existing refund notification reuse the
durable refund record. Driver wallet/history retains the trip, labels the reversed earning, and
excludes it from active pending, collected, and transferred totals. Migration
`20260814000200_completed_trip_refund_recovery_v1.sql`, Admin recovery UI/API, Driver presentation,
client types, architecture, and production test are included. Next: complete validation, dry-run
only the intended migration, then owner apply/deploy and production manual test.

Validation is complete: Admin tests pass 57/57, Driver tests pass 13/13, Admin, Driver, and Supabase
typechecks pass, both production builds pass, and `git diff --check` passes. The existing Supabase
Realtime dynamic-dependency and missing Next ESLint-plugin warnings remain non-blocking. The remote
migration dry run lists only `20260814000200_completed_trip_refund_recovery_v1.sql`.

Completed-Trip Refund and Driver Recovery V1 is committed at `538f135`, and the remote database is
up to date through `20260814000200_completed_trip_refund_recovery_v1.sql`. Production manual-test
results have not yet been reported.

Rider Payment Disputes V1 is implemented locally. The existing signature-verified Rider Stripe
webhook accepts dispute created, updated, closed, funds-withdrawn, and funds-reinstated events. A
tenant/Rider-isolated dispute record supports multiple disputes per payment, stores bounded lifecycle
state and deadlines, and posts the disputed principal exactly once when Stripe withdraws funds and
the exact inverse if Stripe reinstates them. Admin has a searchable Disputes workspace and flags
successful Driver transfers for reviewed recovery; Rider Payments shows the dispute without changing
the underlying successful PaymentIntent state. V1 deliberately does not submit evidence, account for
Stripe fees unrelated to the dispute, or silently reverse Driver transfers. Migration
`20260814000300_rider_payment_disputes_v1.sql`, client types, architecture, webhook setup, unit tests,
and production test are included. Next: finish validation and dry-run only the intended migration.

Validation is complete: Rider tests pass 6/6, Admin tests pass 57/57, Rider, Admin, and Supabase
typechecks pass, both production builds pass, and `git diff --check` passes. The existing Supabase
Realtime dynamic-dependency and missing Next ESLint-plugin warnings remain non-blocking. The remote
migration dry run lists only `20260814000300_rider_payment_disputes_v1.sql`.

The first production dispute exposed a valid out-of-order webhook case. Stripe delivered
`charge.dispute.funds_withdrawn` before `checkout.session.completed`, so ESH could not yet resolve the
PaymentIntent and returned 400. A later automatic retry of `charge.dispute.created` succeeded, but
the initial implementation did not inspect that event's included balance transactions; Admin showed
the $104.04 dispute as not finalized/not withdrawn. A local recovery migration and webhook update now
process authoritative balance transactions from every dispute event, backfill the later booking,
and post the exact $119.04 Stripe withdrawal ($104.04 principal plus $15.00 dispute fee) once. After
deployment, resend the successful `charge.dispute.created` event to recover this production record.

Recovery validation is complete: Rider tests pass 6/6; Rider, Admin, and Supabase typechecks pass;
both production builds pass; and `git diff --check` passes. The existing Supabase Realtime and Next
ESLint-plugin warnings remain non-blocking. The remote dry run lists only
`20260814000400_dispute_event_order_recovery.sql`.

A fresh $48.36 dispute reproduced the failure: Stripe delivered dispute creation and withdrawal
before Checkout completion, and both returned 400 as expected at first, but an automatic retry after
Checkout also returned 400. Vercel confirmed correct routing and firewall allowance but exposed no
exception because the webhook catch block returned only its generic public error. A local diagnostic
follow-up now logs only the verified event type/object ID and sanitized error name, message, database
code, details, and hint. It never logs the signature, payload, payment credentials, or secrets and
keeps the public 400 response generic. Next: deploy Rider diagnostics and inspect one automatic retry.

The diagnostic is deployed through commit `b25be36`. No post-deployment Stripe retry has occurred,
so the sandbox dispute issue is explicitly deferred and does not block normal payments or bookings.
Rider Wallet and Credits V1 is now implemented locally. It adds immutable Rider subledger entries,
an aggregate wallet-credit liability, audited Admin credit issuance, role-derived Rider balance and
history, concurrency-safe quote reservations, wallet-only and split wallet/Stripe checkout,
prepayment application, pre-trip restoration, and conservative Driver transfer eligibility. It
introduces `20260814000500_rider_wallet_credits_v1.sql` and requires Supabase, Admin, and Rider
deployment, database application, and the production manual test. Validation is complete: Rider
tests pass 6/6, Admin tests pass 57/57, Rider/Admin/Supabase typechecks pass, both production builds
pass, and `git diff --check` passes. The remote migration dry run lists only
`20260814000500_rider_wallet_credits_v1.sql`. Existing Supabase Realtime and missing Next ESLint-
plugin warnings remain non-blocking.

Rider Wallet and Credits V1 is deployed through commit `53440af`; the owner reported its production
manual test passed. Recurring Rider Bookings V1 is now implemented locally. A tenant-local series
stores one verified route and two to 50 occurrence times without pre-creating bookings or charging
the series. Each occurrence receives a fresh current-price quote and uses the existing wallet/Stripe
payment flow before atomically becoming one normal scheduled booking. Riders can skip one unpaid
occurrence or cancel the remaining unpaid series; paid trips retain the existing individual refund
contract. Admin has read-only operational visibility. Migration
`20260815000100_recurring_rider_bookings_v1.sql`, client types, helper tests, architecture, and the
production test are included. Validation is complete: Rider tests pass 8/8, Admin tests pass 57/57,
Rider/Admin/Supabase typechecks pass, both production builds pass, and `git diff --check` passes.
The remote migration dry run lists only `20260815000100_recurring_rider_bookings_v1.sql`. Existing
Supabase Realtime and missing Next ESLint-plugin warnings remain non-blocking.

Recurring Rider Bookings V1 is deployed through commit `714fcf4`; the owner reported production
series creation, one paid scheduled occurrence, and later unpaid occurrences all display correctly.
Recurring Rider Autopay V2 is now implemented locally. Ordinary Stripe Checkout saves only reusable
Stripe references after explicit card consent. Riders separately enable autopay per active series.
The protected Rider cron prices each due occurrence at current rates, applies wallet credit first,
charges the saved method off-session, atomically creates one scheduled booking, and records bounded
retry or manual-recovery state. Rider and Admin visibility, action-required email, RLS, service-only
mutation, audit, client types, architecture, and the production manual test are included. Migration
`20260815000200_recurring_rider_autopay_v2.sql` requires owner application before the Rider/Admin
deployment. Validation is complete: Rider tests pass 8/8, Admin tests pass 59/59,
Rider/Admin/Supabase typechecks pass, both production builds pass, and `git diff --check` passes.
The remote migration dry run lists only `20260815000200_recurring_rider_autopay_v2.sql`. Existing
Supabase Realtime and missing Next ESLint-plugin warnings remain non-blocking.

Recurring Rider Autopay V2 is deployed through commit `038ec7a`, its migration is applied, and the
existing Rider production schedule detects the saved Stripe method and offers **Enable autopay**.
A local Rider UX follow-up now treats autopay as the primary path: enabled future occurrences show
**Autopay scheduled**, retain quiet **Pay early** and **Skip** recovery controls, hide payment
controls while processing, and promote **Price and pay** only after definitive failure or when
autopay is off. No migration or environment-variable change is required. Rider tests pass 8/8,
Rider typecheck and production build pass, and `git diff --check` passes; the known Supabase
Realtime and missing Next ESLint-plugin warnings remain non-blocking.

The recurring-autopay control hierarchy is deployed through commit `37fcd7d`; production shows
**Autopay scheduled**, **Pay early**, and **Skip** correctly. Web Push Notifications V1 is now
implemented locally. Rider and Driver explicitly subscribe each browser with one public VAPID key;
Admin holds the private key and supplements existing queued email events with privacy-safe push.
Tenant/profile-scoped subscriptions, independent delivery attempts, expired-endpoint cleanup,
service workers, portal controls, Admin delivery integration, client types, environment templates,
architecture, and the production test are included. Migration
`20260815000300_web_push_notifications_v1.sql` requires owner application before Admin/Rider/Driver
deployment. Validation is complete: Admin tests pass 61/61, Rider tests pass 8/8, Driver tests pass
13/13, all four typechecks and all three production builds pass, and `git diff --check` passes. The
remote migration dry run lists only `20260815000300_web_push_notifications_v1.sql`. Existing
Supabase Realtime and missing Next ESLint-plugin warnings remain non-blocking.

Web Push Notifications V1 is deployed through commit `6e34687`; the owner configured one VAPID
pair and reported Rider and Driver production testing passed. SMS Trip Notifications V1 is now
implemented locally with Twilio Verify ownership checks, explicit Rider/Driver consent and opt-out,
service-only tenant/profile subscriptions, independent idempotent attempts, privacy-safe urgent
copy, channel-specific Admin results, client types, environment templates, architecture, and a
production test. Migration `20260815000400_sms_trip_notifications_v1.sql` requires validation and
owner application before deploying Admin, Rider, and Driver.

SMS validation is complete: Admin tests pass 63/63, Rider tests pass 8/8, Driver tests pass 13/13;
Admin, Rider, Driver, and Supabase typechecks pass; all three production builds pass; and
`git diff --check` passes. The remote migration dry run lists only
`20260815000400_sms_trip_notifications_v1.sql`. Existing Supabase Realtime and missing Next
ESLint-plugin warnings remain non-blocking.

Production verification exposed that Rider SMS success/failure used the distant page-level banner.
The inline-feedback correction is deployed through commit `5ca506e`. The next verification request
reached Twilio but was rejected because the configured account is suspended with an unexplained
negative balance. Twilio billing ticket `#29018616` requests the transaction-level history. SMS
production testing is deferred until Twilio reactivates the account; email and Web Push remain
operational.

## Cleanup still required after testing

- Admin production deployments for the fare-reconciliation and trip-ending commits were failing
  during the Next build. The blocking lint error was `String(body.serviceType ?? "")` in
  `apps/admin/src/app/api/tenant-admin/vehicles/route.ts`; it is now type-safe and the local Admin
  production build passes. Owner must commit/push this correction and verify the Admin deployment
  reaches Ready before testing the Fare reconciliation workspace.
- Fare reconciliation initially remained empty because its completion trigger ran before the route-
  metrics completion trigger. Migration `20260821000100_order_trip_completion_metrics_v1.sql`
  recreates the triggers in deterministic route-metrics-then-reconciliation order. Owner must
  dry-run/apply it, deploy, and complete one new trip with live Driver location updates.
- Admin Fare reconciliation now lists every completed booking, including those without trusted
  telemetry. Those rows show the locked fare and `No trusted route metrics`/`Not captured` rather
  than disappearing; audited calculated fares and adjustments remain limited to reconciliation
  records created from trusted metrics. Owner must deploy this Admin-only UI change.
- Route metrics now also initialize when a booking enters `in_progress` from the Driver's currently
  shared coordinate, so location sharing enabled before dispatch cannot miss the first trip point.
  Migration `20260821000200_initialize_trip_route_metrics_v1.sql` requires owner dry-run/apply and
  deployment before the next telemetry test.
- iOS TestFlight authentication testing exposed that native sign-in still requested the HTTPS
  callback even though iOS Universal Links are not configured. The hosted Rider and Driver sign-in
  flows now use the existing native schemes `com.esh.rider://auth/callback` and
  `com.esh.driver://auth/callback`; Rider and Driver tests pass 11/11 and 16/16. This is a hosted
  web change, so the installed shells do not need rebuilding, but both custom callback URLs must
  be present in Supabase Auth redirect allow-list before retesting.
- Production validation then produced the first audited reconciliation row (`e53513ab`): a quoted
  2.1-mile/$12.88 trip had 27.4 miles of simulated telemetry and a calculated $85.54 fare, held at
  `pending_review` with a +$72.66 adjustment. The Admin rejected it as simulated GPS telemetry;
  no money moved. This confirms the end-to-end metrics → reconciliation → review gate, while
  implausible GPS-speed/jump validation remains a follow-up hardening item.
- Telemetry hardening is now implemented locally in migration
  `20260821000300_validate_route_metric_segments_v1.sql`. It records suspect segments when a GPS
  jump exceeds a generous 60 m/s bound plus accuracy, preserves the aggregate record for audit,
  and prevents suspect telemetry from populating actual route fare inputs. Supabase/Admin
  typechecks and diff checks pass; owner must dry-run/apply, commit/deploy, then retest with
  realistic movement.

### Fare reconciliation production checkpoint (2026-08-21)

This is the verified production path and should be used as the starting point for future work:

1. Admin deployment failures initially hid the feature. The blocking error was the Admin vehicle
   PATCH handler using `String(body.serviceType ?? "")`, which violated the Admin ESLint
   `no-base-to-string` rule. Commit `b689824` corrected the validation and made the Admin build
   pass.
2. Commit `534abcf` deployed the trigger-order migration
   `20260821000100_order_trip_completion_metrics_v1.sql`. It recreates completion triggers so
   route metrics are materialized before fare reconciliation reads the booking.
3. Commit `ff062b0` changed Admin Ledger → Fare reconciliation to list every completed booking.
   Missing telemetry is shown as `No trusted route metrics`/`Not captured`, rather than hiding the
   completed trip. This is a web/Admin change; no mobile rebuild is needed.
4. Commit `347cc84` deployed
   `20260821000200_initialize_trip_route_metrics_v1.sql`. When a booking changes to `in_progress`,
   it seeds aggregate metrics from the Driver's currently shared coordinate. Later Driver location
   updates add bounded segments; no point history is retained.
5. Test booking `e53513ab` completed with simulated DevTools GPS. Admin displayed: quoted 2.1 mi,
   actual 27.4 mi, locked fare $12.88, calculated fare $85.54, adjustment +$72.66, status
   `pending_review`. This was intentionally rejected because the simulated GPS jumped
   unrealistically. The rejection created no refund or extra charge.

For a clean retest, apply the pending migration before booking, wait for the Admin deployment to
be Ready, enable Driver location before accepting, ensure the trip reaches `in_progress`, send
several realistic location updates, complete it, then refresh Admin → Ledger → Fare reconciliation.
Never approve a large adjustment produced by DevTools teleportation. Existing completed trips do
not get reconstructed if they had no stored telemetry.

- Cancel unfinished test bookings.
- Return test Drivers to Offline.
- Restore the tenant's intended scheduling settings.
- Re-enable Rider trip emails if disabled during preference testing.
- Confirm no test booking remains `requested`, `offered`, `accepted`, `arrived`, or `in_progress`.

## Exact next action

Owner stages and commits the parallel-interface correction, pushes `main`, then finishes the Vercel
project with Root Directory `apps/transportation`. Configure only the six entries in
`apps/transportation/.env.example`, set `NEXT_PUBLIC_ADMIN_SURFACE=transportation`, set
`TRANSPORTATION_BACKEND_URL` to the stable existing Admin project origin, attach
`transportation.eshapp.com`, add that origin to the Mapbox token restrictions, and add
`NEXT_PUBLIC_TRANSPORTATION_ADMIN_URL=https://transportation.eshapp.com` to the existing Admin
project. Deploy both applications and run
`docs/operations/transportation-admin-application-manual-test.md`. There is no Supabase migration.

Native release `1.0.1` remains operationally validated for Rider and Driver. Keep Android signing
credentials outside Git and independently backed up. Native APNs/FCM push remains unimplemented,
and production SMS verification must not be retried until Twilio resolves suspended-account ticket
`#29018616`.

## Required reading for recovery

- `AGENTS.md`
- `docs/roadmap.md`
- `docs/architecture/community-platform.md`
- `docs/architecture/community-platform-migration-plan.md`
- `docs/operations/community-authorization-foundation-manual-test.md`
- `docs/operations/community-places-organizations-trust-manual-test.md`
- `docs/architecture/scheduled-rider-bookings.md`
- `docs/architecture/rider-trip-notifications.md`
- `docs/architecture/verified-rider-booking.md`
- `docs/architecture/manual-dispatch-trip-core.md`
- `docs/architecture/automatic-driver-matching.md`
- `docs/architecture/realtime-driver-location.md`
- `docs/architecture/trip-reputation.md`
- `docs/architecture/mobile-app-shell.md`
- `docs/architecture/ledger-foundation.md`
- `docs/operations/ledger-foundation-manual-test.md`
- `docs/architecture/trip-pricing.md`
- `docs/operations/trip-pricing-manual-test.md`
- `docs/architecture/tenant-fare-policy-contract.md`
- `docs/operations/tenant-fare-policy-contract-manual-test.md`
- `docs/architecture/driver-earnings-wallet.md`
- `docs/operations/driver-earnings-wallet-manual-test.md`
- `docs/architecture/rider-payments-collection.md`
- `docs/operations/rider-payments-collection-manual-test.md`
- `docs/architecture/driver-connect-onboarding.md`
- `docs/operations/driver-connect-onboarding-manual-test.md`
- `docs/architecture/driver-transfers.md`
- `docs/operations/driver-transfers-manual-test.md`
- `docs/architecture/driver-payout-reconciliation.md`
- `docs/operations/driver-payout-reconciliation-manual-test.md`
- `docs/architecture/pretrip-rider-refunds.md`
- `docs/operations/pretrip-rider-refunds-manual-test.md`
- `docs/architecture/rider-payments-receipts.md`
- `docs/operations/rider-payments-receipts-manual-test.md`
- `docs/architecture/payment-payout-notifications.md`
- `docs/operations/payment-payout-notifications-manual-test.md`
- `docs/architecture/driver-earnings-statements.md`
- `docs/operations/driver-earnings-statements-manual-test.md`
- `docs/architecture/transfer-payout-reconciliation.md`
- `docs/operations/transfer-payout-reconciliation-manual-test.md`
- `docs/architecture/manual-ledger-reversals.md`
- `docs/operations/manual-ledger-reversals-manual-test.md`
- `docs/architecture/completed-trip-refund-recovery.md`
- `docs/operations/completed-trip-refund-recovery-manual-test.md`
- `docs/architecture/rider-payment-disputes.md`
- `docs/operations/rider-payment-disputes-manual-test.md`
- `docs/architecture/rider-wallet-credits.md`
- `docs/operations/rider-wallet-credits-manual-test.md`
- `docs/architecture/recurring-rider-bookings.md`
- `docs/operations/recurring-rider-bookings-manual-test.md`
- `docs/architecture/recurring-rider-autopay.md`
- `docs/operations/recurring-rider-autopay-manual-test.md`
- `docs/architecture/web-push-notifications.md`
- `docs/operations/web-push-notifications-manual-test.md`
- `docs/architecture/sms-trip-notifications.md`
- `docs/operations/sms-trip-notifications-manual-test.md`
