# Driver application and status

New applicants stay in Driver. The root sign-in screen offers Apply to drive, which requests a
verified email identity with account creation allowed. Existing Driver sign-in still disallows
account creation. Both use the existing `esh-driver-portal-auth` storage key and existing Driver
browser/native return URL. No Admin/Rider environment, hosted Auth setting, domain or callback
configuration changes. The native callback returns to Driver's root, where authenticated
unapproved applicants can complete or view their application. Company selection can be repeated
after verification; private details/files are not persisted in browser drafts.
Same-user authentication recovery on tab return does not restart account activation. The applicant
component remains mounted during account checks so entered details and selected files stay in memory.
Sign-out or identity changes discard that form. Reloading the page still requires reentering an
unsubmitted application; private documents are not persisted in local/session storage.

The applicant chooses from the existing active Transportation company directory. Driver collects
name, optional phone and five ordered files: Profile photo, Driver ID photo, Vehicle photo,
Vehicle registration document and Vehicle insurance document. The Profile photo uses the existing
personal_photo key; it is not reclassified into ID evidence. Driver ID photo accepts a JPEG/PNG
photo of any ID, with the administrator deciding approval or rejection. No license-only rule,
OCR or automatic verification is added.
Images are resized in browser memory; each uploaded file is limited to 1 MB, multipart bodies to 4.4 MB even without a
Content-Length header. The form caps selected file bytes at 4 MB to leave multipart overhead within
the existing 4.4 MB request limit. Server validation checks supported MIME types and signatures. Camera/file
selection uses the ordinary mobile file picker. Unsupported image formats must be converted to
JPEG/PNG by the user/device. Files are private and never given public URLs.

## Authorization and transaction

Migration `20261002000100_driver_applicant_portal.sql` adds own-status, atomic submission and
the initial insurance storage contract, preserving
existing table RLS, administrator review, activation, notifications or operational permissions:

- `my_driver_applications` requires a confirmed identity and reads only that auth user's matching
  verified-email applications, across their own companies. It returns company, application status,
  applicant details and evidence review state/notes. It omits storage paths, internal application
  review notes, reviewer identities and other applicants. A closed company does not hide existing
  application status. Anonymous access is revoked; direct applicant table reads remain denied.
- `submit_driver_application_with_evidence_internal` is executable only by service_role. The
  same-origin Driver route first calls Auth getUser and verifies email confirmation, then validates
  fields/files/company before privileged access. Identity and tenant IDs from multipart input are
  ignored. SQL rechecks the verified identity, active tenant and enabled driver.management capability.
  Private uploads use tenant/auth-user/random-batch paths. SQL verifies their prefix and existence.
  Application creation, evidence metadata, legacy file-path attachment and an attributed tenant
  audit event commit together. No files means no successful application.

An advisory lock serializes company/identity retries and row locking serializes with administrator
approval. Existing submitted applications can receive missing evidence only; reviewed evidence is
never overwritten. Reviewed/approved applications reject uploads. Five files must exist before a
transaction succeeds. A retry of a completed submitted application cannot duplicate evidence.
Legacy Admin submission remains supported, including completion of an incomplete submitted record.
Legacy records without applicant_auth_user_id are not claimed merely by matching email.

Failed uploads clean already uploaded files. Confirmed SQL rollback and unused successful retry
uploads are cleaned. An ambiguous network/RPC outcome retains objects because the transaction may
have committed; the applicant is told to refresh status before retrying. Unreferenced objects from
ambiguous failures may require owner-controlled storage reconciliation. Never delete objects
referenced by driver_evidence or application legacy paths. No automatic evidence deletion is added.

## Admission and lifecycle

Application receipt does not grant tenant membership, approval, Driver online eligibility, trip
access or Community admission. The company still reviews through its existing Admin workflow.
After approval, Continue uses the existing activate_my_driver_account and portal summary pipeline;
normal document, vehicle and service-area compliance gates remain authoritative. Rejected or
withdrawn applicants see the decision and contact-company guidance, rather than automatic reapply.
Replacement evidence after approval uses the existing Driver documents screen. Review status is
explicitly refreshed by the applicant; existing notification contracts are unchanged. No promise
of new submission/rejection email delivery is introduced.

## Driver document viewing and photo capture

Activated Driver Documents refreshes the existing own-only portal summary when opened, on foreground/
window focus, and every 15 seconds while visible. A manual Refresh document status action retries
failed reads with explicit feedback. Leaving Documents stops polling; late responses are discarded.
The reviewed server status controls replacement eligibility; refresh does not activate the account,
change availability, copy evidence or mutate review state.

Applicants can view uploaded application documents; activated drivers can view their current
documents from Profile > Documents, including pending, approved and rejected uploads. Missing
uploads have no View document action. Images and PDFs open in a dismissible in-app dialog with
focus return, Escape and history-back dismissal; no external popup or persistent preview cache.

Driver POST /api/documents verifies the authenticated email session, uses the own-only application
or Driver summary RPC to establish ownership, then derives tenant and latest evidence from that
owned record. Client-supplied driver/tenant IDs, bucket and paths do not authorize access. Existing
private storage creates a five-minute signed link with no-store responses. Links expire but remain
bearer capabilities until expiry; do not log, share or persist them. Errors omit private diagnostics.
No new RLS grant, schema migration, evidence copy or review mutation is introduced.

