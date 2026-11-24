# Session Handoff

Last updated: 2026-11-24

## Current objective and checkpoint

### Current direction — school-specific planning constraints (2026-11-24)

Owner clarified that the real issue is fixed constraints; different schools need different rules.
GO authorized correcting the policy model before pushing the guided screens. Local v2 policies now
configure optional base/equipment qualifications, minimum route attendants, loading procedure and
whole-term versus per-service-date review coverage. This is a bounded structured policy, not a
generic executable rules engine. Dedicated student accommodations, actual capacity/attendant seats,
valid evidence for service, tenant/reviewer admission, immutable history and reservations remain.

Legacy policy JSON/versions retain their original interpretation. Converting a legacy review to
school-specific settings requires explicit opt-in plus new review/reason. Existing v2 settings cannot
be silently stripped by an older client. Save and public RPC signatures stay compatible; policy JSON
contains the new fields. No existing records rewritten, Auth/env/roles/RLS or operational flags changed.

Owner confirmed intended-only dry-run and successful remote application of
20261122000100_student_school_policy_rules.sql (Finished supabase db push). Do not reapply it.
Application commit/push/deployment remains pending. It replaces policy save/snapshot/daily generation logic, with a private
date-scoped snapshot helper denied to PUBLIC/anon/authenticated/service_role. Whole-term behavior
remains for legacy/default policies. Per-date policies check the next upcoming included school day
for planning and every generated manifest date separately; an uncovered date rolls the batch back.
New evidence versions require explicit schedule revision, road preview and reapproval. No daily
manifest may bypass expiry or silently adopt a newer review. Student transport remains unavailable.

The guided-layout work below remains included; its earlier no-migration statement concerns layout
only and is superseded for the combined release. The migration prerequisite is now satisfied.

Owner GO after the three-stage design authorized runtime implementation. Original ESH repo,
not independent eFare. Local primary flow: select Source geographic request -> Plan this request:
1 Review request, 2 Review stops, 3 Schedule/resources. Do not send the owner back through the old
record-assembly setup or recreate saved policy/resources/students. No new migration or environment
variables, Git mutations, production deployment or live DB writes performed by Codex.

GuidedRoutePlanner reuses same-school student reviews as suggestions only; school reference and
requirements require explicit confirmation for each request entry and exact revision. Duplicate
identity binding blocks progress. Missing students review inline, with actual school reference,
authority and requirements attestation retained. Exact customer/request/stop-bound point reviews
are reused; missing point review opens at that stop, with source locked and generated reference.
Dates/site evidence/coordinates and actual human approval remain required. Inline write failure
preserves inputs; same-key retry reloads records and binds returned ID/revision. Step2 reuses the
proposed intake-road map; it does not certify reviewed geometry/site safety.

Schedule fields retain entries on Back. Confirmed student/point links carry forward automatically;
internal schedule reference and initial audit reason are generated. Sole term-covering policy,
capacity-compatible vehicle and qualified Driver are suggested; attendant suggestion requires an
exact eligible count. All suggestions remain subject to authoritative server checks. Draft save
selects the result in the existing preview/approval section. Planning only; no release/dispatch.
Advanced policy/resource setup, record revisions/history, schedule revisions and manifest actions
remain available. Full refresh/source change clears unsaved choices; no browser child-data cache.

Files: new SchoolPolicyFields.tsx, shared PlanningTextField.tsx, school-policy.test.ts,
student-school-policy-sql-cases.cjs and the new SQL migration; planning.ts/policy validation changes.
Also included: new GuidedRoutePlanner.tsx; guided-planning.ts and tests; changes to PlanningWorkspace,
PlanningScheduleEditor and PlanningRecordEditor, Student styles, durable student-planning-browser-check.cjs;
architecture/student-recurring-planning.md and operations/student-recurring-planning-manual-test.md.
Local lint/typecheck and27 unit tests PASS. Original guided env-free enabled/default-off builds,
full browser regression including guided saves/retries/layout and actual isolated SQL regression
PASS (no provider/live traffic). Final-tree production builds/browser/SQL checks PASS, plus the
three-student/four-stop case: exactly one source-bound review reused, three missing stops shown,
and source change clears identity confirmations. Narrow layouts and schedule screenshot inspected.
School-specific actual SQL tests PASS: optional qualifications, school isolation, route monitors/
seats, dedicated needs, legacy behavior, daily expiry, atomic manifests, immutable snapshots and
renewed-version binding. Final combined enabled/default-off production builds, full browser checks
(including a reviewed policy with no extra qualifications) and actual SQL integration PASS. No
production dry-run/push was run by Codex. Narrow layouts and existing native role/stop controls pass.
Existing Supabase realtime/Next ESLint build warnings only.
Ignored local runner/evidence: tmp/student-policy-diagnostics; no secrets/populated env copied.

Release: main/origin remain fc7e339 pending owner commit/push. Preserve unrelated Admin/VPS/local
config edits, untracked scripts, snippets and stash. Owner performs explicit per-file staging and
GitHub-triggered deployment. NEXT explicit per-file Git release for the combined guided flow and
school-specific policies, then verify Student Vercel Ready at the new commit and perform ONE
guided acceptance of the existing December request. No further database push is needed for this release.
Actual RETESTING stop binding and real saved-resource qualification compatibility remain unverified;
do not claim hosted schedule approval or manifest acceptance. Sign-in email product branding is a
separate requested follow-up, not implemented here. See the new guided manual-test section.

Older manual-test notes below retain evidence and actual saved names, not instructions to repeat
their setup or continue the superseded manual record-assembly workflow.

### Active ESH Student Transportation checkpoint (2026-11-11)

CURRENT SCHEDULE DRAFT BLOCKER (2026-11-19): after a full refresh, owner reopened December
request and Create recurring schedule. Suggested TEST term2026-12-14..18,07:00..08:00,
America/New_York,10min buffer,Mon–Fri; actual entered time/term values not independently confirmed.
Current UI shows AA mapped to TESTING FORM PROXIMITY — TEST STUDENT AA with Wheelchair lift.
BB/CC mappings/confirmations not shown in the latest excerpt; don't assume missing or complete.
Current route order is BB,CC,AA,School (AA was moved; no user blame or required reset).
All FOUR loading-point dropdowns show Select reviewed loading point. Qualification policy,
vehicle and Driver are Not selected; attendant checkbox state unknown. Change reason entered
RECURRING TEST REASON. Browser says select item in list; no successful schedule save reported.
Actual register shows ONLY ONE point, RETESTING revision1 active, plus three student records,
three resources and TESTING TODAY policy. Earlier instructions for all four point reviews were
not evidence of completion. Do not claim four points saved or ask owner to recreate existing
records. NEXT open Stop3: TEST STUDENT AA loading-point dropdown and inspect available option;
determine whether RETESTING belongs to that source stop before selecting or creating other points.
Dropdown filters by exact source request and stop index. Keep unsaved draft; do not refresh or
restart. Full three-student schedule needs all reviewed student/point mappings before draft save;
resources must satisfy policy/capacity/term before planning approval. Operations remain closed.

LOADING POINT1 SAVE CHECKPOINT (2026-11-17): owner opened Student1 home loading review and
reports reviewed/saved without error after TEST-only fixture instructions. Exact saved entity,
reference/revision/coordinates not separately inspected. Do not recreate that point or repeat
the same form test. NEXT enter remaining Student2 home, Student3 home and shared school loading
reviews as one setup batch; select Source stop FIRST so default coordinates/fields follow the
chosen stop. TEST-only labels/evidence, policy-compatible validity through2027-06-06, geocoded
coordinates retained only for software testing, not claimed physically verified/safe. Then
recurring schedule draft with explicit student/point/policy/resource mappings; operations closed.

ALL THREE STUDENTS SAVE CONFIRMED (2026-11-17): owner clarified "I HAVE DONE ALL3 SAVED NO
ERROR". AA/BB/CC registration saves are owner-confirmed; earlier CC-unconfirmed notes are
superseded. Exact entity IDs/revisions/seating/requirements not separately inspected. Do not
repeat registration or create more identities. NEXT Review loading point for existing December
request: one home stop per student plus shared school point, then recurring schedule planning.
Saved identity mappings must still be explicitly selected in schedule; no automatic match or
operational release implied. Preserve policy/resources/all student reviews.

REGISTRATION TEST STOP (2026-11-17): owner reports re-registering Student BB and considers
registration testing sufficient. Student AA had already saved successfully. Do not ask to
register/re-register BB or repeat the same form/save test. Exact BB entity/reference/revision
and possible prior records not inspected; preserve records and do not assume cleanup/deletion.
Student CC review remains unconfirmed, so full three-student schedule approval is not accepted.
NEXT move to Review loading point for the existing December request, as a separate test step.
Remaining required identity mappings must be satisfied before any later full-route approval;
do not invent CC review or weaken guards merely to finish the test. Operations remain closed.

STUDENT1 SAVE CHECKPOINT (2026-11-17): owner reports reviewing Student1, making changes and
saving without error. Exact canonical reference/name/requirements/seating/revision not supplied;
do not invent values or claim full identity/compliance approval. Do not recreate Student1.
NEXT existing December request -> Register student2 identity for TEST STUDENT BB; its requested
Booster seat requirement must remain. Then Student3, loading points and recurring planning.
Git HEAD fc7e339 contains the inline-layout change; hosted deployment SHA/Ready not separately
captured. Prior saved policy/resources remain, no operations or manifest release accepted.

CURRENT UX REQUEST (2026-11-17): after selecting December request, owner opened Register student1
identity (canonical TEST STUDENT AA) and requested it open immediately below Student1, rather
than below all students. Local PlanningWorkspace change reuses the exact keyed record editor,
renders NEW student editors inside only the selected request-student card, and leaves other
editors/existing canonical revisions in their existing location. Expanded/controls accessibility
attributes added to each registration button. No save/role/Auth/SQL/migration change.
Three-student browser regression PASS: selected-card placement, correct prefilled name, exactly
one editor, no unsaved reference crossing students, cancellation/source-change clearing and
320/414/desktop layout. Before-fix placement test failed as expected. Opening registration also
clears the previous action's message so an unsaved form does not display an earlier success.
Full planning browser/SQL regression, actual isolated SQL policy save/retry/revision, Student
lint/typecheck, enabled/default-off production builds and formatting/diff checks PASS. Visually
inspected tmp/student-planning-evidence/inline-student-1.png: form directly under student's button.
Existing nonfatal Supabase/Next build warnings remain. No production/Git/deployment changes.
Ready for owner scoped4-file release: PlanningWorkspace.tsx, student-planning-browser-check.cjs,
student-recurring-planning architecture and manual test. Preserve unrelated/mixed local work.
Live page still has the Student1 form in its old location, not yet saved; all3resources and policy
confirmed in actual register: ATTENDANT RESOURCE ONE / DRIVER RESOURCE TEST / TEST ACCESSIBLE VAN /
TESTING TODAY, each revision1 active. These actual names override earlier suggested defaults.
NEXT owner scoped release, then reopen existing December request and register Student1 inline;
then remaining identity/loading-point/schedule acceptance. No operational transport release.

ATTENDANT SAVE CHECKPOINT (2026-11-17): owner reports dedicated TEST attendant saved without
error after the supplied TEST ATTENDANT01 / TEST SCHOOL ATTENDANT instructions, dates
2026-11-17 through2027-06-06 and actual policy names test attendant today / wheelchari lift /
test today. Actual register revision/reload not separately supplied. Vehicle, Driver and attendant
save actions now owner-reported successful; do not recreate them. NEXT existing December request
-> Register student1 identity for TEST STUDENT AA, then review canonical identity/authority/
requirements/seating (synthetic only). Do not assume canonical students or loading points already
reviewed. No schedule approval, manifests, actual transport or parent access accepted yet.

CURRENT MANUAL ACCEPTANCE (2026-11-17): owner reports TEST Driver saved without error after
guidance for Driver role, TEST DRIVER01 / TEST SCHOOL DRIVER, simulated evidence, effective
2026-11-17 through2027-06-06, qualifications test driver today / test today / testoday with
matching simulated evidence/dates. Exact register entry and reload not separately supplied;
do not recreate this Driver. Policy TESTING TODAY persistence and prior vehicle save retained.
Git inspection: main/origin main align at f2d0356 (dropdown fix), following0d5957e (simplified UX);
no new Git mutation by Codex. Vercel Ready/source SHA and full role-toggle PASS not separately
captured, but owner progressed to no-error save. NEXT add synthetic dedicated Attendant with
actual policy qualifications test attendant today / wheelchari lift / test today, preserving
that actual policy spelling. Then continue canonical student/loading-point/schedule acceptance.
Do not repeat onboarding, policy/vehicle/Driver creation or database migrations. Operations closed.

RESOLVED LOCAL RESOURCE ROLE BUG (2026-11-14): owner repeatedly reports new-resource role cannot change
from Vehicle; earlier Codex assumption of editing a locked saved Vehicle was incorrect for the
reproduced case. Local browser repro with actual click/Home/ArrowDown/Enter FAILED before fix:
expected Driver, actual Vehicle. Earlier selectOption-based browser tests missed this. Form-wide
policy validation was calling setIssues([]) on non-policy native input events; that rerender can
restore a controlled select before its change handler commits. Minimal local fix: update policy
validation state ONLY for kind=policy. Resource-role mouse/keyboard test now passes for Vehicle,
Driver and attendant; saved Vehicle edit stays locked; fresh Add resource clears old reference
and allows role change. Source-stop selection regression also added using actual dropdown events.
Student lint/typecheck, enabled/default-off production builds, full planning browser checks
(including actual source-stop selection) and geography/planning/enrollment SQL suites PASS.
Actual rendered-form -> isolated SQL policy save/retry/reload/revision also PASS. Test data and
server are isolated; no production calls/writes. Formatting/diff checks PASS; pre-existing
Supabase dynamic-dependency and Next ESLint-plugin warnings remain nonfatal. Source fix is
one conditional update line; scoped release is4 files (editor, browser regression, architecture,
manual test). Existing mixed roadmap/handoff and unrelated work remain unstaged.
No schema/Auth/role/provider/Git/deployment change. Owner's unsaved Driver attempt is not saved;
policy TESTING TODAY and previously reported vehicle save remain. Main is0d5957e (simplified UX).
NEXT owner scoped release of this verified bugfix before retrying role selection; no DB push.
Do not ask owner to repeat Cancel/Add again on the unfixed hosted version or blame their actions.

SAVED POLICY INSPECTED (2026-11-12): owner opened TESTING TODAY revision1 (inspection only,
no policy revision saved). Valid2026-09-09 through2027-06-06, source reference Testing today.
Actual displayed qualification names: Driver base="test driver today"; attendant base="test
attendant today"; lift Driver="test today", lift attendant="wheelchari lift" (preserve this
actual spelling); booster Driver="testoday", booster attendant="test today"; car-seat Driver=
"seat today", car-seat attendant="seat again today". Existing December request needs lift,
booster and dedicated attendant, not a car seat. Driver therefore needs three distinct reviewed
qualifications: test driver today / test today / testoday. Attendant later needs test attendant
today / wheelchari lift / test today. Do not invent or correct names without policy revision.
Policy editor currently open with blank change reason and unchecked review confirmation;
cancel it without saving. NEXT Add dedicated resource -> Driver using TEST-only evidence covering
the intended term (must fit policy dates ending2027-06-06). Vehicle save reported previously.

VEHICLE REVIEW CHECKPOINT (2026-11-12): owner opened Add dedicated resource and received
TEST VEHICLE01 / TEST ACCESSIBLE VAN instructions: synthetic evidence, valid2026-11-11 through
2027-06-30,3 passenger seats plus1 wheelchair position,1 booster,0 car seats, lift/securement and
dedicated-review confirmations. Actual entered fields not separately inspected. Owner accidentally
clicked Add credential while creating Vehicle; instructed Remove last credential because this
vehicle fixture needs no human qualification rows. Owner now reports REVIEW SAVED. Treat save
as owner-reported successful; exact resource register entry/revision and reload not captured.
Do not recreate vehicle or policy. NEXT inspect actual saved TESTING TODAY policy qualification
names before adding Driver/attendant. Prior suggested values are not proof of saved names; owner
had entered their own case/spaced text. Use Revise or revoke review only to inspect, copy required
names, then Cancel review without saving an unnecessary revision. No operational activation.

LIVE POLICY SAVE PASS: owner reports pushing the simplified qualification UX (new commit SHA
and Vercel Ready not separately captured). Hosted browser shows save_student_planning_record200
followed by my_student_planning200. Owner confirms Reviewed record register displays
"policy: TESTING TODAY · revision 1 · active". This actual reference supersedes suggested
TEST POLICY NOV11 B; do not create another policy or ask to repeat data entry. Dedicated
resources/student/loading-point/schedule review and approval/manifests are not yet accepted.
PERSISTENCE PASS: owner used Ctrl+Shift+R (full browser reload), reopened planning and confirms
"policy: TESTING TODAY · revision 1 · active" remains. No policy re-entry/recreation needed.
NEXT resume dedicated planning resource setup for the existing December TEST request, one step
at a time: Add dedicated resource, start with a synthetic dedicated vehicle, then qualified Driver
and attendant records matching the actual saved policy requirements. Exact saved qualification
names have not yet been supplied; inspect/reuse them rather than guessing when entering people.
Student operations remain closed. Actual production failure is resolved for this policy save;
do not infer the original exact error cause or wider operations acceptance.

