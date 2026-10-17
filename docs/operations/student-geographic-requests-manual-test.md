# Student geographic request rollout and acceptance

Owner manual checkpoint (2026-10-17, latest source 351eca1): customer geographic submission with
three students and per-student requirements, displayed road preview/reload, internal view and
withdrawal visibility accepted for the reported tests. Owner withdrew some requests; no complete
request-ID inventory or all-test-data cleanup confirmation supplied. Do not repeat accepted checks
or infer all remaining isolation/provider-failure/school-site/concurrency scenarios passed.

Local feature pending owner rollout. Use disposable TEST data; no real child data or transport.
Owner supplied intended-only dry-run and successful application of 20261016000100. Do not repeat
the migration steps below for this release; next are server configuration, scoped push and Ready.
Keep operational activation guards closed. Do not change ordinary app domains/auth/provider settings.

## Owner release

In the independent Student Vercel project configure the existing public Supabase values, existing
enrollment pilot flag, NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN and server-only NEXT_STUDENT_SUPABASE_SECRET_KEY.
Keep the owner-selected NEXT_STUDENT_SUPABASE_SECRET_KEY; remove duplicate STUDENT_SUPABASE_SECRET_KEY.
The NEXT_STUDENT prefix is not NEXT_PUBLIC and does not expose this variable to browser bundles. The Student-specific variable name
requires the follow-up application release; the shared service-client API remains unchanged.
Never paste populated values into chat or use a NEXT_PUBLIC service key. Confirm provider token
allows school.eshapp.com and permanent geocoding; leave ordinary deployments unchanged.

Owner first runs:

    pnpm exec supabase db push --dry-run

Stop if anything other than 20261016000100_student_request_geography.sql is listed. Codex has not
queried remote migration state. Only after intended-only output is reviewed, owner applies the
migration, commits/pushes scoped files and confirms Student Ready. Existing migrations are not to
be reapplied. No native build, new callback, SMS/email template or Student operations toggle.

Receipts contain private TEST request data, become unusable for new submissions in 30 minutes and
are opportunistically deleted on that actor's next preview. Owner retention maintenance must also
delete expired receipts for inactive accounts. Review a narrowly scoped database procedure/job
using `expires_at < now()` before any real-data pilot; no automatic scheduler is installed here.
Do not delete request history to clean up test requests; mark/withdraw TEST requests and follow the
approved retention process. History is intentionally immutable.

## Acceptance

Form labels: Destination address is the shared drop-off street address; Search destination address
finds selectable suggestions. Gate or entrance instructions (optional) is a separate notes field.
Pickup address 1/2/3 is each student's collection address, with separate optional pickup notes.

1. Sign in as an admitted customer. Select one shared school street address and three different
   pickup suggestions. Include actual school gate/loading instructions. Do not rely on a campus
   postal centroid or treat an address point as an approved loading zone.
2. Record different requirements for different TEST students, e.g. booster seat for one and
   wheelchair lift plus dedicated attendant for another. Verify saved associations on reload and
   internal queue. Missing tags are not verified absence of needs.
3. Verify stops and preview. Inspect actual streets, route order, markers and attribution on
   414x896, 320px and desktop. Confirm all stops match intended addresses; inspect any provider
   access point against the actual school site. This is not safe-stop/vehicle approval.
4. Change one selected address or instruction: prior preview must disappear and submission require
   a fresh preview. A typed but unselected address cannot submit. Remove a middle student and
   confirm the remaining pickup fields and requirements still belong to the correct students.
5. Exercise no results, broad/uncertain address, missing map token, provider/network failure and
   retry. No fabricated coordinates/straight-line route or silent address substitution. No GPS
   permission is required. Basemap failure exposes Retry map without losing valid request data.
6. Submit; confirm one grouped, geocoded but unreviewed request, no confirmed ride/Driver/fare.
   Reload and open saved road preview from customer and authorized internal staff views.
7. In local fixtures, fail submission and retry unchanged: same key and one request. Changed input
   during unresolved submission requires refreshing/checking requests. Test expired preview;
   reverify unchanged input and recover. Check before submitting again after a browser restart.
8. Existing text-only requests remain visible and explicitly unverified. Do not backfill them or
   treat them as ready for route approval. Withdraw a TEST request; history retains submission
   and withdrawal snapshots with actor/time. No in-place address edit or approval is exposed.
9. Other customer/tenant, unverified/suspended identity, paused customer/program and anonymous
   calls must fail. Browser receipt reads/inserts and direct request/history edits must fail.
   Internal reviewers do not acquire customer-management or parent authority.
10. Refresh after access revocation, switch customer/identity and sign out: private forms/maps clear.
    Restore temporary settings/customer access. Verify no ordinary booking, assignment, payment,
    product activation or operational notification was created.

Local checks: existing Student foundation/enrollment SQL harnesses (now include geography cases),
Student/map unit/API checks, Student lint/types/build, shared map and Supabase types and updated
student-customer-browser-check.cjs. Browser/provider fixtures and minimal SQL are not full production,
concurrency, actual email, physical school access or native certification.