Application and Driver replacement inputs offer a separate Take photo capture input alongside
ordinary file/library selection. On installed Android, Take photo uses the pinned official
@capacitor/camera 8.0.0 plugin with CameraSource.Camera, bounded JPEG dimensions, orientation
correction, no edits and saveToGallery false. It never silently opens the library. Cancellation
preserves existing selection; unavailable camera/denial gives an error and the separate file input
remains usable. Older shells without the plugin request an Android update. Android-only sync and
release 1.0.3/code 4 are required; iOS retains the owner-verified HTML capture path and version.
The WebView capture branch used by Android 1.0.2 silently fell back to existing files on the
owner's device despite MIME/query declarations. Its precise device-specific failure is unknown.
No new camera/storage permission or gallery saving is introduced. If Android kills the app during
capture, no returned photo is automatically uploaded after restart; refresh and deliberately retake.
Normal live capture returns through the existing image reduction and evidence submission pipeline.

Browser and iOS Take photo continue through the dedicated HTML capture input. Captured photos are
reduced in memory to JPEG under the existing
application limit. Cancelled capture preserves the prior selection; unreadable photos explain the
file fallback. HTML capture is a device/browser request, not proof that a real camera launched.
See https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture.
Driver iOS Info.plist supplies camera and photo-library purpose descriptions. Existing installed
iPhone binaries do not receive these native declarations from hosted updates: rebuild/install the
Driver iOS shell and physically verify camera launch, denial, cancellation and upload. Android
capture still needs a physical-device check. The installed Capacitor bridge requires image/* on
the capture input; ordinary selectors keep JPEG/PNG/PDF restrictions. Android declares only the
IMAGE_CAPTURE intent query so its resolveActivity check can discover the camera. No Camera plugin
or new Android camera/storage permission is added. The manifest change requires an Android rebuild.

Admin application review includes original application evidence and later evidence belonging to
the application's explicitly linked driver_profile_id, within the same tenant. It uses the same
evidence rows and review endpoints as Drivers: no copied files, email-based matching or separate
approval. History remains visible, ordered by document type then newest submission/creation time.
Only the newest upload within each type has active review controls. Unlinked applications show
only their own evidence. Existing authorization, private viewing, review audit and notifications
remain unchanged; no schema change is required for this combined view.

Driver already has a server-only SUPABASE_SERVICE_ROLE_KEY contract for payouts; application uploads
also need it in the Driver deployment. Never expose it through a NEXT_PUBLIC variable or copy an
environment file from another app. Missing server configuration fails closed with a generic error.
Deploy the additive migration before deploying Driver; old Driver/Admin clients remain compatible.

## Application insurance review

The ordered document extension uses forward migration `20261003000200_driver_id_photo.sql`.
It adds driver_id_photo to the normal evidence and replacement contracts, required for new Driver
application submissions. Existing four-file submitted applicants can supply only the missing ID.
Old uploads/reviews are unchanged, and a portrait is never treated as an ID. Already approved
applications do not lose approval. ID defaults to optional for activation and does not require an
expiration date; established tenant requirement settings and reviewer decisions remain authoritative.
Applications and Driver document history group evidence by Profile, ID, Vehicle photo, Registration,
Insurance while preserving newest-first ordering within each type. Thus changing upload/review time
cannot scramble the slots or choose an older upload as current.

Owner clarified that the original application/review workflow must remain intact: insurance is
one additional document, with no new fleet assignment or manual linking step. Forward migration
`20261003000100_application_insurance_review.sql` moves the review metadata into driver_evidence
without moving/deleting private files. Original legacy insurance rows and vehicle links remain
historical provenance. Any existing linked review, reviewer, review notes, expiration and submission
time are preserved. Unreviewed uploads become pending application evidence. The deployed earlier
migration remains unchanged.

New uploads use the same atomic application evidence transaction for all five documents. Admin
Applications uses its existing Open, Approve evidence, Reject evidence, expiration and review-notes
controls. Existing RLS, attributed review audits, approval-to-draft evidence attachment, notification
triggers, self-service replacements and latest-evidence rules apply unchanged. Insurance approval
requires a future expiration date. Insurance is not automatically approved upon submission.

The added insurance requirement is optional for activation by default, preserving established
activation requirements for already approved Drivers. It is still required to submit a new Driver
application. Administrators retain the existing requirement configuration controls; this correction
does not impose a new universal activation gate. Existing fleet/vehicle eligibility and separate
vehicle compliance contracts are not rewritten or bypassed.

The old linking RPC is revoked for client/service roles; its HTTP POST returns 410 without mutation.
The legacy read endpoint remains for private historical access, but no linking UI is rendered.
Applicant status now reads all documents from the normal evidence list and reports Awaiting review.
No vehicle is created, inferred or assigned by this application correction.
Apply the forward migration before deploying Driver, Admin backend and Transportation shared UI.

## Application registration label

At the owner's request, Driver's generic Reference document field is now labeled Vehicle registration
document and asks for JPEG/PNG/PDF vehicle registration, separately from insurance. The existing
`document` multipart field and `reference_document` storage/review contract remain intact for
compatibility. No historical document is rewritten, migrated or automatically approved as vehicle
registration. This is an application-label change, not an insurance-style automatic handoff to
vehicle_evidence. Existing fleet compliance requirements remain intact. Application review and
Driver document history now use the requested registration label; no historical generic document
is reclassified into vehicle registration evidence.