OWNER UX CORRECTION: a472b42's repeated formatting warnings were rejected. Owner explicitly
requires natural typing and app-managed formatting, plus a complete recheck BEFORE another push.
Local follow-up now asks for qualification names, not credential keys, and preserves typed text
including capitalization on blur. Internal matching identifiers are generated only for validation/
submission; never tell owner to invent driver_today or manually format lowercase/underscores.
Policy and resource qualifications use the same mapping. Quotes/backticks, case/accents and word
separators handled automatically; numeric/single-letter names get an internal prefix. Existing
valid identifiers preserved. Saved names show readable spaces only when re-saving preserves the
exact original identifier. No truncation, qualification grants or unrelated text normalization.
Only ONE short unmet-check message beside Save. Required review/date/evidence and SQL rules intact.
20 unit checks, Student lint/typecheck, enabled production build and full planning browser
regression PASS, including matching policy/resource qualifications, invalid submit denial, same-key
retry, compact feedback and320/414/desktop. Additional actual-browser-to-migration-SQL integration
PASS using owner-style eight mixed-case/spaced entries and dates: save, aborted-network draft
preservation, same-key retry produces one row, refresh/reopen, then revision2 preserves original
identifiers and immutable reference. SQL suites including geography/enrollment/authorization and
closed operations PASS. This integration bridges intercepted transport to actual isolated PGlite
SQL (minimal legacy schema), not production PostgREST/auth/concurrency certification. Test adapter
fixture/query/role-cleanup bugs were corrected; they were not app or production causes.
Screenshot tmp/student-policy-diagnostics/natural-policy-form.png visually inspected: normal
capitalized input, no formatting list, enabled Save. Default-off production build and all21
closed-shell screen/viewport checks PASS, with no external requests or browser errors.
Formatting/diff checks PASS; existing nonfatal build warnings unchanged. No new Git action.
Follow-up release consists of six scoped files: PlanningRecordEditor.tsx, policy-review-validation.ts
and its test, student-planning-browser-check.cjs, recurring-planning architecture and manual test.
Do not stage unrelated existing Admin/config/docs work. All scoped verification is complete.
NEXT owner scoped commit/push, confirm Student Ready at new SHA, retry same TEST policy with ordinary
typing. No database push. Actual hosted policy-save failure remains unproven until live acceptance.
Owner actual form/date/review state preserved on live a472b42; do not instruct more re-entry until
follow-up verified and released. Earlier strict-format checklist below is superseded by this UX.

OWNER RELEASE CONFIRMED: owner staged exactly seven scoped files, committed defensive policy
validation as a472b42 and supplied successful push main3eb3766..a472b42 to ishmaelnow/esh-platform.
No database migration needed. Owner supplied esh-platform-student-transportation Ready/Production
at a472b42 (56s); ordinary transport-platform-admin also Ready from the same monorepo push.
NEXT owner reloads /admin,
ESH Education -> existing December TEST request -> policy form and tests disabled/valid Save.
Preserve any unsaved draft before reloading. Actual policy persistence remains unaccepted.

LATEST IMPLEMENTATION: owner explicitly requested defensive checks disabling Save. Implemented
qualification-policy client validation in PlanningRecordEditor with policy-review-validation.ts:
required references/reason, real ordered dates, base key lists, review confirmation, and all
supplied equipment/base key formats/counts matching SQL. Save disabled until valid; accessible
checklist beside Save explains blockers. Submit also revalidates; existing disabled immutable
reference respected for revisions. Optional equipment lists remain optional at policy-save stage.
PlanningWorkspace passes existing message beside Save so server/network failures remain visible.
No schema/Auth/role/provider/data changes or new submit payload/retry contract. Student-specific
sign-in email requirement remains pending and is not included in this UI patch.
Focused18 unit checks, Student lint/typecheck, enabled/default-off production builds and full
planning browser regression passed locally in isolated env-free synthetic snapshots. Browser
checks cover disabled/enabled transitions, malformed base/equipment keys, reversed dates, blank
reason/review checkbox, no invalid-save RPCs (including programmatic submission), visible
save-adjacent network error, retained draft and unchanged same-key retry; ordinary planning
lifecycle and320/414/desktop checks passed. Windows sandbox denied Vitest bundler parent traversal;
approved escalated focused runs passed. Existing Supabase dynamic-dependency and Next ESLint-plugin
build warnings remain nonfatal. Architecture/manual acceptance updated. No Git mutation/deployment;
source production remains3eb3766 until owner performs scoped GitHub release. Actual hosted save
failure cause unconfirmed. NEXT: owner release bounded policy guard and resume existing December
TEST request policy acceptance; no setup repeats or database push needed. Earlier recommendations
below describe the pre-fix diagnostic checkpoint, not more required implementation.

Owner explicitly returned to ESH Student Transportation in this workspace. eFare is a separate
repository and is not the current task. Resume internal recurring-planning manual acceptance;
do not repeat migrations, geographic intake, staff consolidation, tenant admission or rollback.
Owner now confirms https://school.eshapp.com/admin loads successfully signed in as
ishmaelkosh@gmail.com, with ESH Education selected and Requests and planning / Enrollment /
Administration visible. Previous401/PGRST303 is not reproduced in this check; its technical
resolution is unknown. Staff-context access is accepted, not yet policy-save or full planning.
Next owner action: in Requests and planning, locate the existing submitted December TEST request,
then Open route planning and select it as Source geographic request. Do not create a duplicate.
If the existing request is absent or withdrawn, inspect actual state before deciding a substitute.
Qualification-policy save remains unconfirmed; resume there after selecting the existing request.

Latest owner test: December source request present/submitted, planning opened and selected;
qualification-policy form submitted but remains open, reviewed register empty. Owner captured
"Planning could not be completed. Check your access and entries, then refresh before retrying."
Policy persistence is NOT accepted. Provided TEST_POLICY_20261111 values and2026-11-11 through
2027-06-30 dates; actual entered credential values and actual server response remain uncollected.
Reason text showed backticks, which by itself does not establish a credential validation error.
Owner struggled with DevTools and explicitly asked Codex to test; stop repeated owner Network loops.
Codex isolated browser testing (2026-11-11), disposable env-free source snapshot/dummy backend,
passed valid save/refresh and same-key network retry; reproduced rejected credential keys leaving
form open with generic error above viewport at Save. Blank required driverKeys prevents browser
submission entirely (no Network row). API errors in browser are intercepted fixtures, not captured
production responses. Actual migration SQL in isolated PGlite also passes the exact recommended
test policy and rejects backticks in base/equipment credential keys with specific messages.
Existing geography/planning/enrollment SQL regressions pass. Evidence:
tmp/student-policy-diagnostics/invalid-policy-mobile.png (visually inspected), browser.cjs,
harness.cjs and policy-sql-cases.cjs; all ignored local synthetic diagnostics. Browser harness
needed a wait for editor removal after async refresh; corrected diagnostic race, no app edit.
Test server stopped; no production data/email/provider/Git mutation. Root cause of actual hosted
failure remains unproven. Recommended next bounded correction: explicit credential-key validation
and visible useful error beside Save, preserving draft/retry safety, grants and immutable history.

Owner requirement: sign-in emails must clearly identify ESH Student Transportation / school
access, rather than generic ESH, because several products share the platform. Record as pending
mail identity/subject/body review, not a completed implementation. Inspect actual delivery/template
scope before any change: do not modify shared Supabase Auth branding for other products blindly.
No email/template/provider change made or new sign-in email sent by Codex in this checkpoint.
Keep Student operations planning-only. Existing uncommitted work/stash and live ESH products remain.
The eFare transfer direction below is historical and does not override this resumed Student task.

### Current owner direction — finish hosting, stop expanding scope

INDEPENDENT PROJECT DECISION (2026-10-28): owner explicitly clarified parallel means independent
of ESH, then authorized preparation. Use a NEW private GitHub repository and separate Vercel
projects, not additional deployments connected to the ESH repository. Vercel frontends + existing
OVH self-hosted Supabase + efareride.com remain selected. Preserve ESH Git, live projects and data.
TRANSFER CONFIRMED: owner successfully copied source to C:\Users\koshi\efare-platform. Codex
installed fresh independent docs/session-handoff.md, docs/roadmap.md and adapted AGENTS.md there;
file hashes verified and source-copy manifest updated preserving original copy hashes. Continue
in that workspace, not this ESH repository. New private GitHub repo creation/URL remains unconfirmed.
Do not repeat the folder copy. The eFare handoff now holds the active hosting checkpoint.
Prepared source-only copy at .cache/efare-independent-20261028: 1,184 copied files, all seven web
apps/shared packages and153 migrations, including current working-tree fixes. No .git/remotes,
populated envs, provider project links, dependencies/caches/backups or owner Studio snippets copied.
In COPY ONLY: root package name/local Supabase project_id efare-platform; internal package scopes
preserved; apps/packages eshapp.com references changed to efareride.com; Vercel crons removed;
production Driver E2E workflow moved outside active workflows. Ordinary CI retained. Source hashes
verified; high-confidence credential-pattern scan passed (not exhaustive). Native IDs unchanged:
no native release authorized; documentation explicitly marks native/provider setup pending.
INDEPENDENT-PROJECT.md and SOURCE-COPY-MANIFEST.json explain boundaries and provenance.
No Git initialization, repository creation, frontend deployment or source ESH app edit performed.
Next owner step: copy this prepared folder to C:\Users\koshi\efare-platform with an existence
guard; then owner creates new private GitHub repo and performs reviewed Git initialization/push.
Never push ESH main to publish eFare. Older same-repository deployment advice is superseded.

HTTPS CHECKPOINT (2026-10-28): owner opened UFW TCP80/443 (SSH22 retained), created
compose.esh-https.yml with only caddy.environment.PROXY_DOMAIN=api.efareride.com, and validated
Compose order: base, docker-compose.caddy.yml, compose.esh-private.yml, compose.esh-https.yml.
Gateway8000, Mailpit8025 and pooler5432/6543 remain bound127.0.0.1; Caddy publishes80/443.
Owner started only caddy using up -d --no-deps caddy; image caddy:2 pulled and certificate/config
volumes created. HTTPS curl validates certificate: Auth health without apikey401, with existing
ANON_KEY privately piped from .env200. Public Studio root without credentials401 as intended.
These supersede older statements that no HTTPS/proxy was applied. User login/Data API over
public HTTPS are not yet verified. Auth external/site/redirect URLs have not been changed.
Next: separate Vercel Platform project from the NEW independent repo, no edits to live projects. Existing
local3010/3014 tests and backend synthetic data remain; public frontend deployment still pending.

NEW DOMAIN DECISION: owner provided efareride.com, registered through Netlify, dashboard shows
no DNS records. Use this domain exclusively for parallel setup; do NOT ask owner to create
vps-api.eshapp.com. Existing eshapp.com apps/DNS/Vercel envs/hosted Supabase remain untouched.
First proposed record: A api ->40.160.152.133, TTL default in efareride.com Netlify DNS.
No record creation confirmed yet. Backend https://api.efareride.com after DNS+HTTPS setup;
frontend origins/deployment projects remain to be prepared separately using same repo/source.
New domain is environment branding/isolation, not authorization for a new product or rewrite.

HOSTING DECISION (2026-10-27): owner explicitly accepted the recommendation: Vercel hosts the
parallel frontend apps; the OVH VPS hosts self-managed Supabase. Use separate Vercel projects
and efareride.com hostnames, preserving GitHub deployment workflow and all live eshapp.com
projects/settings. Do not repoint existing projects. This supersedes earlier undecided/VPS-only
statements. Owner executes server, Git and deployment commands. Next: inspect the existing pinned
Caddy configuration without secrets, prepare HTTPS for api.efareride.com, then configure separate
frontend projects and exact Auth callback origins. No HTTPS or frontend deployment applied yet.
Owner saved Netlify A api.efareride.com ->40.160.152.133, TTL3600. Public/default and authoritative
DNS lookups both confirmed40.160.152.133. Next scoped action is HTTPS API on working VPS,
before configuring the separate Vercel frontend projects. No proxy/deployment changes performed yet.

EXPLICIT OWNER BOUNDARY: keep every live app unchanged. Treat VPS-backed apps as a separate
environment until owner decides they are ready. Use distinct app/backend hostnames and isolated
deployment configuration (separate Vercel project or explicitly isolated deployment), same
existing source architecture. This does not authorize a new product or frontend rewrite.
Do not edit live Vercel environment variables, production app DNS, hosted Supabase data/keys,
or production GitHub deployment settings. No production cutover/live data migration authorized.
Public DNS lookup established Netlify DNS: dns1-4.p04.nsone.net and SOA contact
domains+netlify.netlify.com. Official Netlify docs confirm its nsone name-server convention.
No need to ask owner to discover DNS provider again. vps-api.eshapp.com A/CNAME lookups returned
no records. Proposed separate backend hostname vps-api.eshapp.com ->40.160.152.133, new A record
only. NEXT owner in Netlify team DNS ->eshapp.com adds that record, TTL default; do not change
nameservers/apex/live app records. No DNS record written by Codex; no DNS connector available.
Then Codex verifies public resolution before server HTTPS configuration. No new app frontend
project or Auth callback choice finalized yet. Preserve existing live Vercel settings.

LATEST OWNER CORRECTION: this was meant to be straightforward hosting/migration, not an
end-to-end product certification project. Owner asks finish now. Supersedes the journey-test
and Community NEXT actions below. No new features, wallet test credit, onboarding project or
duplicate disaster-recovery retry should be started. Keep GitHub -> Vercel frontend workflow.
Working VPS is a parallel backend with synthetic data, not a replacement containing live users.
Never repoint Production Vercel envs to this test database or claim live data migrated.

Remaining hosting boundary: public HTTPS backend via domain/DNS + proxy, Auth external URLs/
callback settings for chosen app origins, then deliberate app environment/deployment smoke
checks. Public hostname/DNS access not known. No relevant DNS/Vercel/GitHub connector available;
owner remains executor for server/deploy/Git changes. Async question sent: where DNS for
eshapp.com is managed. Await actual answer before provider-specific DNS instructions; no
password/key needed. Supabase pinned source includes docker-compose.caddy.yml and proxy config;
official HTTPS guidance checked. Do not install a parallel stack or rotate existing keys.
No DNS, firewall, proxy, app env or production changes made in this turn. Backend currently
loopback-only, Auth mail captured in Mailpit. Existing tested frontend apps still run on owner's
computer; they are not hosted on VPS. Need explicit distinction between parallel hosting finish
and any later live-data cutover. Reviewable finite hosting runbook is next artifact.

### Superseded product-acceptance direction (retain evidence, not current tasks)

Owner exhausted by repeated manual recovery commands. Owner accepted setting the unfinished
full-stack duplicate rehearsal aside and explicitly approved repository review + one product
checklist. Then owner corrected proposed switch to Community: FINISH TRANSPORTATION end-to-end
before expanding. Owner GO authorized dependency audit/shortest coherent journey plan. This
supersedes lower NEXT Community/duplicate-preparation/retry actions. Do not ask owner to
repeat backup checks or retry duplicate-stack scripts. Preserve failed candidate/test resources;
no deletion/reset or production change authorized.

Completed review: seven packages (admin,transportation,community-admin,community,student-
transportation,rider,driver). Generic workspace keys are transportation/community; Student has
separate program/staff/customer admission. Rider/Driver are Transportation interfaces, not
additional generic workspace roles. Existing accounts: admin@example.test (Platform),
owner@example.test (tenant owner + Transportation administrator). All other identities in new
checklist are proposed, not created/enrolled. Current listener status not rechecked; don't infer
runtime solely from earlier Ready output.

Canonical test register: docs/operations/vps-product-acceptance.md, with verified entry routes,
current3010/3014 launcher URLs, clearly reserved (not running)3011/3012/3013/3015/3016 ports,
per-product account/admission/dependency checks and bounded finish lines. Passed: Platform+
Transportation administration and representative settings/invitation/re-sign-in; other products
NOT verified. Student guardian/operator are closed foundations, not operational features.
Audit completed: docs/operations/vps-transportation-journey-test.md. Existing full-wallet checkout
supports one ride without Stripe; current unpaid booking path cannot skip payment/wallet gate.
Required next prep: isolated Rider3011/Driver3012 launchers (not present), same-VPS server-only
Supabase credentials, deliberately scoped Mapbox token/origins, account/admission workflows,
actual tenant capability/coverage/ledger/pricing/readiness inventory, compliant Driver/vehicle.
SMS/push/card/payout outside first wallet-funded test; Driver funding must remain honest/pending.
No provider secrets read/changed, apps launched, accounts created or financial credit issued by
audit. Documentation/source review only, no implementation tests needed. NEXT prepare whole
bounded setup before owner actions, not Community. No manual command needed for this audit.
Do not describe all ESH or full Transportation operations as VPS-accepted.

### OVHcloud self-hosted recovery environment — current checkpoint

Owner's separate VPS vps-c1bc4b11.vps.ovh.us / 40.160.152.133 is active:
Ubuntu 26.04, 4 vCPU, 8 GB RAM, 75 GB disk, Oregon. Order 9268733, monthly/no commitment.
Updates, reboot, official Docker installation and hello-world passed. UFW permits SSH22 only;
all four Docker published ports bind 127.0.0.1. Owner now verified OVH Standard automated backup
restore point listed for2026-10-26 at03:36 UTC, daily schedule03:36 UTC. No restore point mounted
and no restore performed. Earlier backup-option dashboard error is superseded. Listing a restore
point is not a tested ESH database restore or off-server logical backup.

Official Supabase self-hosted/v0.8.3 source is in ~/esh-supabase-source; isolated running
configuration is ~/esh-supabase-recovery (0700), .env0600 with freshly generated secrets.
Do not rerun key generators or expose .env. Explicit Compose project esh-recovery and files
docker-compose.yml + compose.esh-private.yml are required. Owner confirmed all12 services
Healthy, including PostgreSQL17.6.1.136, PostgREST14.18, Auth, Envoy and Studio.
Private published ports: gateway8000, session pooler5432, transaction pooler6543, Mailpit8025.
Mailpit captures Auth mail; application invitation delivery needs separate setup later.
Production, Windows ESH-local and FairFare remain unchanged.

Schema installation PASS, owner verified in VPS psql: migration_count153,
latest_migration20261017000100, tenants_table_exists=true. Owner copied153 SQL files into
.cache/esh-vps-recovery/supabase/migrations with minimal isolated config and explicit DB URL.
Interrupted SSH connection initially stopped the client around20260823000200; database history
recorded that migration. Subsequent reviewed dry run listed only20260823000300 onward; owner
applied remaining migrations successfully. Do not reset/reinstall/repeat completed migrations.
No production data copied. Synthetic VPS account/tenant workflow now passed as detailed below.

CLI2.109.1 recovery connection required PGSSLMODE=disable plus percent-encoded password inside
explicit URL to postgres.your-tenant-id@127.0.0.1:55432/postgres. Separate password environment
and flag attempts failed; do not repeat them. File/container passwords compared equal and
container psql direct DB and pooler authentication both passed. Password fetched privately
through SSH into memory; temporary URL/password cleared in finally. Never print either.
Windows loopback55432 forwards VPS5432. SSH resets have repeatedly dropped tunnels; use
keepalives and never assume an old tunnel or per-window PowerShell variable still exists.
Owner strongly requests fewer windows, self-contained commands, exact shell/folder and an
explanation of every command. Avoid repeated checks/retries without new evidence.

