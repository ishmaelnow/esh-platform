# Driver application and status

New applicants stay in Driver. The root sign-in screen offers Apply to drive, which requests a
verified email identity with account creation allowed. Existing Driver sign-in still disallows
account creation. Both use the existing `esh-driver-portal-auth` storage key and existing Driver
browser/native return URL. No Admin/Rider environment, hosted Auth setting, domain or callback
configuration changes. The native callback returns to Driver's root, where authenticated
unapproved applicants can complete or view their application. Company selection can be repeated
after verification; private details/files are not persisted in browser drafts.

The applicant chooses from the existing active Transportation company directory. Driver collects
name, optional phone, personal photo, vehicle photo, vehicle registration document and vehicle insurance.
Images are resized in browser memory; each uploaded file is limited to 1 MB, multipart bodies to 4.4 MB even without a
Content-Length header. Server validation checks supported MIME types and signatures. Camera/file
selection uses the ordinary mobile file picker. Unsupported image formats must be converted to
JPEG/PNG by the user/device. Files are private and never given public URLs.

## Authorization and transaction

Migration `20261002000100_driver_applicant_portal.sql` adds own-status, atomic submission and
explicit insurance-handoff RPCs plus private application-insurance metadata, preserving
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
never overwritten. Reviewed/approved applications reject uploads. Four files must exist before a
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

Driver already has a server-only SUPABASE_SERVICE_ROLE_KEY contract for payouts; application uploads
also need it in the Driver deployment. Never expose it through a NEXT_PUBLIC variable or copy an
environment file from another app. Missing server configuration fails closed with a generic error.
Deploy the additive migration before deploying Driver; old Driver/Admin clients remain compatible.

## Application insurance handoff

Insurance is a distinct required JPEG/PNG/PDF upload, separate from vehicle registration.
It is stored in tenant-scoped driver_application_insurance, with composite tenant/application and
tenant/vehicle-evidence foreign keys. Applicant direct reads/writes are denied. Authorized company
administrators can open it privately from Applications, including before application approval.
The original Admin-hosted application form remains compatible and does not suddenly require a new
field; existing submitted records can add missing insurance in Driver without repeating other files.

After approval and actual vehicle assignment, an administrator explicitly matches the uploaded
policy to that vehicle and selects Link insurance to assigned vehicle. The controlled RPC requires
both Driver and Vehicle management permission, an approved application and the exact current
tenant-scoped assignment. It does not infer a vehicle from a photo or invent a vehicle record.
Linking creates pending vehicle_evidence of type insurance, preserving file provenance and adding
a tenant audit record. Approval and expiration are supplied only through the existing Vehicles
review workflow, with its existing notifications, reminders and service eligibility gates.

Repeated linkage is idempotent; reuse for another vehicle is rejected. Existing vehicle insurance
is not overwritten or superseded by an older application upload. Insurance insert serialization
also prevents a concurrent upload from being superseded by the handoff. Later policy replacement
uses existing assigned-vehicle uploads. Applicant status discloses received/awaiting vehicle until
linked, then the original linked evidence's review status; current vehicle compliance remains the
existing portal's authoritative latest-evidence view.

This extension updates the still-unapplied applicant migration. Deploy the Admin backend route,
the Transportation Admin shared UI and Driver after the migration. Transportation's existing
same-origin API rewrite remains unchanged. No domain, environment file or authentication URL changed.

## Application registration label

At the owner's request, Driver's generic Reference document field is now labeled Vehicle registration
document and asks for JPEG/PNG/PDF vehicle registration, separately from insurance. The existing
`document` multipart field and `reference_document` storage/review contract remain intact for
compatibility. No historical document is rewritten, migrated or automatically approved as vehicle
registration. This is an application-label change, not an insurance-style automatic handoff to
vehicle_evidence. The actual assigned vehicle's separate registration upload/review and compliance
requirements still apply. The original Admin-hosted form and existing Driver document history retain
their legacy labels; do not assume every historical generic document was registration.
