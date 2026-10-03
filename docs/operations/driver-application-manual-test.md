# Driver applicant verification and release

## Local and automated checks

For an isolated visual application preview from the owner's PowerShell session:

```powershell
node tooling/scripts/driver-preview.cjs --applicant
```

This opens the form with a preverified fixture identity. Uploads/status are simulated in the browser;
it sends no email or production file. Closing the browser stops the preview. Normal preview without
the flag continues to open the approved map home.

Run Driver at its own local origin (`corepack pnpm --filter @esh-platform/driver dev`, port 3002)
with its own verified configuration. Do not copy Admin/Rider environment files or change Auth URLs.
The migration must exist in the test database; the Driver server needs its existing server-only
service role configuration for private uploads. Existing applicants created via Admin should also
see their status if their record has the verified applicant auth identity.

Automated isolated mobile/Driver regression checks:

```powershell
$env:DRIVER_PREVIEW_PORT='3012'
node tooling/scripts/driver-preview.cjs --tests
```

These browser checks use identified fixture identity/business/upload/approval responses, without
sending authentication emails or uploading production evidence. Existing map regression checks
use unchanged real OpenFreeMap tiles. Complete application captures are under ignored test-results.
Driver unit tests include authorization, multipart bounds, MIME signatures, upload cleanup and
ambiguous transaction outcomes. Migration source checks are not a live database/RLS test.

## Owner database release gate

Codex does not apply migrations or production database mutations. On a disposable/local Supabase
test database with the repository schema, run `tooling/sql/driver-applicant-portal-test.sql` using
psql with ON_ERROR_STOP=1. It rolls back fixtures; do not run it against production. Prove verified
own-only reads, anonymous/service-only grants, missing-evidence rollback, complete submission,
idempotent retry, evidence audit and no approval bypass. Real database execution is required before
release; API/browser mocks alone do not establish RLS behavior.

Then, from the repository root, the owner runs:

```powershell
corepack pnpm exec supabase db push --dry-run
```

The owner already applied the applicant and insurance-review migrations. For the ID-photo addition,
confirm the only pending migration is `20261003000200_driver_id_photo.sql` before applying
with `corepack pnpm exec supabase db push`. If anything else is listed, stop and reconcile remote
migration history. Remote migration state has not been queried by Codex. Deploy Driver only after
this gate. Also deploy the Admin backend evidence route and Transportation Admin shared UI.
No Rider deployment, API rewrite or hosted Auth change is required.

## Real-account acceptance (414 × 896, then compact phone and native)

1. Open Driver signed out. Existing sign-in still works. Apply to drive accepts a new identifiable
   test email and returns its verification link to Driver, including installed iOS/Android app
   return. Check actual hosted allowlist/templates without changing them speculatively.
2. After verification, choose a company. Enter name/optional phone and actual JPEG/PNG Profile photo,
   Driver ID photo of any ID, Vehicle photo, plus
   separate JPEG/PNG/PDF vehicle registration and insurance documents. Check camera/library/file picking and image resizing. Invalid
   types and over-limit documents show actionable errors. Scroll the complete form with keyboard
   open; all fields and submission remain accessible without horizontal overflow.
   Verify this order in form/status/Admin: Profile photo, Driver ID photo, Vehicle photo,
   Vehicle registration document, Vehicle insurance document. Required new submission files are
   five distinct entries; the portrait must not fulfill ID. ID photos use JPEG/PNG; type of ID is
   decided by the administrator. There is no license-only or automatic approval rule.
   Before submitting, switch to another browser tab and back. Company, name, phone and all five
   selected files must remain. A same-user auth refresh must not clear the form. Sign-out/change
   of identity must discard it; a full page reload does not preserve an unsubmitted draft.
3. Submit once. Confirm receipt and each filename, reload and refresh status. No Driver home,
   availability or dispatch is admitted before approval. Status/network failure must not offer a
   duplicate application or claim submission succeeded. Interrupt an upload and retry safely.
4. In the authorized company's existing Admin application/evidence screens, verify the same
   application and five private files are available in the agreed order. Insurance and ID use the
   same original evidence review list. Change review dates and verify order does not change.
   Before approval, open the insurance file as an authorized administrator; verify the policy
   identifies the actual vehicle. Another company/applicant cannot access
   these records or execute the internal submit RPC. No private storage URL is exposed to applicants.
5. Test under-review, rejected and withdrawn statuses. Reviewed evidence cannot be overwritten.
   For a legacy four-file submitted record, upload only ID and verify prior names/reviews stay.
   For other legacy incomplete submitted records, upload only missing files; confirm the original
   application ID and existing reviews remain. No automatic claim of unlinked legacy email records.
6. With an authorized administrator, approve a clearly identified test application through the
   existing workflow. Refresh in Driver and Continue. Confirm account activation and remaining
   document/vehicle/operating-area requirements. Approval alone must not bypass online eligibility.
7. Review insurance directly in Applications using Open, Approve evidence and Reject evidence.
   No assignment/linking control should appear. Require rejection notes and a future expiration
   for approval. Refresh Driver status to confirm the same decision. Existing submitted uploads,
   filenames and reviews must survive the correction. Verify old linking HTTP requests return 410
   and authenticated RPC linking permission is revoked. Do not approve placeholder test PDFs.
   The added requirement defaults to optional for activation, preserving existing Driver gates;
   submitting a new Driver application now requires all five files. ID does not impose a new
   retrospective activation/expiration gate on approved Drivers. Existing tenant requirement
   settings and unrelated fleet compliance remain authoritative.
8. Verify existing activation/evidence emails and replacement-document flows still work. Do not
   initiate a payout, emergency or production trip just to test onboarding. Leave test Driver Offline.
9. For an existing approved application, upload ID through Driver Profile > Documents. Refresh
   Admin Applications and Drivers: both must show the same filename and pending status. Review
   it once, then refresh both views and Driver to confirm the same decision. Replace a rejected
   profile photo and confirm the new upload is current while the original remains older history
   with disabled review controls. Verify another driver's uploads never appear in this application.

Real authentication/native upload picking, administrator review/notification delivery and database
transaction/RLS behavior require owner-controlled acceptance. No production applicant was created
by the isolated tests. Browser data is not evidence of hosted configuration or production deployment.

The renamed application registration field uses the existing generic document contract. Existing
historical files and approvals are retained. Verify assigned-vehicle registration separately through
the existing Vehicles compliance workflow; this label change does not automatically satisfy it.