Current objective: connect one isolated Platform app to VPS, then synthetic sign-in and tenant
provisioning/invitation acceptance. Owner re-established combined tunnel8000/8025/55432 with
keepalives and confirmed Studio Default Project loads again. Keep this one tunnel window open.
Existing local-platform.cjs remains hard-locked to Windows ESH-local; it was not repointed.
New owner-run tooling/scripts/recovery-platform.cjs uses Platform3010, invitation bridge58128,
VPS API8000/Mailpit8025, isolated ignored source snapshot and fresh SSH retrieval of only ANON_KEY.
Checks anon role/expiry, Auth/mail endpoints; rejects privileged keys, inherited provider envs,
external invitation recipients and occupied app/bridge ports. No DB/grant/user mutations.
Shared development-only mail helper gains optional deliver callback; default SMTP remains same.
Four focused Node tests PASS (local mail regression, credential isolation, recovery mail capture/
rejection/failure, read-only endpoint preflight); syntax, Prettier and git diff --check PASS.
Owner acceptance PASS: admin@example.test created in VPS Studio, password sign-in, owner-run
recovery-platform-admin-bootstrap.sql applied (platform_admin active), /platform UI loads,
VPS RECOVERY TEST created through UI, invitation and confirmation captured in VPS Mailpit,
owner@example.test signup/confirmation and invitation acceptance, tenant active, Transportation
entitlement granted. Owner confirmed six enabled capabilities, driver/vehicle management enabled,
app.rider/app.driver disabled. Then /governance enabled Transportation workspace and explicitly
enrolled owner@example.test as Transportation administrator; owner supplied1 enrolled.
No Auth redirect config change verified; don't repeat signup/bootstrap/tenant/enrollment.
Correct routes: /platform=Platform admin, /governance=tenant owner, /=product selection.
Incorrect /admin advice produced404; do not give that URL for Platform governance again.

Owner GO authorized recovery Transportation launch. Extended same recovery-platform.cjs to
start Platform3010 + Transportation3014 in one app window (no extra terminal). Platform's entry
URL now3014; product shell tenant-admin API rewrite explicitly targets recovery Platform3010,
both use VPS API8000. Separate snapshots for shell/shared source; original local launchers and
app envs unchanged. Transportation receives no provider/service credentials. Other products
remain unavailable local links. Ctrl+C stops both owned apps/capture adapter; existing tunnel
stays separately owned. Five focused Node tests PASS, Transportation snapshot tsc --noEmit PASS,
snapshot roots checked free of env files. No authenticated VPS access available to Codex.
Owner restarted combined launcher; both Ready. Platform3010 -> Transportation3014 required
separate owner sign-in. Dashboard acceptance PASS: active VPS RECOVERY TEST, owner@example.test,
active profile/membership, tenant_owner,1 membership,0 pending invitations,6 enabled capabilities
(app.admin, driver.management, tenant.audit, tenant.memberships, tenant.roles, vehicle.management).
Eight recent audit events shown, including workspace.member_enrolled, workspace.status_changed,
product_session.entered and superseded. Do not repeat provisioning/enrollment/sign-in setup.
This verifies representative recovery reads and product entry, not full dispatch/payment/native
operation or adversarial isolation. No production data/settings/cutover changed.
VPS Settings persistence acceptance PASS: owner confirmed original Branding reference blank,
entered VPS-PERSISTENCE-TEST, observed Settings saved, refreshed and confirmed value retained,
then cleared/saved/refreshed and reported clear. Original blank restored; no temporary setting
cleanup outstanding. This was through Transportation app/backend, not SQL seeding.
Fresh-session acceptance PASS: owner signed out from Transportation3014, saw the product sign-in
form, signed back in as owner@example.test, saw VPS RECOVERY TEST and re-entered its populated
dashboard. Access persists across sign-out/sign-in. No process/container restart was tested.
Representative self-hosted workflow through invitation, product entry, dashboard, fresh sign-in
and authorized save/reload/restore is owner-confirmed. No further DB mutation needed for this
completed check. Remaining recovery gaps include redirect configuration, verified backup/restore,
storage/functions and wider product tests before any cutover proposal.

HEADER INCIDENT RESOLVED: actual read-only VPS Studio query proved display_name contained
embedded page text (Exit Transportation / Active tenant / owner role); legal_name was correct.
Owner corrected only Display name through Transportation Settings to VPS RECOVERY TEST, saved/
refreshed and supplied clean header. Cause of the original bad write is not established; do not
claim a paste, browser bug or CSS failure as its origin. Two identical clean names are expected:
display name and legal name. No additional tenant cleanup or restart required for this incident.

Earlier Codex CSS diagnosis was premature. Separate uncommitted layout changes remain in shared
styles and HeaderBlock identity class: width constraints, wrapping and natural workspace rows.
Synthetic browser fixture reproduced long-label overflow and passed seven widths after these
changes, with typecheck/lint/format checks PASS, but this was NOT the cause/fix of the owner's
actual corrupted header. Script transportation-layout-check.cjs and screenshots under ignored
tmp/transportation-layout are synthetic evidence only. Do not present these changes as required
to resolve the saved-name incident or ask owner to restart to prove the already-resolved issue.
CURRENT OBJECTIVE: owner GO authorized private database backup and isolated restore rehearsal.
OVH restore point existence confirmed above; do not restore over the running VPS. Owner Studio
inventory: postgres24MB, extensions
pg_cron,pg_net,pg_stat_statements,pgcrypto,plpgsql,supabase_vault,uuid-ossp. Owner stopped combined
app launcher and confirmed PowerShell work prompt ready; tunnel should remain open.
Owner ran tooling/scripts/backup-vps-recovery.ps1 successfully (PowerShell parse and execution PASS):
fixed VPS/container, migration checkpoint guard, private unique backup directory, full custom
database dump + role SQL, archive-list/checksum checks, no contents printed, no restore command.
Backup created at /home/ubuntu/esh-recovery-backups/backup-20261026T180022Z-qU6bJ2, size2.9M.
Owner output confirms archive catalog and checksum verification PASS. No restore performed or
restore-test container created. Owner copied the full backup directory via scp to
C:\Users\koshi\ESH-Recovery-Backups\backup-20261026T180022Z-qU6bJ2 (outside Git).
Owner Get-FileHash SHA256 comparison against copied SHA256SUMS returned True for database.dump,
roles.sql, archive-index.txt and manifest.txt. Off-server transfer/integrity PASS; keep files
private (Auth/role material). No backup contents printed. Do not repeat backup/copy/check for context.
Owner checked image tools: initdb/postgres under /nix/var/nix/profiles/default/bin,
gosu /usr/local/bin/gosu; Linux postgres UID100/GID101. Prepared owner-run
tooling/scripts/test-vps-recovery-restore.ps1 using the exact archive and source immutable image ID.
Fresh labelled target container+volume, network none, no ports, Unix sockets only, cron disabled
before restore,1GB/1CPU limit. Restores roles/full archive with transactions and stop-on-error;
all sensitive output stays private. Compares critical data/checkpoint/extensions/RLS flags to
read-only current source; stops test target on finish, retains volume/logs, never restores source.
PowerShell parse + Bash syntax + seven fake-Docker control/cleanup tests PASS. Owner ran real
test: target esh-restore-test-20261026T183016Z-qjSOGL, private logs
/home/ubuntu/esh-recovery-restore-tests/test-20261026T183016Z-qjSOGL. Failed at restore-roles,
before archive restore. Exit trap should stop target; no cleanup warning reported. No restore
PASS; preserve test container/volume/logs and original backup, do not repeat/reset blindly.
Owner read first ERROR safely: permission denied to grant privileges as role "supabase_admin".
Owner source pg_roles oid10 query confirmed supabase_admin. Original script used different
bootstrap user esh_restore_bootstrap, causing GRANTED BY supabase_admin replay failure under
PostgreSQL17 grantor rules. Corrected script initializes target as supabase_admin too and skips
only its duplicate CREATE ROLE in a private derived replay file. Original backup unchanged;
all ALTER ROLE/membership options/GRANTED BY preserved, no errors ignored. Verification now
also compares role membership/grantor/options. PowerShell/Bash checks and seven simulated control
tests passed. Owner corrected restore execution PASS: esh-restore-test-20261026T184040Z-A9kNYn,
private logs /home/ubuntu/esh-recovery-restore-tests/test-20261026T184040Z-A9kNYn. Role and full
archive restoration completed without ignored errors; critical data/checkpoint, extension
versions, public-table RLS flags and role membership/grantor/options matched current source.
Script exit stops test container; separate test volume/private logs retained. Original failed
test also retained; no cleanup deletion authorized/performed. Working source not restored,
stopped or changed. Off-server copy still verified; no need to repeat backup/restore acceptance.
Database restore rehearsal PASS is not full app-stack disaster recovery, vault decryption,
storage-object recovery or external configuration recovery. NEXT explain result/scope, then
review remaining recovery configuration/storage gaps and a bounded cleanup/restart plan.
Owner restarted combined recovery launcher and confirmed both Ready. Owner then opened3014,
signed in anew as owner@example.test and supplied populated active VPS RECOVERY TEST dashboard:
one membership,zero pending invitations,six capabilities,twelve recent audit events, including
new product_session.entered at2026-10-26 14:09 local. Post-rehearsal app restart/sign-in/dashboard
PASS. Both recovery apps were running at that checkpoint; tunnel separately owned. Governance enrollment remains
one Transportation administrator. Do not repeat sign-in or restore acceptance for context.
Owner ran read-only inventory successfully: pinned sourcebc27d2661edd09a5d0b8d76ce33da6d4071a756e;
deployment .env/Compose files exist (also .old copies). Active binds under recovery/volumes:
storage (8.0K; do not assume empty), functions, snippets, api/envoy, pooler and DB init SQL.
Live PostgreSQL data is volumes/db/data; exclude it from file copying. Named custom configuration
volume esh-recovery_db-config is mounted at /etc/postgresql-custom. Mailpit data and regenerable
Deno cache are separate named volumes; not part of required deployment/storage archive.
CURRENT NEXT: prepared tooling/scripts/backup-vps-recovery-files.ps1, owner execution pending.
Owner executed file backup PASS: /home/ubuntu/esh-recovery-file-backups/files-20261027T010827Z-ymqREs,
size1.2M. Deployment/custom-config archives extracted separately and original file hashes matched;
archive checksums verified. Live deployment/database not restored/stopped/changed; DB data excluded.
Private unique directory under ~/esh-recovery-file-backups; entire deployment archive excluding
live DB data, plus custom DB-config archive. No contents printed. Extracts only into private
verification directories and checks original file hashes; verifies overall archive hashes too.
Leaves live deployment/database unchanged. Files may include secrets; never paste/archive in Git.
PowerShell/Bash syntax + three synthetic archive/exclusion/extraction tests PASS. Tests mock
Docker, no actual VPS action by Codex. Owner copied new file-backup folder to
C:\Users\koshi\ESH-Recovery-Backups\files-20261027T010827Z-ymqREs and confirmed all five local
SHA256 comparisons True: deployment-files.tar.gz, db-config.tar.gz, deployment-files.sha256,
db-config-files.sha256, manifest.txt. Configuration/files off-server transfer/integrity PASS.
Existing database backup/off-server/isolated restore acceptance also PASS. Do not repeat completed
backup/copy/hash work. Owner GO authorized separate whole-stack rehearsal. Prepared read-only
inspect-vps-full-stack-restore.ps1 (PowerShell/Bash syntax PASS), owner execution completed:
capacity/disk, database names, filtered Compose service names/dependencies/ports/network/volume
names only, no environment values. Owner output: availableRAM5.7GiB, disk60GB free; databases
postgres AND _supabase. Existing tested archive covers postgres, not _supabase. Twelve services
all on default network, fixed names except Mailpit; named db-config/deno-cache/mailpit-data
not external. Ports loopback8000/8025/5432/6543. No duplicate stack created or started.
NEXT: prepared backup-vps-recovery-metadata.ps1 (PowerShell/Bash syntax PASS); owner runs
powershell -NoProfile -File tooling/scripts/backup-vps-recovery-metadata.ps1
Owner auxiliary backup execution PASS: /home/ubuntu/esh-recovery-metadata-backups/
metadata-20261027T012944Z-XdPJMC,32K; archive catalog/checksums verified, source unchanged.
Owner copied metadata folder to C:\Users\koshi\ESH-Recovery-Backups\metadata-20261027T012944Z-XdPJMC
and confirmed metadata.dump/archive-index.txt/manifest.txt SHA256 matches all True. Auxiliary
off-server transfer/integrity PASS. Do not repeat copy/check. Auxiliary restore pending; full-stack
namespace/isolation preparation follows. No need to repeat existing backup generation.
Prepared prepare-vps-full-stack-restore.ps1 plus pure full-stack-rehearsal-model.cjs. Owner
execution pending. Verifies all three backup sets, extracts configuration/files into unique
private ~/esh-full-stack-rehearsals folder preserving original modes/UIDs, generates private
Compose JSON using copied configuration. Model removes fixed container names, namespaces
volumes/network, pins installed image IDs, validates new bind roots, rejects external DB URLs/
host namespaces, preserves service aliases, sets internal network, loopback58000/58025 only
and cron disabled. No services/volumes/networks started. Uses existing Studio Node only as
pure in-memory transform; no source file/DB mutation. Private model contains secrets; filtered
plan only is printed. Owner actual preparation FAILED in private folder
/home/ubuntu/esh-full-stack-rehearsals/rehearsal-20261027T070649Z-OAmz2a; no stage printed by
old script and no startup/restore requested. User explicitly exhausted by manual back-and-forth;
do not ask another retry now or repeat completed backups. Preserve private failed candidate/logs.
Local inspection found definite validator bug: pinned source db service POSTGRES_HOST is the
local Unix socket /var/run/postgresql, not network name db. Corrected exception only for that
exact db-service setting; all inter-service hosts still restricted. Ecto DB URLs now checked too.
Eight model tests PASS with actual Unix-socket fixture. Validator emits only deliberately safe
constant error reasons; preparation now records stage/path on failure without dumping secrets.
Actual cause/stage of this failed VPS run is not yet confirmed from private diagnostics; local
bug is evidence, not proof that no earlier preparation step failed. NEXT when owner ready:
inspect safe failure stage of this exact candidate before another run. No new owner command
requested in latest response. Full-stack startup/auxiliary restore remain pending.
Do not repeat previously verified postgres/files backup; this fills a newly discovered gap.
No new terminal, container or file backup needed. Source Compose has fixed container names and
volume/network names; full-stack duplicate must remove/remap these, use new private bind paths,
loopback-only alternate ports, its own internal network and disabled cron. Source Envoy routes
use service DNS plus realtime-dev.supabase-realtime alias; preserve alias inside isolated network.
Check auxiliary databases (e.g. Supavisor metadata) before assuming the postgres archive alone
reconstructs the entire stack. Backed-up config contains secrets; never print full Compose JSON.
Full-stack startup still untested; no production cutover or source reset authorized.
Source changes since backup could cause comparison mismatch without archive corruption.
Preserve running source database. App work window is at repository PowerShell prompt; apps
were stopped for backup, tunnel separately owned. Creation/catalog/checksum success is not
restore verification. Off-server copy is now confirmed, but isolated restore remains pending. Repository
migrations install pg_cron; cannot assume a scratch database in the existing cluster is a safe
restore target. Test isolation must prevent cron/provider side effects and preserve working DB.
Supabase backup guidance reviewed; database dumps do not include stored object bytes or full
deployment secrets/configuration. No production cutover authorized. Preserve two existing windows
and all uncommitted work. Explain one bounded step at a time; use existing browser where possible.
Explain just one owner step at a time; no redundant folder commands or additional windows.
Historical scoped grants may need review only on actual failure, not blanket application.
Runbook: docs/development/vps-recovery.md. Do not use production-linked CLI defaults.

Owner runs server/database/Git mutation commands; Codex has no authenticated VPS SSH access.
Explain commands before execution, state where to run them, and proceed one bounded step at a time.
Synthetic test data only; retain tenant provisioning and email invitation workflow. No production
cutover, DNS/key rotation, cloud export, automatic failover or architecture replacement authorized.
Preserve existing repository changes, owner stash and supabase/snippets. Local acceptance below
is complete; older server-not-provisioned and cleanup-pending statements are superseded.

### Active local Supabase setup (owner approved 2026-10-23)

CURRENT COMPLETED LOCAL ACCEPTANCE: owner observed Settings saved. for LOCAL-PERSISTENCE-TEST,
reloaded and confirmed the value persisted, then cleared/saved/reloaded and reports CLEAR.
Read-only local DB query confirms branding_restored_blank=true. Temporary persistence value
cleanup is complete; do not repeat the test or restore TEST value. Verified local workflow:
tenant provisioning -> local invitation delivery -> recipient credential creation/acceptance ->
active owner membership -> Transportation entitlement/workspace/enrollment -> product entry and
dashboard -> authorized settings write -> reload persistence -> restore original blank.
This is a representative workflow pass, not full payments/maps/native/dispatch certification.
Next discuss/inventory owner's server for a separate official self-hosted Docker Compose recovery
environment. No server address/specifications/access verified yet; do not install/deploy, copy
production data, rotate credentials or change production DNS without a concrete approved plan.
Keep both existing local ESH and FairFare stacks intact. Current local launchers: Platform53604,
Transportation48604; existing isolated local mail bridge is owned by Platform. Production remains
unchanged. Earlier Settings retry and cleanup-pending statements below are superseded.

