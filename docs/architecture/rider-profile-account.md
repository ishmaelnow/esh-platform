# Rider Account profile

Account edits the existing tenant-scoped `rider_profiles` record: required name, optional contact
phone and optional accessibility/pickup notes. Verified email is read-only. Profile photo is
optional and never gates booking. The approved home, map, booking, session duration, authentication
and payment-return contracts are unchanged. The editor does not change shared person identity,
historical booking snapshots, SMS consent or phone verification. Existing SMS preferences retain
their separate consent and verification workflow.

`update_my_rider_profile` checks confirmed Auth email, active tenant/capability and the caller's
active Rider/person identity. It locks only that Rider, bounds inputs and writes an audit event.
Direct browser table updates remain denied. Switching provider changes the profile being edited;
other providers and other riders are not editable through these functions.

Optional photos use the private `rider-profile-photos` bucket. The browser selects JPEG/PNG from
library/files, resizes to at most 1200 pixels and re-encodes JPEG without retaining source metadata.
Selection uploads immediately; text edits require Save profile. The server bounds multipart input
and checks MIME/signature and a 1 MB file limit. Unsupported images/PDFs are rejected. No new native
plugin was introduced in the profile release. Follow-up adds Rider iOS camera/photo-library purpose
descriptions after the owner reported a crash when selecting Camera. Those declarations require
a new native iOS build; hosted deployment cannot repair an old binary. Device capture/upload,
cancellation and denial remain manual release checks.

The photo API verifies the bearer token with Auth and resolves its active owned profile through
`my_rider_portal`. Client-provided profile IDs, tenant IDs and storage paths do not determine
ownership. Only then does the server use the existing server-only service-role configuration.
Paths contain tenant/profile IDs and a random filename. The authenticated photo RPC rechecks
ownership, bucket metadata and path before changing the record. Audit metadata contains no full
phone, image, original filename or private storage path. Drivers receive no general photo access.
The active-trip exception is documented in `trip-participant-photos.md`: only the current assigned
Driver can request a short-lived link after acceptance through trip end. Missing photos use initials.

GET returns a five-minute signed URL with an uncached response. Signed URLs are bearer access
until expiry; previously issued links can remain usable briefly after removal. The image bypasses
the Next image optimizer and is not put into local storage. DELETE clears the profile reference
first; confirmed replacement/removal attempts best-effort object cleanup. Ambiguous RPC failures
retain the candidate because the database might have committed. Operators must reconcile unreferenced
objects after an observation period, comparing every candidate with current profile references
before deletion. Never delete a referenced object or print signed links in logs.

Migration: `20261005000100_rider_profile_account.sql`. Existing rows retain null photo fields.
No new notification or trip lifecycle event is introduced. Real database/RLS acceptance requires
the rollback-only fixture test and the two-account/provider manual checks; API/browser mocks are
not proof that a migration has executed.
