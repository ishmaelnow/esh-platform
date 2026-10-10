# Active-trip participant photos

Owner approved optional Rider photos and existing Driver profile photos for pickup recognition.
Booking eligibility, authentication, document review and the approved layouts remain intact.

Only accepted, arrived and in-progress bookings expose the current counterpart's photo. Rider home
tracking and Current trip show the Driver; Driver active dispatch shows the Rider. Initials are the
normal fallback. Offers, preorders, past trips and notification payloads contain no photos or URLs.

Migration `20261010000200_trip_participant_photos.sql` adds an owned metadata RPC, reusing private
active-participant authorization from trip messaging. It checks active person, profiles, tenant,
current assignment and explicit app role. No table policies or storage grants are broadened.
Authorized metadata includes private paths; paths are not downloadable links. Read audit records
contain only booking and viewer role, never paths, file names, images or signed URLs.

Rider source is the optional `rider-profile-photos` JPEG/PNG in its exact tenant/profile namespace.
Driver source is the latest `personal_photo` evidence linked to the assigned profile, from
`driver-application-files`. Latest selection happens before review filtering: a pending, rejected,
expired or PDF replacement yields initials instead of resurrecting an older image. Driver ID,
vehicle photos, registration and insurance are never selected. Existing application approval links
evidence to the Driver profile; no new assignment or review step exists.

Legacy compatibility: owner SQL confirmed Ish Coach has an approved JPEG and an existing object
in the correct bucket, but its historical path lacks the tenant prefix. Follow-up migration
`20261010000300_legacy_driver_trip_photos.sql` removes that invalid prefix assumption for Driver
photos. Ownership is established by tenant + assigned Driver profile + latest personal_photo
evidence, as in existing document preview. The signing route accepts only this RPC-selected path,
not a request parameter; bucket, traversal, lifecycle and assignment rechecks remain. Rider's
tenant/profile namespace rule is unchanged. No files are moved or reuploaded and no review changes.

Each app's bearer-authenticated `/api/trips/photo?bookingId=...` route fixes the viewer role on the
server and verifies the email session. Shared signing logic uses owned RPC metadata, validates
bucket and Rider namespace, rejects traversal, signs for 60 seconds with existing service credentials, then
rechecks metadata/assignment. Replies use `Cache-Control: no-store`; errors become initials without
blocking controls. Missing migration/configuration degrades safely. No new env or native permission.

React adapters keep URLs in memory, bypass image optimization, omit referrers and clear on hidden
or offline state. They renew every 45 seconds while visible, discard expired images after 55 seconds
and abort/ignore stale requests on account/booking changes or unmount. Names accompany decorative
images. Rider Account and Driver Documents explain visibility. Rider can remove the optional photo.
Driver photos shown in Rider tracking are 64 x 64 pixels for recognition; Rider photos in Driver
dispatch remain 36 x 36 pixels. Both crop inside a circle; original document preview is unchanged.

Signed links are bearer links: a recipient who already obtained one can use it until expiry even
after cancellation/reassignment. Downloaded pixels cannot be revoked. Fresh requests are denied
immediately; UI also follows normal portal lifecycle refresh. This is not biometric identification
or protection from screenshots.

Tests cover signing, authorization, lifecycle, image eligibility and 414 x 896 browser rendering.
Disposable SQL fixtures are not full Supabase-chain/concurrent-session certification. Real-device
two-account acceptance remains an owner release check after migration and hosted deployment.