CURRENT ACCEPTED CHECKPOINT: owner enabled capabilities through Platform UI, then reloaded
local Transportation and supplied a populated active LOCAL TEST ESH dashboard: owner@example.test,
active profile/membership, tenant_owner, one membership, zero pending invitations and visible
audit history. Six enabled capabilities reported: app.admin, driver.management, vehicle.management,
tenant.audit, tenant.memberships, tenant.roles. Vehicle management is enabled in supplied actual
state despite earlier guidance to leave it unchanged; do not assume only drivers changed or
silently alter it. No app.rider/app.driver shown enabled. Local invitation -> owner credentials ->
acceptance -> entitlement -> workspace enablement -> operational enrollment -> Transportation
entry/session -> dashboard read is owner-confirmed PASS. Product session entered/ended/superseded
events are visible; this is not a complete adversarial session-exclusivity certification.
NEXT: inspect Settings UI with owner, perform one bounded reversible local-only setting change,
reload/verify and restore original. Do not create live-provider payments, real mail/SMS, drivers,
or bookings to prove persistence. Hosted apps/FairFare untouched; no production cutover authorized.
Older error/retry instructions below are resolved history, not tasks to repeat.
Owner opened Settings: display/legal LOCAL TEST ESH, zone America/Chicago, support@example.test,
Branding reference blank. Preparing reversible branding-reference persistence check through
existing local backend rewrite, not SQL seeding. Save endpoint PATCH directly updates five
tenant_configurations fields. Added only those five column UPDATE grants to local-platform-grants.sql
and applied ESH-local; existing owner/admin/Platform RLS unchanged. Rolled-back verification with
actual owner's existing product-session context: owner_role=true, owner_update_count=1,
unrelated_update_count=0, original branding blank after rollback. Initial subject-only probe
returned0 because product-session context was omitted; corrected full-context test passes.
Next owner enter LOCAL-PERSISTENCE-CHECK in Branding reference, Save settings, reload Settings
and report whether retained. Then clear it, save/reload and verify original blank state restored.
No permanent branding test write yet; no app restart needed.
Owner then reported Save not working. Read-only DB check proves actual saved branding is
LOCAL-PERSISTENCE-TEST (owner-entered value differs from suggested CHECK); original was blank.
Transportation HTTP200, no server restart needed. Settings success handler only refreshes, no
success message, explaining lack of visible confirmation; no code change made for feedback.
Actual local write reached DB. Next owner reload Settings and confirm LOCAL-PERSISTENCE-TEST
still visible, then clear/save/reload to restore original blank. Cleanup remains pending.

LATEST SETTINGS CHECKPOINT (supersedes retry/unchanged-code statements above): owner disputed
saving again; prior DB value is NOT proof of their latest attempt. Asked intended new value vs
clear; answer not supplied yet. Found source issues: no progress/success feedback, uncaught
network failure and API200 even if RLS UPDATE affects zero rows. Minimal uncommitted fixes:
SettingsPanel shows Saving settings… / Settings saved. / visible error, blocks duplicate submits,
catches network errors and retains rejected draft. PATCH returns updated tenant_id and403 if no
row; auth/validation/RLS unchanged. No DB/policy change in this step. Three focused API tests,
Admin typecheck/scoped ESLint/format PASS. tooling/scripts/local-settings-check.cjs browser check
PASS: busy feedback, value save/reload, clear/reload, rejected/network draft retention. Fixtures
only, no real tenant writes; last observed real branding remains LOCAL-PERSISTENCE-TEST.
Restarted verified local app trees: Platform PID53604 (was40792), Transportation PID48604
(was34432), isolated snapshots now contain fixes. No Docker/FairFare/production change.
NEXT OWNER: reload /transportation, Settings, attempt intended edit once, report exact new success
or failure text and post-reload field value. Original blank restoration remains pending.

LATEST CHECKPOINT: owner GO authorized local Transportation launch after its port3004 was refused.
It is now running persistently via tooling/scripts/local-transportation.cjs, launcher PID34432.
Platform remains PID40792/port3000; local mail54428 belongs to Platform launcher. Transportation
port3004 binds loopback, snapshot copies Transportation/shared Admin source but no env files;
explicit backend rewrite targets Platform3000, Supabase API54421. No privileged/provider keys,
Mapbox setup or production source/environment changes. Forty explicit RLS-protected dashboard
table SELECT grants applied only to supabase_db_esh-platform (local-transportation-grants.sql);
no write/anonymous grants, RLS policy changes or admission bypass. Syntax/format checks pass.
Verified Transportation / and /transportation HTTP200; rewritten anonymous API POST401; isolated
browser sign-in visible and zero external host requests. Read-only actual-owner RPC returns
transportation:transportation_admin; unrelated identity gets zero workspace/tenant rows, anon
driver SELECT=false. No test session or enrollment was persisted by diagnostics.
NEXT OWNER STEP: open http://127.0.0.1:3004, sign in as owner@example.test using the password created
during invitation acceptance, then report the tenant/entry screen. Do not use admin@example.test
for product entry or assume authenticated dashboard acceptance has passed. Do not revisit
governance as that owner while testing an exclusive Transportation session.

LATEST OWNER RESULT: Transportation entry succeeded and reached /transportation with all tabs,
but showed Unable to load / Unable to load tenant administration. Local role/session/profile/
foundation-table/directory read checks all pass. Reproduced loadTenantSummary's maintenance RPCs
as actual local owner/session in rollback transaction: expire_dispatch_offers OK,
activate_due_scheduled_bookings raises P0001 "dispatch access is required". Exact DB permission
function can_manage_dispatch requires tenant owner/admin AND driver.management enabled; local
driver.management=false, vehicle.management=false, app.driver=false. Generic UI loses the plain
PostgREST error object message (cause instanceof Error test); no UI/DB change made for this issue.
Earlier instruction to leave driver.management disabled missed this setup dependency.
NEXT owner action supersedes entry instruction above: Platform /platform as admin@example.test,
click Enable drivers for LOCAL TEST ESH (driver.management only, not app.driver) with local-test
reason. Keep vehicle/app.driver/other product capabilities unchanged. Then retry local
Transportation page as owner@example.test. Use existing audited UI, not direct capability SQL.
No additional enrollment, auth/policy/code change or production action needed for this blocker.
Owner reached Platform tenant table but reports Permission denied clicking Enable drivers.
Inspected existing /api/platform-admin/capabilities: direct UPDATE enabled/enabled_at/disabled_at
on tenant_capabilities; local role had no UPDATE grant. Added only those three column grants to
local-platform-grants.sql and reapplied ONLY to ESH-local. Existing RLS remains Platform-admin-only.
Rollback test: admin@example.test update_count=1, owner@example.test update_count=0; rollback
confirmed driver.management remains false. No persistent capability change/enrollment or policy
rewrite. No app restart needed. Next owner: click Enable drivers once on current /platform table
as admin@example.test; expect button Disable drivers. This route has NO reason prompt; prior
instruction to enter a reason was unnecessary. Then test Transportation reload. No production change.

Strategic direction: owner follows recommendation to finish one representative local workflow,
then assess their server for a separate official Docker Compose Supabase recovery environment.
This preserves app/Supabase interfaces while becoming independent of hosted Supabase Cloud.
CLI local stack is not a production server deployment. No remote deployment, cloud migration,
automatic failover, synchronization or standalone-PostgreSQL replacement authorized/performed.

Owner decision 2026-10-24: KEEP the working local Supabase stack. Standalone PostgreSQL and a
fully Supabase-independent app/backend were discussed, then explicitly deferred after assessing
the Auth/API/Storage replacement work. No standalone PostgreSQL container or replacement backend
was created. Preserve the working application's architecture and use local Supabase for local
development independent of hosted outages. Any dependency/exit-path documentation is future work,
not permission to begin migration or refactoring. Resume at the existing local launch/invitation
checkpoint below; do not restart setup, seed tenants directly or bypass the email onboarding flow.

Owner authorized local Supabase for testing during the hosted outage, and explicitly requires
separation from other applications. Existing Git work/stash preserved; runtime auth architecture,
cloud keys, RLS and hosted settings remain unchanged. No Git mutations or production DB commands.
Docker Desktop and CLI 2.109.1 were installed; engine was stopped. Codex started Docker Desktop
in background. Existing FairFare containers auto-resumed: fairfare-driver-compliance owns
54321 API, 54322 DB, 54323 Studio, 54324 email and 54327 analytics, its own network and volumes.
No FairFare data/configuration/container stop or deletion was performed.

ESH config retains project_id esh-platform, moves local ports to 54420–54429, and allows local
Auth callbacks on 127.0.0.1 app ports 3000–3006. This avoids adopting FairFare's API/database.
Added development/local-supabase.md with ownership, startup/stop and environment/data boundaries.
Downloads and local initialization completed, verified 2026-10-24. Startup applied all 153
repository migrations through 20261017000100 and seed.sql. Read-only query in specifically named
supabase_db_esh-platform confirms migration count=153, max(version)=20261017000100.
Ten ESH service containers run, with expected health indicators; local Auth and Studio HTTP
checks pass. tooling/scripts/local-supabase-check.cjs verified ESH-only network/named volumes,
no FairFare host-port reuse and exact API origin. FairFare remains healthy and separate.
ESH Studio http://127.0.0.1:54423; email viewer http://127.0.0.1:54424; API port54421; DB54422.
Optional imgproxy/analytics/vector/pooler are stopped as reported by CLI. Default Docker host
bindings are 0.0.0.0/IPv6, not loopback-only; different-stack isolation is not LAN isolation.

Exec startup session49784 has finished; do not retry start based solely on its PowerShell wrapper
exit1: captured output said Started supabase local development setup, and independent service,
ownership and migration checks PASS. Wrapper emitted RemoteException objects for warning stderr;
no migration failure observed. CLI still warns deprecated inbucket config and available upgrade;
neither CLI nor production was upgraded. No keys printed. Existing app environment files were
not opened or changed. Only isolated Platform development app is now connected to local Supabase;
other local apps are not launched. Next: application-driven local tenant invitation acceptance.
Do not reset either stack or copy data/credentials from FairFare or production.

Owner created admin@example.test in ESH Studio and ran the supplied active person/platform_admin
bootstrap; read-only DB check confirmed active person and active platform_admin role. No tenants
exist yet. Owner explicitly reminded that tenant setup must retain the application's existing
email/invitation lifecycle, not direct SQL tenant seeding. Proposed synthetic-tenant SQL shortcut
was removed; interrupted command was checked read-only: zero tenants and no listener on port3000.
Do not create tenant memberships/product admissions directly to bypass invitations.
Prepared tooling/scripts/local-platform.cjs: source snapshot under ignored
.cache, no .env files copied, OS-only inherited variables plus verified ESH-local public config,
loopback Platform port3000 and local product launcher URLs. Syntax/format pass. Launcher started
2026-10-24, exec session13543: Next Ready and HTTP200 with Sign in page verified at
http://127.0.0.1:3000. Uses only ESH-local Supabase API54421, not hosted config or FairFare.
Owner signed in with admin@example.test and reported Your products / Unable to load workspaces /
permission denied for table person_profiles. Local read-only inspection confirmed schema USAGE
true but authenticated SELECT false on foundation tables, existing RLS enabled and policies
present. This is fresh-local base-grant omission, separate from hosted PGRST303. Applied scoped
tooling/sql/local-platform-grants.sql ONLY to supabase_db_esh-platform: SELECT on ten UI-used
Platform tables and INSERT/UPDATE on self-scoped active_tenant_preferences, with RLS prerequisite
assertions. No blanket/anonymous grants, policy rewrite, historical migration change or cloud
mutation. Read-only role/claim transaction verified local account profile_count=1, unrelated
identity profile_count=0 and anonymous SELECT=false; rolled back diagnostic session state.
Owner reloaded and supplied ESH Platform / Your products / Sign out with no error and no products.
Local signed-in landing-page load after grants is owner-confirmed; empty list matches zero tenants,
not a complete tenant/invitation acceptance pass. Owner opened /platform and supplied Tenant
Provisioning / platform_admin / zero visible tenants. Local invitation transport now prepared:
launcher changes ONLY ignored copied source's Resend endpoint to loopback54428; original app
email code stays unchanged. Local bridge requires random in-memory launcher authorization,
accepts only @example.test recipients and forwards to ESH SMTP54425. Unit test passes auth,
rejected external recipients/header injection and SMTP content capture. Synthetic LOCAL TRANSPORT
CHECK messages captured in local Mailpit; no tenant/invitation created by Codex. Initial verification
used obsolete Inbucket mailbox URL (404), then corrected Mailpit /api/v1/messages verified capture
without exposing message bodies/tokens. Local grants additionally permit UPDATE only on invitation
token/delivery-status columns used by existing routes; existing RLS unchanged, ESH-local only.
Restarted isolated launcher session46437: Next Ready and /platform HTTP200, previous13543 stopped.
Later owner clicked Create tenant and reported Runtime TypeError / Failed to fetch. Read-only
checks found no listener on3000 or54428, both local HTTP requests ECONNREFUSED, old exec session
no longer available, and zero tenants/invitations. Thus that attempt created no tenant; precise
reason the prior process exited is unknown. No production app mutation/error handler change.
Restarted launcher via hidden persistent Start-Process, PID49664, detached from exec session.
Verified /platform HTTP200, unauthenticated provisioning POST401 and mail bridge401 (expected
auth rejection, demonstrating both endpoints reachable). Stdout/stderr redirected to uniquely
named ignored .cache/local-platform-*.log; never paste raw logs, which could contain URL tokens.
Owner retried and reports "Tenant provisioned and invitation email sent." This confirms the
reported application provisioning/send result, not recipient acceptance or product admission.
Next owner step: open http://127.0.0.1:54424, find invitation addressed to owner@example.test
for LOCAL TEST ESH, inspect message then follow acceptance workflow. Do not paste its token/link.
Do not create another tenant or manually add owner membership to bypass acceptance.
Owner opened the email acceptance flow while admin@example.test was signed in. Read-only check
confirmed support_contact_email=support@example.test vs invited owner=owner@example.test; guided
Sign in with another account. Owner tried Sign in, received Invalid login credentials, then used
Create credentials for the new owner identity. Owner now reports Your products / No operational
products available, no load error. Read-only ESH-local DB verification confirms invitation=accepted,
tenant=active, owner membership=active and tenant_owner role=active for owner@example.test.
Local create -> captured email -> new recipient credentials -> invitation acceptance -> owner
admission is verified. Product access is being tested next; no operational enrollment yet.
Subsequent owner-led test: admin@example.test opened /platform, found active LOCAL TEST ESH,
clicked Grant for Transportation, and supplied Transportation: granted with Suspend/Revoke.
Community remains not granted; four capabilities enabled, rider/driver disabled, driver/vehicle
controls untouched. Owner then enabled Transportation via /governance as owner@example.test,
but zero members enrolled. Owner reports Reason text not persisting. Isolated browser fixture
reproduced stable typing but rejected enroll RPC cleared Reason: submitEnrollment unconditionally
cleared state because parent mutate swallowed failure. Minimal uncommitted app fix in
WorkspaceAdminApp.tsx returns mutation success boolean and clears Reason only on success.
No auth/RLS/schema changes or deployment. Admin typecheck/scoped ESLint pass; durable fixture
tooling/scripts/governance-enrollment-check.cjs passes preserved rejected input and correct role/
reason payload. Browser fixtures do not diagnose the actual owner's prior rejection response.
Read-only workspace check confirmed Transportation enabled, Community/Student disabled and zero
enrollments. Actual existing enroll RPC tested as local owner inside BEGIN/ROLLBACK: succeeded,
one audit event inside transaction, zero persistent enrollments after rollback. No direct lasting
enrollment bypass. Original reason-loss timing question was asked; owner has not yet answered.
Restarted only verified local launcher tree49664, new persistent launcher PID40792; app snapshot
now includes fix. Mail bridge restarts with launcher. Next owner step: reload /governance, enter
reason and submit once; if rejected, preserve reason and collect visible actual error. Do not
assume operational app is running (only Platform3000), grant extra capabilities, bypass admission
or activate Student transport. Local invitation lifecycle passed; no fake external webhooks or
external provider credentials supplied, and local captured delivery status may remain pending.
Owner retried and supplied Transportation enrollments / 1 enrolled / owner@example.test /
Transportation administrator. Real local UI enrollment acceptance is owner-confirmed after fix.
The proposed retry above is complete: do not repeat enrollment or remove/recreate it. Next owner
opens http://127.0.0.1:3000 to confirm Transportation card, without launching port3004 yet.
Only isolated Platform is running; next implementation checkpoint is an isolated local
Transportation launch and its existing backend/session handoff, preserving working product
boundaries and avoiding cloud/FairFare envs. No production deployment/change authorized.
Preserve untracked supabase/snippets/ from owner's Studio activity; do not discard unfamiliar files.

Read-only checker syntax/formatting and scoped diff checks pass. Older local seed/runbook ports
were corrected and embedded example key/password and routine destructive reset advice removed.
Owner-requested completion watcher (PID51132, startupPID50092) generated ignored
tmp/esh-local-setup-status.txt with success text after its own health check. Desktop-dialog code
was launched, but owner seeing/dismissing the alert is not confirmed. Watcher does not mutate
Docker resources. Local Platform sign-in, tenant invitation acceptance and Transportation enrollment
are owner-confirmed. Operational Transportation UI acceptance is next, as detailed above.

Hosted context since older checkpoint: owner reports every app affected, ticket SU-520143
acknowledged. Official API Gateway / Management API incidents were active under monitoring;
owner asked to pause app debugging pending provider recovery. Platform retest still reported
JWT issued at future. Official JWT incident identifies stale time cache and an upgrade recovery
path (https://status.supabase.com/incidents/01KZZ19EQMSC9DNDA15ZGVY19V), but no project upgrade
was authorized or performed. Do not resume hosted troubleshooting as part of local setup.

### PAUSED by owner — cross-frontend JWT rejection (2026-10-20)

Owner requested a break and this handoff update. Stop investigation until the owner resumes.
Current task is read-only diagnosis, not implementation. Owner explicitly requires approval
before any auth architecture, credential, database policy, provider upgrade or deployment change.
Do not repeat sign-in, email/account changes, rollback or billing troubleshooting without new
evidence. Follow the owner's lead and give one step at a time.

Production remains owner-confirmed 3eb3766; local main/origin align. Existing handoff modifications,
untracked tooling/sql/student-internal-context-diagnostic.sql and backup stash remain preserved.
No runtime code, Git state, credentials, provider settings or production data changed during this
investigation. This documentation update is the only new file edit in this pause step.

Decisive new owner evidence: at https://admin.eshapp.com (neutral ESH Platform, separate from
https://school.eshapp.com/admin), owner reports:
"Your products / Unable to load workspaces / JWT issued at future".
Thus data-access failure is reproduced beyond the Student frontend. Student's exact captured
diagnostic remains "Load staff access: Authentication was rejected. (HTTP 401 / PGRST303)";
its underlying response message has NOT separately been captured. Do not assert both responses
were directly inspected or that every product is affected.

Read-only findings:
- Live Student public bundle exposes one Supabase project origin:
  https://akoachisjvedvdmwtcvk.supabase.co, with one publishable public key (value not printed).
  SDK derives Auth/REST from the same base URL. Actual Platform deployed config and failing
  browser JWT/header have not yet been independently compared.
- Staff client uses isolated esh-student-transportation-auth storage, persistent session,
  auto-refresh and built-in callback handling. Installed supabase-js 2.54.0 obtains the session's
  access_token for Bearer authorization; no Staff global Authorization override found.
  This is source evidence, not capture of the actual failing request's Authorization header.
- New public probe, 2026-10-20 06:17:57 UTC: /auth/v1/settings returned 200 with deployed public
  key. Anonymous POST /rest/v1/rpc/my_student_enrollment_context with {} returned 401 / 42501,
  "permission denied for function my_student_enrollment_context", proxy-status PostgREST;
  error=42501, no gateway error code. Expected anonymous denial reaches PostgREST and differs
  from authenticated PGRST303. Earlier anonymous REST root key-type denial is not a valid
  reproduction of the signed-in failure. No child data/token/secret printed.
- Fresh sign-in and restored-session failures have been owner-reported, but actual token iat,
  exp, iss, aud, sub, role and same-token Auth /user vs REST comparison remain uncollected.
- Enforced quotas shown are below limits; only log ingestion Upcoming meter exceeded. No 402
  captured. Free Plan/grace banner is NOT a supported root cause. No upgrade recommendation
  for billing, no new account, no key rotation or policy/grant repair is justified.

Leading hypothesis: managed PostgREST validation-time problem. Platform's exact message says
the validator regards JWT iat as future. Upstream v14.18 explicitly fixes sporadic PGRST303
"JWT issued at future" errors; ESH's running PostgREST version and actual time claims remain
unknown, so a known-bug match/server clock cause is NOT yet proven. Do not confuse gateway
HTTP Date with the internal PostgREST validator clock or infer laptop time is the JWT issuer.
Primary references:
- https://supabase.com/docs/guides/api/rest/postgrest-error-codes
- https://github.com/PostgREST/postgrest/releases/tag/v14.18
- https://github.com/PostgREST/postgrest/issues/5196

Recommended next action on resume: owner-led Supabase support inquiry, not application changes.
Support steps/message were supplied; submission and ticket number are NOT confirmed. Ask support
to check project akoachisjvedvdmwtcvk's PostgREST version, cached validation time/clock alignment
and applicability of the v14.18 issued-at fix. Provide exact errors, endpoint and UTC evidence;
never keys, full JWTs, magic links or student data. Any proposed provider upgrade/restart or
application correction requires owner approval first. Additional safe signed-in diagnostics,
if needed, compare the SAME JWT at Auth /user and read-only REST and report only sanitized
claims/timestamps and error fields. No connected signed-in browser is available to Codex.

Recurring-planning manual acceptance remains blocked before successful policy save; preserve
the submitted December TEST request and resume from that checkpoint only after access recovers.
The sections below retain implementation/history; their older "next" actions are superseded
by this pause and diagnostic checkpoint.

### Current authorized work — unified staff portal (2026-10-20)

Owner explicitly approved "yes consolidate": one internal staff portal, separate school portal.
Implemented locally from 519320b: /admin Staff portal owns one auth client/session, business
selector, refresh/sign-out and Requests and planning / Enrollment / Administration sections.
/clients redirects /admin; /enrollment redirects /admin?section=enrollment. /school/invitation
flow remains customer-only. Existing /admin email return and storage key preserved; no new
callback/config/env/key/migration or role grant. Embedded existing components retain RPC/RLS,
audit/idempotency and role gates. Initial business prefers an enabled admitted reviewer/staff
pilot; tenant/identity/section changes clear private child workspace state. No new storage.
Safe load diagnostics show fixed operation, HTTP status and bounded code, never raw provider
details/token headers. This is NOT a claimed fix for live 401 or reintroduction of reverted
510fab1 save-feedback code. No unrelated stash contents restored. Existing owner backup remains.

Verification so far: eight scoped unit tests, enabled production build/lint/types, new staff
callback/session/navigation/tenant/revocation/sanitized-401 browser check, existing enrollment
lifecycle/governance, customer/address-search and planning browser scripts PASS. Intercepted
fixtures only, not production auth certification. 414px complete staff screenshot inspected;
320/414/desktop overflow checks pass. Busy guard test holds a governance write in flight and
confirms navigation, business choice and sign-out disable until settled; enrollment/planning
regressions pass after nested busy propagation. No reintroduction of reverted policy behavior.
Final default-off production build/lint/types, 21 closed-shell screen/viewport checks, formatting
and diff whitespace checks PASS. Existing Supabase realtime/Next ESLint plugin warnings remain.
SDK source confirms built-in URL handling for both implicit and PKCE callbacks; shell uses that
single initializer rather than duplicating exchange handlers. No production provider/email calls.
Read architecture/student-staff-portal.md and operations/student-staff-portal-manual-test.md.
Owner pushed consolidation as 3eb3766 and supplied esh-platform-student-transportation Ready /
Production at that commit. Same monorepo push also shows transport-platform-admin Ready; no
ordinary Admin runtime change was included. Next: one /admin hosted acceptance, using current
internal session or admitted internal email only if signed out. Record Staff portal heading,
sign-in identity and exact safe load diagnostic, not another DevTools/log loop. No Vercel override,
database/billing/credential/account mutation or repeated manual sign-ins. Production remains
owner-confirmed 3eb3766. Owner opened /admin, then completed ONE internal sign-in and supplied
Staff portal, Signed in as ishmaelkosh@gmail.com and exact visible error:
"Load staff access: Authentication was rejected. (HTTP 401 / PGRST303)".
Canonical shell and identity restore accepted; staff data access remains blocked. Supabase docs
define PGRST303 as JWT claims validation/parsing failed (time/audience/etc, not proof which).
No new account, duplicate-email repair, key rotation, migration or repeat sign-in justified.
Public read-only diagnostic (no student data): bundled publishable key is accepted at Auth
/auth/v1/settings (200). Anonymous /rest/v1/ without user bearer returns 401 with gateway
UNAUTHORIZED_INVALID_API_KEY_TYPE; that root/anonymous result does NOT reproduce the logged-in
PGRST303 and must not be treated as proof of bad public key or generalized API outage. No key
values printed and no production writes/emails/settings changes performed by Codex.
Exact failed claim remains unavailable in generic UI/log excerpt. New staff safe classifier
currently recognizes invalid key, expired JWT and invalid JWT, but not "JWT issued at future"
or audience mismatch; PGRST303 alone cannot establish cause. Upstream PostgREST/Supabase issue
reports describe clock-related PGRST303 on fresh tokens, a hypothesis only. Preserve source,
credentials/billing/roles until a precise provider error or support diagnosis confirms cause.
Keep December source submitted and stash intact; no successful hosted access load yet.

The detailed rollback/diagnostic checkpoints below are retained evidence; navigation is superseded
by this local consolidation, not proof that it has been deployed or that API access works.

### Historical controlled rollback test — superseded by paused checkpoint above

Owner reverted 510fab1 using git revert --no-edit, creating 519320b, verified
git diff --exit-code b75afc6 HEAD printed nothing, pushed main, and supplied Vercel Ready /
Production for 519320b. Local main/origin align at 519320b. This was a normal GitHub deployment,
NOT a Vercel Instant Rollback. Prior deployments remain history. No DB rollback or auth settings
change confirmed. Recurring-planning migration remains applied. Stash@{0}, "Backup before Student
Transportation rollback", exists; owner reports -u backup. Do not apply/pop/drop it during test.

Objective: compare internal sign-in/session behavior on restored b75afc6 source before resuming
policy-save testing. Same Student domain/browser; change one variable at a time. The internal
review account used successfully is ishmaelkosh@gmail.com; school customer koach2025@gmail.com
uses /school and is not the account for this internal test. No account grants, new requests,
browser clearing, Supabase configuration edits, or production mail by Codex.

Confirmed prior manual checkpoint: existing December TEST request with three distinct
equipment/staffing tags is submitted and owner-confirmed visible internally under ESH Education;
road preview works. Community Hub was a separate empty queue. Keep source request submitted.
Policy save remains unconfirmed. Do not restart intake or assume canonical/resource reviews exist.
Both b75afc6/510fab1 sign-in source requests /admin from /clients; shared Student auth storage.
Reported /school callback and enrollment load failure are unresolved. No verified cause yet.

Test tracker:
CONFIRMED HTTP failure (owner logs 2026-10-20): POST /rest/v1/rpc/my_student_enrollment_context
returns 401 from browser (00:03:10 and 00:01:26/18 log timestamps). Customer RPC
accept_my_student_customer_invitations also 401; OPTIONS 200. Native worker claim_native_push_attempts
continues 401 every minute. Thus requests DO reach the expected project API; this is an auth/API
rejection, not evidence of absent tenant admission. No 402 in supplied excerpt. Exact API key vs
JWT cause unconfirmed; no new client/email/role or repeated sign-in tests. Next inspect ONE failed
Student event for safe error fields (sb_error_code/error code/message), never header/token values.

Current provider clue: owner sees Supabase "Your grace period is over" banner, grace ended
18 Sep 2026, warning over-quota projects may return HTTP 402. This is NOT proof the organization
is currently restricted or that a 402 occurred. Supabase docs permit dashboard data access while
API requests are restricted, so passing SQL + browser failures is compatible with this hypothesis.
Next owner View usage read-only: identify plan, over-quota metric and any active restriction notice.
No upgrade/spend-cap/billing changes, deletions or database/auth mutations authorized by this clue.
Usage evidence supplied 2026-10-20: Free organization, cycle Sep20-Oct20; database18%, functions16%,
storage10%, egress10%, cached egress<1%, MAU<1%, realtime0. Only overage is Log Ingestion1.047/1GB
(105%) explicitly labelled Upcoming; log query0/100GB. No active restriction shown in supplied
usage. Official Supabase changelog discussion50925 (Sep25 announcement) states Upcoming log
meters are informational, no billing/enforcement during soft launch through early2027 for existing
organizations. Thus this shown log overage does not explain captured401/PGRST303; no evidence
supports upgrading to fix the incident. Generic prior grace banner may persist below quotas.
Return focus to JWT claims validation; do not conflate old grace warning with active restriction.
Earlier logs showed no entries; owner reports slow internet. No confirmed failed HTTP status yet.
Owner now supplied unified logs: API Gateway has entries, including health checks 200 and repeated
POST /rest/v1/rpc/claim_native_push_attempts HTTP 401 from node at one-minute intervals. Scheduled
DB cron runs shown completed. No Student context RPC or 402 is visible in supplied excerpt.
401 native-push is a separate concrete auth failure/shared-credential clue, not proof of Student
cause or quota restriction. Do not rotate keys or change ordinary worker/config from this excerpt.
Next filter Pathname for /rest/v1/rpc/my_student_enrollment_context, perform one existing-session
/clients Refresh requests, collect matching status/timestamp and sanitized error code/message.

1. PASS — 519320b source equality, owner push and Student Ready/Production confirmed.
2. PASS — owner opened requested /clients and pasted Customers and requests / Secure sign-in.
   Signed out. Final address-bar URL not separately pasted; no redirect inferred from this result.
3. PARTIAL PASS / LOAD FAILURE — owner supplied final https://school.eshapp.com/admin#,
   Enrollment administration, Signed in as ishmaelkosh@gmail.com, and "We could not load
   enrollment. Refresh or contact your program administrator." Email-link auth restored correct
   identity on expected /admin callback; enrollment-data load failed on restored source as well.
   This does not establish why data load failed or whether /clients can load; no browser/settings
   blame and no new email required. Earlier reported /school redirect not reproduced in this run.
4. AUTH SESSION PASS / ACCOUNT LOAD FAILURE — owner opened /clients and pasted Customers and
   requests, Signed in as ishmaelkosh@gmail.com, Operating business No account access, No requests
   yet, and "We could not load your account. Please refresh." Correct identity persists between
   /admin and /clients. Both page data loads fail on restored b75afc6 source (deployed 519320b).
   Do not claim source rollback restored access, nor infer requests deleted or roles removed.
   Enrollment/context failure vs downstream RLS/provider/config still unisolated.
   Next: owner-run context diagnostic tooling/sql/student-internal-context-diagnostic.sql in
   the Student Supabase project, to expose my_student_enrollment_context result/error for the
   actual internal UID. No account mutation/grants/migration or real sign-in email. Requires SQL
   Editor owner privileges; a single SELECT with materialized CTE sets transaction-local request
   UID/claims (auto-expire at statement transaction end) and returns account_found/context only.
   This checks identity/context function, not PostgREST grants/browser JWT validity. Owner ran
   query: account_found=true, valid personId string; ESH Education has canReview=true,
   canConfigure=true, enrollmentEnabled=true, canEnroll=false. Community Hub and THE REAL TEST
   have configure only and pilot disabled. Database reviewer admission is present; no role/email
   changes justified. SQL-owner context read succeeds; browser error remains unresolved.
   Owner confirmed authenticated EXECUTE privilege on my_student_enrollment_context() = true.
   Neither absent reviewer admission nor absent execute grant explains the observed failure.
   Still unverified: actual browser request status/response, browser JWT/project/config and
   downstream table reads. Do not claim SQL-owner result proves browser authorization success.
   Next: Supabase Logs/API Gateway read-only inspection, correlate ONE /clients Refresh requests
   action with /rest/v1/rpc/my_student_enrollment_context and subsequent table requests; collect
   only timestamp/path/status/error code, no headers/JWT/student payload. Avoid another DevTools loop.
   Never request tokens. User discussed clearer email aliases; no new identity was authorized
   or created, and aliases must not be substituted during this controlled test.
5. NOT STARTED — resume policy-save investigation only after internal access passes.
Guide ONE step per reply, record actual results and advance tracker; do not repeat completed
steps or attribute failures to the owner/browser without evidence. The older checkpoints below
are historical and superseded by this active test.

Current authorized objective (2026-10-17, owner GO): Internal Route Review and Recurring Schedule
Planning after partner review. Recovered baseline 351eca1, main/local origin aligned. Preserve
accepted geographic intake and unrelated generated Rider/Driver configs, preorder docs, assistant
files and unknown git/main. No Git/production mutation by Codex.

Local implementation complete: private canonical student/authority/requirements reviews,
versioned exact loading-point approval (curb/driveway/designated zone), configurable district
qualification policy, dedicated planning resource/evidence registry, explicit inbound/outbound
recurring drafts/calendar, server-road-proof planning approval and immutable dated manifests.
Hard locks check per-segment seating/equipment and attendant seats, full-term base/equipment
qualification dates, current reviewed reference versions and overlapping Student reservations.
Source withdrawal cancels future output. All templates/manifests remain planning-only, never
operationally ready. Manual evidence/dedicated-resource attestations do not establish ordinary-
product/global resource exclusivity or automatically verify district credentials. No notifications,
Driver execution, boarding/handoff, parent grants, payments or activation added.

Owner confirmed intended-only dry-run and successful remote application of
20261017000100_student_recurring_planning.sql. Do not reapply. Existing schema
and shared types extended additively; ordinary product handlers/tables remain unchanged. Existing
NEXT_STUDENT_SUPABASE_SECRET_KEY/public Mapbox configuration reused. No new environment variable.
94 Student/map and existing booking/checkout/Driver/workspace unit/API checks pass. Both actual
Student SQL harnesses pass expanded cases including three-student inbound/outbound segments,
school-bound policy, missing/equipment-specific/expiring credentials, stale reviews, self-review,
proof expiry, reservation/child conflicts, calendar/DST windows, revisions and source withdrawal.
Minimal legacy fixtures are not full deployed schema or true concurrency certification. Planning,
customer and enrollment browser flows pass with unchanged-key retry, compatibility, provider
recovery, approval failure preservation, immutable manifest/cancellation history and revoked clearing
at 320/414/desktop. Complete 414px screenshots and visible action footer inspected in ignored
tmp/student-planning-evidence. Student enabled build/lint/types and shared map/Supabase checks pass
with existing warnings. Initial ambiguous select labels corrected with explicit accessible names.
Final default-off production build (lint/types included), all 21 closed-shell screen/viewport
checks and scoped diff checks pass. No production data/provider/email call or Git/deployment action
was performed. The independent Student server configuration is unchanged.
Read architecture/student-recurring-planning.md and operations/student-recurring-planning-manual-test.md.
Next: owner performs scoped source commit/push, confirms Student Vercel Ready, then completes
internal planning manual acceptance. Source release is not yet confirmed. Local implementation/verification
are complete. Do not repeat accepted mapping checks or reapply existing migrations. Dedicated
resources are manually reviewed planning records; no actual Driver execution or live release.

### Accepted geographic milestone (previous checkpoint)

Current immediate checkpoint (2026-10-17): owner pushed label correction as 351eca1; main/local
origin aligned. Owner supplied successful three-student geographic request view with one shared
destination, separate pickup addresses, wheelchair-lift requirements on Students A/C and awaiting
review / ride not confirmed status. Older text-only request remains explicitly unverified and
withdrawn. This confirms the reported live intake result, not reload/internal-review/route-map
acceptance or full RLS/concurrency. Do not copy private submitted addresses/names into this handoff.
Owner then praised the displayed road map and reported PASS WITH FLYING COLOR after the requested
reload/reopen check. Saved customer request and road-preview reload acceptance are owner-confirmed
for that test; do not repeat them or infer broader school-site/permission/concurrency certification.
Owner responded BOOM to the internal staff request/requirements/road-preview checklist, accepted
as the reported internal-view pass. Owner subsequently reports withdrawing some requests and seeing
Withdrawn. Withdrawal visibility is accepted for those requests; exact IDs and whether every TEST
request was withdrawn were not supplied. Do not claim all test data cleaned up or deleted.
Current bounded geographic milestone has owner acceptance for reported customer submission,
saved route/reload, internal view and withdrawal visibility. Next: owner selects subsequent scope;
no further runtime implementation authorized. Do not repeat migrations or accepted manual checks.
No further implementation authorized by the reported success; keep Student operations closed.
Label correction local browser, inspected 414px screenshot, enabled/default-off production builds
(lint/types included) and diff checks passed. Hosted Ready was not separately supplied, but owner
is successfully using the live geographic intake. Existing generated/config/assistant work preserved.

Current objective (2026-10-16): owner returned partner approval to implement the bounded Student
geographic-request/map milestone, with accurate school loading context, legacy-unverified records,
per-student accommodation tags and immutable request history. Future architecture must follow
institutional recurring templates and compliance manifests, then gated assignment, individual
boarding/handoff and restricted parent tracking. No operational activation authorized.

Local implementation: Student-only authenticated address suggestions, permanent server geocoding,
precise match/accuracy checks, preferred provider routable point and separate address coordinates,
bounded gate/loading instructions, ordered actual multi-stop driving geometry with curb approaches,
interactive preview/recovery and saved-request preview. All stops remain safety-unreviewed; a
provider point/instruction is not an approved school gate. No optimization or compatibility filter.
Per-student wheelchair lift/booster/car seat/attendant tags capture requested equipment/staffing,
not diagnoses or verified IEP/compliance. Legacy text requests remain visible and unverified.
Private actor-bound server geography receipts prevent browser coordinate certification. New
submit RPC rechecks exact actor/customer/tenant, admission/expiry and serialized idempotent retries.

Owner supplied intended-only dry-run and successful application of migration
20261016000100_student_request_geography.sql. Do not reapply. Owner pushed application source as
15166fc; Student hosted Ready and live mapping acceptance remain pending. Adds
geography/requirements persistence and private immutable submission/withdrawal history; existing
records get explicit baseline snapshots, not invented old events. Requests cannot be edited/deleted;
correct by withdrawal/new request. Generic audit has counts/IDs only. History is database-enforced
append-only, not external WORM storage. No new notification or Student transport activation.
Owner requested a clear Student-specific Vercel key name after conflicting assistant instructions.
Owner clarified the final name is NEXT_STUDENT_SUPABASE_SECRET_KEY. Local follow-up reads only
that variable and explicitly maps it into the unchanged shared factory. Keep it; remove duplicate
STUDENT_SUPABASE_SECRET_KEY. NEXT_STUDENT is server-only, unlike NEXT_PUBLIC. No migration.
Owner pushed this follow-up as 87ac00e; Student Vercel Ready remains unconfirmed. Eight API checks and final Student
production build/lint/types pass. No keys inspected, Git mutation or production action by Codex.
Independent Student deployment now needs public Mapbox token and server-only NEXT_STUDENT_SUPABASE_SECRET_KEY
for receipt writes. Service credential is privileged across shared DB; never expose it publicly.
Thirty-minute receipt expiry is not deletion: actor-scoped opportunistic cleanup exists, inactive
receipt retention maintenance remains an owner procedure before real child data. No secrets read.

Verification complete locally: 48 Student/map unit/API checks and 32 existing booking/checkout/Driver/workspace
regressions pass; both actual Student SQL harnesses pass, including receipt actor/tenant denial,
forged receipt denial, tags, expiry/retry, immutable history and disabled operations. Minimal legacy
fixtures are not full deployed schema/concurrency certification. Student lint/types/build and shared
map/Supabase types pass. Enabled disposable-config customer and enrollment browser checks pass,
including actual rendered fixture road geometry, map/provider failure/retry, middle-row removal,
per-student tags, changed-loading-instruction invalidation and unchanged-key retry. Complete 414px
screenshots inspected under ignored tmp/student-customer-evidence. Final default-off production
build and all 21 closed-shell screen/viewport checks pass. No live provider/email or production
DB/role/booking/payment test was performed. Browser API/basemap/route fixtures are isolated.

Git release is owner-pushed 351eca1 (labels after secret-name follow-up 87ac00e), main/local origin aligned; last explicitly confirmed Student Ready was
e2fb5e1. Owner previously applied
20261015000400, confirmed Student Ready and /school callback, and demonstrated customer access and
successful two-student text request. Do not reapply existing migrations or repeat preregistration.
No Git mutation, deployment or production DB command performed by Codex. Existing generated Rider/
Driver configs, preorder docs, assistant work and unknown git/main remain preserved.

Next: owner keeps NEXT_STUDENT_SUPABASE_SECRET_KEY, removes duplicate STUDENT_SUPABASE_SECRET_KEY,
confirms independent Student server variables and Student Vercel Ready at 87ac00e,
then performs controlled TEST address/route acceptance. Source push and migration are complete.
Owner handles all Git/deployment/database mutations and independent Student server configuration.
Then actual provider/street geometry and school-site loading-point manual acceptance. Keep ordinary
apps, auth callbacks, dispatch/payment/native behavior and Student activation guards intact.
Read architecture/student-geographic-requests.md and operations/student-geographic-requests-manual-test.md.
The earlier isolation review is architecture/student-isolation-review.md. No real minors' data until
privacy, authority, retention/deletion and incident procedures are approved.


### Historical Student checkpoint (superseded by the current role correction)

Current operational checkpoint: owner pushed Student implementation at 843cbab and deployed the
independent Vercel project, renamed esh-platform-student-transportation, in the existing Pro team.
Owner verified root apps/student-transportation, school.eshapp.com valid Production DNS and the
live home/admin sign-in screens. Public Supabase config and enrollment flag were owner-entered.
Both Student migrations are owner-confirmed applied. Callback allowlist was instructed; its save
and successful email return have not been confirmed. Owner authorized the governance correction below.
Owner's real verified account has active memberships in two unrelated tenants but no platform role.
Owner created separate ESH Education through existing /platform password sign-in/provisioning,
accepted the real account's invitation and confirms owner membership verified. Product launcher
shows ESH Education with no operational products, which is expected. Do not enable unrelated
products or silently grant platform-wide administration. Student /admin configuration RPCs require
platform governance membership, so organization ownership alone cannot configure the pilot.
Owner rejected manual SQL setup as inconsistent with normal tenant ownership. One pasted script
failed syntax due missing OR; no successful setup execution confirmed. Script is now marked
superseded and retained untracked; do NOT instruct owner to run it or recreate ownership.
Implemented proper correction: migration 20261015000100_student_enrollment_owner_governance.sql
adds a verified, active, tenant-scoped governance helper using has_foundation_tenant_role and
updates both governance RPCs plus context canConfigure. Existing tenant owners can configure
enrollment through the UI without a platform role. No implicit reviewer/child access. UI states
selected organization scope and explicit reviewer requirement; governance form labels clarified.
SQL regressions pass owner/no-global-role setup, cross-tenant denial, explicit reviewer gating,
expired/suspended/unverified owner denial and existing guardian/privacy/lifecycle cases. Enabled
test build and browser owner enable/reviewer-grant flow pass. Lint/shared types pass.
Owner confirmed migration 20261015000100 applied successfully. Dry-run output was not supplied
in this latest message; successful db-push output was. Next owner commits/pushes scoped fix; existing deployed UI already
supports the server-returned canConfigure flag, so DB correction unlocks controls even before
the new explanatory UI copy deploys. Final default-off production build and diff/format checks
passed; previous local preview session 34733 stopped for verification and is not running. No
production calls, role grants, SQL setup, staging or deployment were executed by Codex.
No live role/tenant mutations were executed by Codex. Existing assistant/docs/config/git/main preserved.

### Implementation and validation checkpoint

Active objective: owner approved guardian enrollment (GO) after the independent Student foundation.
Implemented locally in apps/student-transportation: separately gated guardian/admin email sign-in,
explicit enrollment admission, multiple children, proposed contacts, saved drafts, submission,
withdrawal, reviewer approval/rejection, feedback and corrected resubmission. No student rides,
routes, native releases, payment, notifications or verified physical handoff have been implemented.
Owner confirmed successful remote application of migrations 20261014000100 and 20261014000200
after the dry run listed exactly those two files. The former keeps
product operations disabled; the latter adds default-off prelaunch enrollment with explicit access.
Platform governance can enable enrollment/admit existing active tenant members, but must explicitly
admit itself as reviewer to read children. Guardian admission does not grant general product access
or legal-guardianship verification. Guardian self-service does not take an operational lease.
Existing operational product union/governance menus and ordinary booking flows remain unchanged.
No populated env files were opened/copied, no auth URLs/provider settings altered and no Git or
production commands performed. Existing uncommitted assistant/docs/config/git/main preserved.

Validation: isolated PGlite checks pass for both migrations, actual existing identity/membership
helpers, RLS cross-family/tenant denial, contacts, idempotency, rollback, review/resubmission,
revocation/pause/suspension/unverified identities and unchanged disabled transport operations.
Harness uses minimal legacy schema, not full deployed integration or concurrent sessions.
Eight unit tests pass (two enrollment parser/blank-state tests and six existing workspace tests).
Student app lint/type checks, shared Supabase typecheck and enabled test-config build passed.
Browser checks with disposable intercepted API fixtures passed sign-in URL/create-user=false,
contacts, unchanged-ID failed-save retry, draft reload, submission, rejection/resubmission/withdrawal,
revoked-access clearing and local sign-out; mobile/compact/desktop screenshots are under ignored
tmp/student-enrollment-evidence. Full 414px form inspected. These do not prove SMTP/native behavior.
The grade selector's accessible label was corrected after a browser check exposed the issue.
Final default-off production build, 12 closed-shell screen/viewport checks, formatting and diff
checks passed. Test-config enabled build was replaced with default-off output. Preview restored
at http://127.0.0.1:3006; previous session 59942 stopped for builds. Actual enrollment preview needs
independent configuration/migrations/admission; screenshots show disposable browser test data only.

Next: owner commits/pushes the Student app, then creates a separate Vercel project in the existing
Pro team with root apps/student-transportation and proposed domain school.eshapp.com. No Vercel
project/domain has been created or verified. Configure independent public environment/auth URLs
after deployment; do not replace existing app callbacks. Mixed roadmap/handoff changes include
earlier assistant work and should not be broadly staged with this product commit.
Read architecture/student-guardian-enrollment.md and operations/student-guardian-enrollment-manual-test.md. Do not collect
real minors' data until privacy notices, authority review and retention/deletion procedures are approved.
No automatic retention or invitation emails. Existing verified ESH identities/memberships only.
Later: schools and geographic transportation requests/schedules, then dedicated-resource routes and
individual handoff/eligibility. Cross-product reservation conflicts must be solved before sharing
live drivers/vehicles. Remote assistant hosting remains deferred. Existing app runtime/styles intact.

### Previous local-assistant checkpoint

Current checkpoint: owner authorized future local model file-editing capability, explicitly not
an application change. Latest capability-test weakness fix rejects malformed CSS hex colors at
draft/new-file/apply preflight and checks positive selector targets, with a narrow known Rider
booking-gradient mapping. Tests use isolated fixtures; no Rider styling is applied. Final checks
pass: 29 unit checks, syntax/format/diff checks and isolated mobile/desktop approval UI.
Server restarted as session 71082 at http://127.0.0.1:4317; prior session 11441 stopped and old
review approvals expired with it. No live-model retry was performed for this follow-up; deterministic
regressions cover the observed malformed color and wrong selector. Broader CSS correctness and model
interpretation remain review responsibilities. The owner is testing tools, not asking to recolor UI.

Earlier capability checkpoint: owner authorized future local model file-editing capability, explicitly not
an application change or example color modification. Completed `draft_new_file`, owner-reviewed
local apply UI/API, protected editable scope, batch conflict checks, backups/recovery, and exact
per-file Git commands plus suggested checks. Model tools cannot approve writes, run Git, deploy
or mutate a database. Existing migrations/config/native/tool policy remain protected.
25 unit checks pass. Mobile/desktop approval UI passes with HTTP apply intercepted into an isolated
cache fixture; no actual application/doc feature file was created or edited during verification.
Syntax/format checks and git diff --check pass. No live model-generated feature implementation was
tested. Server session 11441 runs http://127.0.0.1:4317. Refresh browser for new capability.
Future workflow: ask for change, inspect drafts, explicitly approve local preparation, run suggested
checks and supplied Git commands yourself. Nothing needs production deployment for this local tool.
Preserve generated configs and unknown git/main. No Git mutations performed. Read updated local
assistant architecture/operations docs. Transportation audit remains the future app-work handoff.

### Earlier checkpoints (superseded where they describe no apply capability or old server sessions)

Current completed fix: owner reported prose-only answer to explicit draft_patch request (owner fix it).
Tool completion is now enforced from actual trace/results, not model prose. Named draft requests
require a successful same-file read before a validated draft. Prose-only results get bounded retries;
missing required results produce authoritative incomplete status and suppress pretend completion.
Explicit execution requests with tools disabled receive an enable-tools error; source-search-only
remains usable. UI distinguishes incomplete requests and received tool results. No edit/apply tool.
16 unit checks pass, including false-success suppression, intent exclusions and retry-to-real-draft.
Owner's exact original natural-language prompt passes real-Qwen regression: actual read_file and
draft_patch traces, one validated draft/applied:false, unchanged Rider CSS hash. All fixed diagnostic
checks and mobile/desktop tool UI/model gating pass. Syntax/format/diff checks pass. No app runtime,
styles, schema, dependency, production or Git changes. All earlier local work/config/git/main preserved.
Final local server is running as session 15822 at http://127.0.0.1:4317; previous sessions stopped.
Next: owner refreshes browser and repeats original draft request; expect the separate
BEFORE/PROPOSED draft card. If model cannot
complete within bounds, it must explicitly say Tool request incomplete. No deployment/push needed.

Completed authorized objective: add offline local tools to ESH assistant (owner ADD TOOLS).
Implemented restricted Qwen tool calling: search_code, read_file, run_check and draft_patch. No
arbitrary shell/apply-edit, Git mutation, deployment or database tools. Software enforces current
indexed-file/root/symlink boundaries, strict argument names/types, fixed Node executable/check
args, minimal nonsecret child env, 60s diagnostic timeout and bounded outputs. Drafts require one
exact current match and expose before/after/hash/applied:false without writing source or drafts.
At most six calls/four rounds, sequential. Tool results/diagnostics get citations and visible trace;
UI defaults tools on for Qwen and disables them for Gemma. Ordinary RAG/search-only remain available.
13 synthetic/process unit checks pass, covering protected paths, stale/ambiguous drafts, no-write
hash, unknown commands/args and bounded loop. Real Qwen successfully searched, read and drafted;
Rider CSS hash was unchanged. Mobile/desktop tool-result UI and model gating passed in first run.
Final run also confirms assistant-unit and maps-unit fixed diagnostics pass; syntax, formatting
and diff checks pass. Final real-model/UI rerun passes; complete mobile/desktop screenshots retained
under ignored tmp/esh-assistant-evidence/tools-*.png and mobile evidence inspected. No app runtime/design/schema/dependency,
production, Git or native change. All existing uncommitted work preserved, including configs/git/main.
Local server session 59410 runs http://127.0.0.1:4317; old local sessions stopped. Next owner refreshes
and tries “Use run_check to run assistant-syntax”. No deployment or push needed for local use.
Read architecture/local-esh-assistant.md and operations/local-esh-assistant-manual-test.md. Tools
remain local and need installed Ollama/dependencies, not a hosted model or production connection.
Actual local source editing is NOT included; owner reviews drafts through existing development flow.

Completed follow-up: improve local assistant styling answers (owner GO/CONTINUE). Earlier allowlist
omitted CSS, so the model correctly lacked styling evidence but then misselected a home-map rule
after basic CSS indexing. Now approved tracked app/shared CSS is indexed; styling retrieval scopes
to the named product, focuses the target before "without affecting", expands panel/sheet and
background/gradient, traces JSX wrappers/literal classes back to CSS, and allows three stylesheet
passages. This retrieves the actual ride-sheet-backdrop::before booking gradient plus component
evidence. No Rider/Driver/Admin production runtime/style changes. No new dependencies/migration.
Seven unit checks and eight real-repository retrieval cases pass; strengthened styling case
requires actual booking gradient and JSX evidence, not merely a styles.css path. Real-Qwen styling
regression identifies correct file/selector; final prompt also preserves gradient direction/alpha
for color-only proposals and requires them to be described as unverified suggestions.
Index now ~544 files/2736 passages. Local server session 96454 is running at the same
http://127.0.0.1:4317; earlier local server sessions are stopped. Syntax/format/diff checks pass.
Final real-model answer identifies transparent sheet/card and actual booking-gradient selector/file;
it did not emit the requested minimal proposed declaration despite prompt guidance. Treat editing
advice as advisory, not a validated patch or proof of visual isolation. No styling proposal was
applied or visually tested. Next: owner refreshes assistant and retries styling question; bring
proposed changes back for implementation review. Retrieval and cited-source regression pass.
No application CSS was changed, so no app build/mobile rebuild or production deployment required.
Preserve earlier docs/tool changes, generated configs and unknown git/main. Future app work resumes
from transportation-roadmap-reconciliation.md, not an automatic background-location implementation.

Current authorized objective (owner GO): local read-only ESH knowledge assistant, separate from
production apps. Implemented tooling/esh-assistant with Node built-ins, local browser UI on
127.0.0.1:4317, Ollama only on 127.0.0.1:11434, tracked-file allowlist/redaction, line citations,
keyword/semantic ranking, content-hash reuse and rescan before answers. No new dependencies,
model downloads, env files, database/tenant/auth/runtime changes or production/Git mutation.
Owner machine has ~16GB RAM, NVIDIA RTX 5070 Laptop/AMD graphics and installed gemma3:4b,
qwen3.5:9b, nomic-embed-text:latest. Qwen is default after real-answer comparison; Gemma remains
the lighter alternative. No hardware configuration changed. Index snapshot: 539 files/~2631
passages; semantic embeddings generated locally in ignored .cache/esh-assistant/index.json.
Five unit checks, six real-repository hybrid retrieval checks, syntax/format and browser checks
pass. Final default-Qwen answer correctly explains average/disclosure; initial Gemma answer
misstated a seven-day rule, prompting tighter evidence instructions and the default change.
Citations do not certify model correctness; inspect evidence. Desktop/mobile complete screenshots
inspected in ignored tmp/esh-assistant-evidence. HTTP checks cover foreign Origin, unknown source
ID/path and disallowed model; mobile width/source expansion/search-only/real generation pass.
Read architecture/local-esh-assistant.md and
operations/local-esh-assistant-manual-test.md. New untracked source/docs are intentionally excluded
from knowledge until owner tracks them. No chat-history persistence or tool execution capability.
Local server left running at http://127.0.0.1:4317 (session 49734); if stopped, run
node tooling/esh-assistant/server.mjs from repo root in Windows, with Windows Ollama running.
Current correction: owner reported preorder explanation implying automatic rebooking. Source review
confirms separate cancelBooking/bookAgain actions. Driver Preorders architecture now explicitly
states cancellation never auto-rebooks and optional replacement requires fresh confirmation; its
old pending-release label is reconciled to a5223dd/65b7ae3 owner acceptance. Assistant prompt now
preserves actor/manual/optional/automatic causality and asks for decisive quotations when needed.
Owner subsequently authorized correction of offer-time/release imprecision. Actual migration
confirms offer expires_at is creation time plus configured timeout (90s fallback); readiness starts
the process, not an instantaneous acceptance deadline. Future reservation release queues possible
availability announcements, not an immediate timed offer. Knowledge document now states both.
All seven retrieval checks and three real-Qwen answer regressions pass, including original
no-auto-rebooking case; outputs inspected. Five unit checks, formatting and diff checks pass.
Local semantic index refreshed; owner can ask again at the same localhost URL. No product code,
database, native, production, dependencies or Git mutations. Evaluation regexes are limited checks,
not an entailment guarantee for all questions/responses.
Five unit checks, seven retrieval cases and real-model cancellation regression pass; answer
correctly states no automatic replacement and quotes corrected evidence. Syntax/format/diff checks
pass. Broad preorder retest initially added an unsupported post-cancellation retry claim. After
refreshing changed-document semantic vectors and limiting unsolicited detail/test-scenario
inferences, the final broad answer no longer invents automatic replacement. This is a targeted
correction, not certification of every generated sentence. No app runtime behavior changed.
Local server restarted as session 31385 at the same address; ~2632 passages embedded. Prior
sessions 49734/11734 are stopped. Rescan still updates source text on every question; explicit
semantic refresh improves ranking of changed documentation. Next: owner refreshes UI and asks
again. RAG reduces rather than
eliminates model interpretation errors. No push/deployment needed for local use.
Preserve existing generated configs, unknown git/main and the earlier documentation audit edits.

Owner-designated future app-work resume point (2026-10-14): the Transportation roadmap reconciliation below.
Return to its verified gaps later; no new feature implementation authorized now. Current objective
is manual testing of existing Rider/Driver/Admin functionality. Await owner test observations;
do not infer passes, create production bookings/payments, or enable background tracking. Preserve
approved designs, existing coverage and completed feature acceptance. Use identifiable test data,
cancel unfinished bookings, return test Drivers Offline and restore temporary settings afterward.
Next: guide owner through current app checks and record actual results/issues as supplied.

Completed authorized audit: reconcile discussed Transportation roadmap gaps against implementation
and owner acceptance (owner GO). See architecture/transportation-roadmap-reconciliation.md.
Native push, financial core/refunds/reconciliation, assigned averages and native shell delivery
must not be proposed as unimplemented. No runtime work, new migration, Git or production mutation.
Confirmed meaningful candidate: Driver background/locked-phone coordinate publishing is not
integrated; foreground watchPosition is the current ESH submission path. SMS carrier/STOP callbacks
and advanced partial-refund/manual-payout cases remain deferred; remote provider readiness and
financial production acceptance were not inspected. Owner explicitly defers custom boundaries and
adjustable reminders. Next: owner selects work, or controlled physical background-location check;
no native implementation authorized. Roadmap/docs-only diff; no application checks rerun.

Completed objective: visually widen/shrink service-area circles (owner GO/CONTINUE).
Owner pushed 403212e and reports PASS for visual resizing. Polygon boundaries and adjustable
reminders are deferred by owner. Preserve circles; no feature expansion authorized.
Baseline Edit discoverability fix is pushed at 543b334. Local draggable 44px edge handle renders
a dashed unsaved radius preview; spherical distance is rounded/clamped to existing 0.01–1000km.
Keyboard arrows/Shift/Home/End supported. Saved circle stays distinct. Explicit Save coverage
uses the existing form/Settings endpoint with tenant authorization/validation/audit unchanged;
Cancel discards, pending controls disable, failure retains draft. No schema, native, domain,
booking/dispatch or approved Rider/Driver runtime change. No production/Git mutation by Codex.
18 map unit tests and scoped lint pass. Mobile coverage browser check passes actual pointer drag,
keyboard limits, no autosave, failed save/draft recovery, Cancel, successful save/summary refresh,
unchanged center/coverage-mode/tenant payload, existing map interaction/fallback and form Edit.
Final Admin/Transportation production builds, shared maps types and scoped lint pass with existing
warnings. Complete 414 x 896 fixture screenshot inspected and retained in ignored
tmp/service-area-resize-evidence/resize-414.png. Next: exact feature-only Git handover, owner hosted
deployment and physical touch acceptance. Browser basemap is isolated; no production writes.
Preserve generated Driver/Rider configs and unknown git/main. No migration or native rebuild.

Previous completed objective: fix Service area Edit discoverability (owner reports no actionable
feature, then CONTINUE). Owner now confirms Dallas/Philadelphia circles visible and reports PASS
at 23cd1e6; original missing-map report is resolved without a source/config/domain change.
Inspection confirms Edit opened the existing form above the map without bringing it into view.
Local fix scrolls/focuses its saved Radius field on edit and names the area in a full-width heading.
No save semantics, permission, boundary, map behavior, endpoint or Rider/Driver change.
Coverage browser check passes: desktop/mobile field focus and viewport, 414 x 896 Save visibility,
saved 25km value, optional unsaved 35km entry and cancellation with no Settings mutation.
Complete mobile edit screenshot inspected and retained in ignored tmp/service-area-map-evidence.
Scoped lint and final Admin/Transportation production builds pass with existing warnings.
Next: exact feature-only Git handover, owner hosted release and manual Edit/radius-save acceptance.
No migration/native rebuild. No production radius was changed during local verification.
Read architecture/service-area-coverage-map.md and operations/service-area-coverage-map-manual-test.md.
Preserve generated configs, unknown git/main and acceptance docs; no production/Git mutation by Codex.

Previous implementation checkpoint: show existing coverage circles on a live Admin Service areas map
(owner go). This is visualization of saved center/radius rules, not new polygon coverage. Local
ServiceAreaMap uses existing Mapbox/public configuration, geographic 6371km/128-segment circles,
navy active/gray inactive and selection fitting one/all saved areas. Existing authorized summary
only; no GPS, mutation, schema, RPC, booking/dispatch or Rider/Driver runtime change. Saved forms
remain intact. Missing provider/config has a readable fallback. No migration or native rebuild.
Local verification complete: all 17 map unit tests, shared maps types, scoped lint and final coverage
browser check pass. The browser check exercises selection, real SDK drag/zoom, attribution, 414px/
320px/desktop sizing, existing Edit values without writes, provider failure and explicit Retry.
Initial checks found an ambiguous selector label, fixture attribution omission and compact selector
overflow; corrected and final rerun passed. Resize refits saved boundaries. Final Admin and
Transportation production builds pass with existing warnings; Transportation used nonsecret fixture
process env only, no populated env-file edits. Complete mobile/desktop screenshots inspected and
retained under ignored tmp/service-area-map-evidence. Browser basemap is isolated: production real
streets/config/network and actual-company circles remain owner acceptance. Next: exact feature-only
Git handover, owner push, Admin/Transportation Ready and controlled visual acceptance. No migration
or native rebuild. No Git/deployment/production mutation by Codex.
Read architecture/service-area-coverage-map.md and operations/service-area-coverage-map-manual-test.md.
Preserve generated configs, unknown git/main and prior acceptance docs. No Git/production mutation.

Completed objective: assigned Rider average/count beside Rider photo in Driver (owner go,
then continue). Owner confirms Rider-side Driver rating/photo visible at 511d0e1; Rider photo slot
in Driver works but this account has not uploaded a real photo. Do not change approved Rider runtime.
Local 20261013000400_assigned_rider_rating.sql appends riderRatingSummary only to actual active-trip
my_driver_dispatch projection, through a private helper. Active current Driver/tenant/person/Rider
ownership; same tenant/profile disclosed, non-hidden completed Driver overall scores. No general
Rider lookup, other Drivers' historical details, offer/preorder/history exposure or matching effect.
Driver photo/name shows mean/count; confirmed zero is Not yet rated, unavailable/invalid is Rating
unavailable. Existing dispatch snapshot/refresh supplies assignment and summary together. No new
request/timer/cache/auth/payment/notification/native behavior. Owner supplied successful application
of migration 20261013000400; do not reapply it.
Local verification complete: minimal actual-dispatch/reputation SQL, both rating-label validation
tests, scoped Driver lint and all 37 Driver mobile checks pass. Final Driver production build/types
pass with existing warnings. Complete 414 x 896 photo and initials-fallback screenshots inspected
and retained under ignored tmp/assigned-rider-rating-evidence; 320px overflow, refresh, passenger
change, missing/invalid vs confirmed zero and active lifecycle removal are checked. Rider runtime
is unchanged. Physical-device/real-account and full Supabase/concurrency acceptance remain owner
work beyond the reported acceptance. Owner pushed 938e078 and reports pass for the Rider rating
display in Driver Active trip. Do not repeat migration or feature staging. Next: select the next
roadmap item; no additional implementation authorized. This acceptance documentation remains local
for a future owner commit. No native rebuild or new environment variable.
Read architecture/assigned-rider-rating.md and operations/assigned-rider-rating-manual-test.md.
Preserve generated configs, unknown git/main and earlier acceptance docs. No production/Git mutation
by Codex. Owner now reports pass for Share my trip after locating its controls in Rider Active trip.
The pending sharing acceptance checkpoint is closed for the reported test; do not infer additional
security/concurrency scenarios were exercised. Student service remains brainstorming.

Completed objective: assigned Driver average/count in Rider (owner said go, then continue).
Local additive 20261013000300_assigned_driver_rating.sql appends ratingSummary to the actual owned
portal Driver projection through a private non-client-callable aggregate helper. Active ownership/
tenant/assignment only; disclosed, non-hidden completed Rider overall scores, same tenant/profile,
all-time mean rounded to two decimals. No raw historical data, general Driver lookup or Driver app
change. Home/Current trip put it beside photo/name; confirmed zero is Not yet rated, missing/invalid
is Rating unavailable. Existing portal refresh supplies assignment and summary together; no new
timer, request, cache, auth/payment/matching/notification/native change. Owner supplied successful
application of migration 20261013000300; do not reapply it.
Local verification complete: minimal actual-portal/reputation SQL ownership/disclosure/moderation/
count/lifecycle smoke (including final active-only projection) and label validation test pass. All
39 Rider mobile checks pass, including refresh/reassignment, photo fallback, unavailable vs zero,
active lifecycle and 320px overflow. Scoped lint and Rider production build/types pass with existing
warnings. Complete 414 x 896 Home/Current screenshots inspected and retained under ignored
tmp/assigned-driver-rating-evidence. Physical-device/real-account and full Supabase/concurrency
acceptance remain owner work beyond reported checks. Owner pushed 511d0e1 and confirms Driver
rating/photo visible in Rider. No native rebuild or new environment variable.
Read architecture/assigned-driver-rating.md and operations/assigned-driver-rating-manual-test.md.
Preserve generated configs, unknown git/main and previous acceptance documentation. No Git or
production mutation by Codex. Share-my-trip physical acceptance remains pending; Student service
remains brainstorming only.

Completed objective: received-rating and review-decision notifications (owner said GO).
New local 20261013000200_rating_update_notifications.sql reuses outbox/native attempts and current
Admin minute worker. No historical sweep. One generic recipient-owned event per rating/appeal;
received scores wait for mutual submission or seven days; decisions go only to requester. Existing
email/device preferences, tenant/person/profile ownership, moderation and session checks remain.
Alerts contain no score/comment/reason/decision text. New validated routing intent focuses the
received-rating/decision details rather than the submission form; old reminder links are preserved.
No new native build, credential, cron, booking/payment/dispatch/auth change. Owner supplied successful
application of migration 20261013000200; do not reapply it.
Local verification complete: minimal actual-migration SQL smoke and all 49 notification/link tests
pass. Scoped lint passes with existing Rider image warning. Rider initial suite passed all 37 existing
checks; new alert test reached correct rating/decision then failed on a multi-element test selector.
After selector-only correction, focused Rider alert test passes. All 36 Driver browser checks pass.
All 74 distinct mobile checks pass across runs, including exact received/decision focus, unknown
targets and 320px overflow. Initial Rider build caught an exact-optional-prop type; corrected.
Final Admin, Rider and Driver production builds pass with existing warnings. All four complete
414 x 896 received/decision screenshots inspected and retained in ignored tmp/rating-update-evidence.
Physical delivery, real-account RLS, seven-day natural timing and full Supabase/concurrency remain
owner acceptance. Owner pushed source as 3b7a905; supplied Git output confirms main/origin alignment.
Owner reports RATING ALERT PASS and then pass for the review-decision receipt/tap check.
Both notification acceptance checks are complete for the reported tests at owner-pushed 3b7a905.
Assigned Driver average/count is now authorized and in progress above. Do not reapply the migration
or repeat source staging. Release-status documentation remains local for a future owner commit.
No production/Git mutation by Codex.
See architecture/rating-update-notifications.md and operations/rating-update-notifications-manual-test.md.
Preserve generated configs, unknown git/main and earlier local acceptance documentation.

Completed objective: connect ratings and review controls to their completed trips after
owner reported that ratings were detached and no review action was visible. Owner applied
20261013000100_rating_appeal_review.sql and pushed the original feature as 5d1a5c3.
Owner-pushed e989965 follow-up puts participant, own score, disclosed received score, Request rating review,
and review decisions on Rider completed-trip history and Driver Recent orders cards. Rider's
separate ratings section remains only for trips outside loaded completed history. No received
rating means an explicit disclosure explanation, not a review of one's own submitted score.
Existing removed-rating decisions take precedence over that explanation. No backend/schema,
notification, native shell or permission changes. Preserve generated configs and unknown git/main.
Verification complete: 36/37 initial Rider checks passed; tracking encountered a client exception
during that run. Its isolated rerun passes unchanged; the initial cause is not proven. Final focused
Rider review passes; all 35 Driver mobile checks, scoped lint and both production builds pass with
existing warnings. All 72 distinct mobile checks are covered across runs. Integrated 414 x 896
screenshots inspected and retained in ignored tmp/rating-review-unified-evidence; review checks
also verify 320px overflow and removed-decision state without a misleading waiting explanation.
Owner reports TEST PASSED for the integrated trip/rating review follow-up. Git confirms main and
origin/main aligned at e989965. Acceptance is recorded for the reported test, not an inference that
every physical-keyboard or authorization scenario was exercised. No new migration or native rebuild.
Next: select the next roadmap item; do not reopen accepted rating-card work. This acceptance-only
documentation update remains local until included in a future owner commit.
Trip-sharing physical acceptance remains pending; Student Transportation remains brainstorming.

Previous appeal implementation checkpoint (deployment claims superseded above):
Original authorized objective: complete existing rating appeals (owner said I WOULD SAY GO).
Inspection found 20260815000500 backend foundations and client types but no Rider/Driver/Admin UI.
Local additive 20261013000100_rating_appeal_review.sql hardens active tenant/person/profile and role
ownership, received-rating disclosure, retry idempotence and Admin decision conflicts; adds bounded
Admin queue. No rating windows/disclosure/payment/dispatch/notification changes. Rider/Driver ratings
screens now have request/status/explanation components; Admin Reputation has review queue.
Local implementation and verification are complete. Actual old reputation/appeal plus new migration
pass minimal PostgreSQL ownership/disclosure/role/tenant/RLS/idempotence/decision/audit smoke. Two
strict parser tests and shared types/scoped lint pass. Initial browser suites passed 36 Rider and
34 Driver checks; the new review checks stopped on a broad alert selector matching Next's announcer.
After test-only correction, focused Rider and Driver review checks pass, including failed-load and
failed-submit draft preservation, removed-rating privacy and decision reload. Both Admin mobile
review tests pass (keep/remove, failed-save notes preserved, confirmed decisions and compact width).
All 74 browser checks pass across initial/focused runs. Rider, Driver, Admin and Transportation
production builds pass with existing warnings. Transportation first lacked local public config;
rerun used nonsecret fixture process env only, no populated environment file edits. Complete 414 x
896 screenshots inspected and retained under ignored tmp/rating-review-evidence; 320px checks pass.
Physical keyboard, real-account RLS and full Supabase-chain/concurrency acceptance remain owner work.
Migration 20261013000100 is owner-applied; original source is owner-pushed as 5d1a5c3.
Hosted readiness and controlled request/decision acceptance are separate owner checks. No native build,
secret or new notification event. No Git or production mutations by Codex.
Trip sharing migration 20261012000100 is owner-applied and source owner-pushed as 286000b; manual
mobile acceptance is pending until owner can test at home. Do not mark it passed or reapply.
Student Transportation remains brainstorming: independent service in existing repo, separate data/
permissions/deployments, reuse shared foundations and shared resource guard if fleet is shared.
Owner has a saved future architecture prompt; NO implementation authorized. Keep separate from appeals.
Preserve generated Driver/Rider tsconfig edits and unexpected git/main files.

Previous objective: optional trusted-contact Share my trip. No previous public sharing
implementation was found. New local migration 20261012000100 adds private hash-only link storage,
owned create/status/revoke, service-only minimal status/location projection and lifecycle cleanup.
Rider Current trip has progressive explicit share/copy/replacement/stop controls; unauthenticated
fragment-token page uses existing real map only for fresh consented Driver coordinates. Four-hour
expiry, terminal/reassignment invalidation and no person/address/photo/payment/message disclosure.
Driver change is only existing location-sharing explanation of trusted-contact visibility and stop.
Local minimal PostgreSQL ownership/RLS/freshness/consent/expiry/replacement/cancellation/completion/
reassignment smoke and nine unit/API tests pass. Browser suite: 35 passed initially; recipient map
import failure corrected to the existing client module. Final three sharing checks pass after the
map was contained below the heading (caught by screenshot inspection). This covers all 36 checks
across runs, including the existing booking/payment/auth regressions. Shared types, scoped lint and
final Rider/Driver production builds pass with existing warnings. Complete 414 x 896 Rider controls
and recipient screenshots inspected and retained in ignored tmp/trip-share-evidence; recipient 320px
overflow, stale-coordinate removal, transient recovery, invalid/ended tokens and owner failed-stop/
reload/replacement state are checked. Physical Web Share and full Supabase/concurrency remain owner
acceptance. Migration NOT applied; nothing pushed/deployed by Codex.
Next: finish verification, owner intended-only dry run/apply, exact scoped Git commands and release,
then controlled real-device acceptance. Read architecture/trip-share-links.md and its manual test.
No new secret, cron, native build or notification event. Preserve generated configs and git/main.

Pickup identification is owner-pushed 0297b3c and owner device-accepted (test pass).
Previous objective: clearer Rider pickup identification using existing assignment data.
Inspection confirmed photo/name already in tracking and vehicle details elsewhere. Local refinement
groups them in Home/Current trip tracking with prominent license plate and unavailable-data fallback;
duplicate Current trip vehicle line is removed. Existing Trips assignment, 88px private-photo rules,
booking, auth, dispatch and Driver app are preserved. All 33 Rider mobile checks pass. Final focused
pickup check passes after a test-only Back-button accessible-label correction and compact Home
height limit: 414 x 896 Home/Current screenshots, 320px overflow and Home bottom-panel separation,
missing/broken photo, missing vehicle, arrival/start and completion removal. Scoped lint and final
production Rider build/types pass with existing warnings. Screenshots inspected and retained under
ignored tmp/pickup-identification-evidence. Physical-device acceptance remains owner work.
No new migration, native build, credential or backend change for identification; owner release and
device check passed at 0297b3c. No production/Git mutation by Codex.

Driver inline passenger ratings are owner-pushed as 3b971dd and owner device-accepted (pass).
Previous objective: bring the same inline rating access to Driver Recent orders.
Local DriverTripRating reuses the existing owned Driver submission RPC and detailed criteria;
DriverSupportHistory embeds it only on completed cards with owned reputation data. Ratings screen
reuses the same form; reminder links keep their existing target and open the form. Recent orders
shows submission feedback and saved score. Rider runtime is preserved.
Verification: 33 existing Driver mobile checks passed; the new inline test initially timed out on
an overly specific label selector. After correction, both focused rating checks pass, including
failed-submit preservation/retry, actual criteria payload, saved-score reload, cancelled-card
exclusion, reminder submitted/expired/unknown targets and 320px overflow. Scoped lint and Driver
production build/types pass with existing Supabase/Next warnings. Complete 414 x 896 screenshot
inspected and preserved under ignored tmp/driver-inline-rating-evidence. Browser fixtures do not
certify physical keyboards or real-account submissions.
No new migration, native build or secret. Owner release/device acceptance complete at 3b971dd.
Preserve generated configs and unknown git/main files. No Git or production mutation by Codex.

Previous Rider inline ratings are owner-pushed as 815f364 and device-accepted (owner said pass).
Do not reopen or repush that completed feature.
Previous objective: make Rider ratings directly accessible on completed-trip cards.
Owner found the separate collapsed Post-trip ratings form difficult to discover and approved an
inline Rate your driver action, star selection, optional comment and saved-score confirmation.
Local UI reuses the existing owned submission RPC, detailed criteria, windows and disclosure rules.
Each trip has one form; reminder targets reveal history and focus/open that form. Driver is unchanged.
All 33 Rider mobile checks pass, including inline submission failure/retry and saved-score reload.
Final two focused rating checks pass after compact criteria/navy styling. Scoped lint and Rider
production build (including types) pass with existing Supabase/Next/image warnings only.
Complete 414 x 896 screenshot inspected and retained in ignored tmp/inline-rating-evidence;
320px overflow check passes. Fixtures do not certify physical keyboard or production submissions.
No new migration, native build, secret or production mutation required.
Rider owner release and completed-trip device acceptance are complete at 815f364.
Preserve four generated next-env/tsconfig changes and unknown untracked git/main files.

Previous rating reminders are owner-applied (20261011000200), owner-pushed as bed90c9 and actual
reminder delivery is owner-confirmed. Do not reapply or reimplement them.
One reminder per role is queued ten minutes after newly completed trips; no old-trip backfill.
Existing email/device preferences, current ownership, submission suppression and 24-hour expiry
apply. Existing Admin minute worker handles delivery; no new secrets, cron or native build.
Email/Web/native route to the exact existing owned rating form. Disclosure/moderation, financial,
dispatch and session contracts remain unchanged. Migration 20261011000200 is owner-applied.
Read architecture/trip-rating-reminders.md and operations/trip-rating-reminders-manual-test.md.
Local verification: 225 unit/API tests initially and 46 focused notification/cron/link checks after
final additions pass. Minimal PostgreSQL consent/dedupe/delay/cancellation/expiry/ownership smoke,
shared Supabase type check, scoped lint (existing Rider image warning only), and Admin/Rider/Driver
production builds pass. All 33 Driver and 32 Rider mobile browser checks pass, including exact-trip
rating routing, failed-submit retry, already-rated, expired and unavailable targets. Complete
414 x 896 screenshots inspected and retained under ignored tmp/rating-reminder-evidence.
Browser/provider fixtures and minimal SQL smoke do not establish real-device delivery or full
production Supabase-chain behavior; those remain owner acceptance.
Reminder receipt and discoverability are owner-confirmed; discovery refinement is now above.
No Git/deployment/production database action by Codex.

Daily totals are owner-pushed as 7ed6a77 and manually accepted on device. Do not reopen them.
Previous daily totals implementation: complete Driver daily distance and time-online totals. Local migration
20261011000100_driver_daily_activity.sql adds a private read-only owned aggregate RPC and partial
audit index. Company-local day boundaries, trusted measured completed-trip distance and committed
availability-setting spans are authoritative; missing distance or inconsistent online history is
unavailable. No new GPS tracking, dispatch/payment/auth/notification writes or Rider UI changes.
Driver home preserves its layout; visible-minute/foreground/reconnect and confirmed availability/
trip-list refreshes are bounded and account-scoped. Existing earnings use the same day window when
available. Read architecture/driver-daily-activity.md and operations/driver-daily-activity-manual-test.md.
71 Driver unit/API tests, disposable minimal PostgreSQL smoke, scoped lint and all 32 Driver mobile
browser checks pass. Complete 414 x 896 screenshot inspected and retained under ignored
tmp/driver-daily-activity-evidence; 320px overflow, unavailable recovery and existing confirmed
availability states pass. Final production build includes company-day earnings alignment.
Owner supplied an intended-only dry run followed by successful application of migration
20261011000100_driver_daily_activity.sql. Do not reapply. Owner pushed 7ed6a77 and accepted totals
on device, including the empty-day behavior. No native rebuild.
No production mutation by Codex.

Rider booking hang reported before this work recovered without deployment; owner suspects browser
session, cause not confirmed. The unfinished local timeout experiment was fully removed at owner's
request. No booking code change remains. Do not treat that experiment as a pending feature.

Receipt/unread owner release is e3b4af4, pushed and main/origin aligned. It includes DriverShell badge
wiring; that file was no longer unstaged at recovery. Four generated next-env/tsconfig changes and
unexpected untracked git/main files remain preserved. No other prior pending source edits.

Previous receipt verification: simplify the Rider receipt to ESH RECEIPT with date/status, route,
fare and customer payment/credit/refund/amount-due details. Screen/share/download reuse one summary;
no tenant/company, reference/booking ID, Stripe/provider wording/link, quote itemization, policy,
review/settlement/dispute internals or accounting disclaimer. Download is ESH-receipt.txt.
Existing API/RLS/financial records and dedicated Payments are unchanged. No migration/native rebuild.
16 receipt/unit/API checks, scoped lint, production Rider build and all 31 Rider mobile browser
checks pass. Complete 414 x 896 screenshot inspected and retained in ignored
tmp/receipt-simple-evidence. Browser checks verify exports omit internal details and handle refunds,
credit, failed refresh, 320px width and shortened viewport. Physical download remains unconfirmed.
Owner pushed the receipt/source/test/docs and preserved DriverShell unread wiring as e3b4af4.
Hosted Ready and simplified-receipt device confirmation remain separate from the supplied Git output.
No new migration or Codemagic build. No Git mutation/deployment by Codex.

Unread migration 20261010000700 is owner-applied (successful supplied output); owner pushed b0f3eae.
Git confirms main/origin alignment. DriverShell badge wiring is included in e3b4af4. Generated four
configs plus unexpected untracked git/main files remain untouched. Hosted Ready and unread physical
acceptance not supplied. The unread local verification below remains valid, but its pending migration
and Git claims are superseded by this checkpoint. No production/Git mutations by Codex.

Previous unread implementation checkpoint (release status superseded above): private Rider/Driver
unread indicators for messages and company responses.
Owner pushed receipts as be42ddf and accepted availability/sharing; physical download remains
unconfirmed, potentially device-dependent. Do not reopen accepted receipt work or claim download passed.
Git recovered main/origin/main be42ddf with only the four generated Driver/Rider next-env/tsconfig edits;
preserve and exclude them from feature staging.

New local migration 20261010000700_trip_unread_indicators.sql adds a private RLS acknowledgement
table and owned list/message/support-read RPCs. No notification producers, preferences, worker,
native project, auth/session or approved booking/dispatch flow changed. Menu/conversation/report
badges use actual server counts. Exact support-response links work outside loaded history.
Visible message IDs and loaded support versions alone are acknowledged; no fetch/menu clear-all,
optimistic success or other participant's read receipts. Later replies stay unread; stale writes
cannot regress. Foreground-only fifteen-second count refresh and recovery; no persistent browser cache.
Message cleanup follows conversation deletion; support markers follow retained history.
See architecture/trip-unread-indicators.md and operations/trip-unread-indicators-manual-test.md.

Current verification: 331 unit/API tests, shared type build, scoped lint, both production app builds
and minimal PostgreSQL isolation/consent/version/lifecycle/audit smoke pass. All 31 Rider and 31 Driver
mobile browser checks pass. The final four focused checks also pass after badge CSS/notice changes,
including hidden-content protection, own-message exclusion, failed-save preservation, selective
report clearing and reload persistence. Complete 414 x 896 screenshots inspected and retained under
ignored tmp/unread-evidence. Physical keyboards, full Supabase-chain/concurrency and real accounts
remain owner acceptance, not inferred from fixtures. Owner migration dry-run/apply,
Git push, hosted Ready and physical acceptance are pending. No remote database/Git mutation by Codex.
No native rebuild, new environment variable or credential required.

Previous accepted receipt checkpoint: Owner accepted Driver support
submission, received company response and resolution after pushing a2bfa9e. Migration
20261010000600 is owner-applied; do not repeat that completed work. Rider support alerts are
also owner-accepted at e86d669 with 100005 applied.
Receipt implementation baseline was a2bfa9e. Preserve generated configuration changes.

Inspection found existing Payments history and authenticated Stripe hosted receipts. New local
TripReceipt adds a progressive View trip receipt in completed/cancelled trip history, using a
new no-store GET /api/trips/receipt endpoint with existing caller-JWT RLS and explicit active
Rider/tenant/booking filters. No service-role reads, new RPC, schema migration or grants.
Immutable quote components are shown only when integer arithmetic balances the quote exactly.
Unpriced or incomplete legacy data stays unavailable, never fabricated zero/paid. Recorded fare,
quote, card payments, applied/restored credit, refunds, fare review, settlements and disputes stay
separate; pending refund/balance due is not presented as completed money movement. Stripe method
metadata/HTTPS processor receipts are optional and bounded to five seconds without retry; database
activity stays available during provider failure. Processor identifiers/errors remain server-side.

Local text download/share includes trip addresses only on user action; browser/device share falls
back to clipboard. No exported auth/processor links, stored public receipt, PDF/tax invoice, new
notification, financial mutation, new credential or native rebuild. Approved home/booking and Driver
source are unchanged. Existing Payments receipt controls remain intact.
258 Rider/Admin/shared unit/API tests, scoped lint and all 30 Rider mobile browser checks pass,
including download content, share payload, failed refresh, refunds/credit/balance due and 320px/short
viewport. Final 414px full screenshot inspected after navy/spacing refinement; production Rider
build passes with existing Supabase/Next/img warnings. Physical WebView download/share and real-account RLS acceptance
remain owner checks, not inferred from fixtures. See architecture/rider-payments-receipts.md and
operations/rider-payments-receipts-manual-test.md.
Final browser rerun passes all 30 checks after the CSS refinement. Screenshot preserved under
ignored tmp/rider-receipt-evidence; final whitespace check passes.

Receipt owner rollout/view/share is accepted at be42ddf. Physical download remains unconfirmed.
Next release is the unread-indicator migration/hosted rollout described above.

The older release notes below are historical context; this checkpoint supersedes pending claims
for Rider response-alert deployment and acceptance.

Previous objective: owner authorized support-response alerts with Go after accepting the full
trip-support submission/reply/resolution workflow. Local response-alert implementation is complete,
Remote migration is owner-applied; Git push/deployment and real-device receipt/tap acceptance remain pending.

New migration 20261010000500_trip_support_notifications.sql extends the existing outbox type
constraint without dropping earlier types and queues generic rider_support_update events after each
new review-history row. Case/version deduplication preserves identical review retries. No historical
replay. Existing Trip update emails and independent Web/native consent control eligibility; both off
means no new event. Existing email opt-out masks queued mail without canceling native delivery.
Outbox/preview payloads exclude report/reply text, names and addresses. Service-only eligibility
rechecks report/booking/tenant/active Rider/person bindings before email/web send and native claim.
All existing preorder, session, registration, expiry and retry claim checks are retained.

Admin's existing protected minute native cron claims native first, then processes only support
email/web events (up to 20); support queue failure returns 503 without blocking completed native work.
Other email cadence is unchanged. Fixed Rider links and whitelisted native IDs open the exact owned
report in Trips, even outside loaded history; malformed/denied targets never display another report.
Existing my_trip_support authorizes reads. Provider acceptance is not device receipt; existing
at-least-once and fifteen-minute native expiry contracts remain. No SMS, new env/credential,
APK/IPA, refund, Driver UI or auth-policy changes.

240 Rider/Admin/shared unit/API tests pass, including privacy/route validation, stale-recipient
suppression, cron authorization and email queue failure independence. Actual native/channel/preorder/
support/new-alert migrations pass disposable embedded PostgreSQL checks on minimal legacy stand-ins:
all-off/mobile-only/email-only, review retry uniqueness, routing, revoked access and native expiry.
Shared Supabase type build and scoped lint pass (existing Pages-directory/img warnings only).
Rider and final Admin production builds pass, including the final worker scope change; the seven
worker regression checks pass again after that change. All 29 Rider mobile browser checks pass, including focused report outside history,
denied report, prior booking/payment/auth regressions, 414 x 896 and short viewport. Complete fixture
screenshot inspected at test-results/rider-support-alert-414.png. Physical provider receipt/cold-start
taps and full Supabase-chain/concurrency certification remain owner acceptance, not inferred.

Git before work: main/origin/main a64de20, four generated Driver/Rider next-env/tsconfig edits and
local accepted-workflow documentation edits. Preserve generated edits and exclude from feature
staging. No Git mutation, production SQL, report, notification, payment or deployment by Codex.
Owner supplied successful Applying migration / Finished supabase db push output for only
20261010000500_trip_support_notifications.sql. Do not reapply it. Next: owner stages the explicit
feature files, commits and pushes, then confirms hosted Rider/Admin sender Ready and performs the
response-alert acceptance in operations/trip-support-manual-test.md. Preserve generated configs.

Previous support checkpoint: owner applied 20261010000400 and pushed a64de20. Submission, Admin
saved reply, Rider response visibility and resolution were all owner-accepted. No response-visibility
fix was needed. Baseline 233 unit/API checks, 27 Rider browser checks, Admin browser review/filter/
failure check and Rider/Admin/Transportation builds passed. Review RPC/Admin component are unchanged
by alerts. Cross-account/physical recovery acceptance remains separate.
See architecture/trip-support.md, architecture/native-push-notifications.md and
operations/trip-support-manual-test.md.

Owner pushed connection-error wording as 6996fbe (Git confirms main/origin alignment). Recurring
booking TypeError Load failed on both devices remains undiagnosed: exact triggering step unknown.
Public Rider health returned 200, which does not certify quote/checkout/Supabase. Post-booking
refresh can fail after a successful booking. Friendly wording advises checking Trips before retry;
no speculative request/retry/auth fix. Diagnose separately when the triggering step is supplied.
Owner accepts 88px size but reports the circular crop hides much of the face. Local Rider-only
image CSS now uses centered horizontal/20% vertical crop, favoring upper portrait content, while
keeping 88px size. Tall synthetic portrait fixture exposed the underlying intrinsic sizing bug:
percentage image height inside a grid could exceed the circular frame. Both apps now absolutely
position the image inside the fixed circle; Driver avatar size/crop otherwise unchanged. Original
files unchanged. This meaningful portrait test replaces the earlier featureless square; the initial
run caught 176px image height inside the 88px circle. Final corrected checks: all 26 Rider and
28 Driver mobile tests pass, portrait screenshot inspected, scoped fixture lint and whitespace
check pass. No new production build needed for CSS-only changes. Owner pushed 75aa546; hosted
Ready and actual-photo crop acceptance not yet explicitly supplied. No migration/native rebuild.
Latest owner feedback: Driver photo remains too small after the 64px refinement pushed as 01e2a4e.
Local CSS now increases Driver photo in Rider home/current tracking to 88px; Driver app's Rider
avatar remains 36px. Browser size assertion and durable docs updated. No backend, schema, upload
or native change. All 26 Rider mobile checks pass, 414 x 896 full screenshot inspected, scoped test
lint and whitespace check pass. Owner reports pushed; Git confirms e14773d and main aligned with
origin/main, only four generated config edits remaining before this docs update. Next: Rider Ready
at e14773d and device recognition-size retest. No migration or native rebuild required.
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
