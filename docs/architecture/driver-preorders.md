# Driver Preorders

Local implementation, pending owner migration and hosted release:
`20261009000100_driver_preorders.sql`.

## Reservation and dispatch

New lists priced future scheduled bookings in the Driver's selected authorized area without exact
addresses. Assigned to me shows owned reservations and their addresses. Counts cover the complete
eligible sets; lists display the next 100 entries. Trip fare is the actual booking fare, not earnings.

Reserving does not change availability, create an active assignment, collect payment or move the
Rider out of scheduled. Booking/Driver locks and a unique active reservation index prevent duplicate
reservations. Overlap protection covers dispatch readiness through pickup plus actual route duration
and fifteen minutes; missing duration uses one hour. Travel between jobs is not planned.

At activation the existing Rider active-booking guard applies. Before ordinary matching, the
reservation trigger rechecks active/compliant Driver, authorized area, confirmed online status,
active vehicle, no active trip and no pending offer. A qualifying Driver receives the existing
timed offer and must accept. Otherwise release permits ordinary automatic dispatch, or manual
waiting if matching is disabled. Decline/expiry use existing fallback. Releasing leaves the Rider's
scheduled booking intact; cancellation clears its reservation.

## Ownership and notifications

Owned RPCs require the authenticated active Driver and tenant. RLS allows own settings/reservations
and manager history through existing dispatch permission. Direct client writes are denied. Settings,
reservation and dispatch changes are audited. Admin shows the latest 100 tenant reservation records.

Receive while offline persists independently of availability and enables new-preorder alerts while
offline; email or device consent remains necessary. Own reservation updates do not depend on this
setting. Availability is queued after scheduled pricing and deduplicated per booking, reservation
generation and Driver. Later opt-in does not replay historical trips. Released trips may announce
availability again to other eligible Drivers.

Messages are generic, without addresses. Email masking respects trip-email choice while preserving
device delivery. Worker, native claim and Web Push recheck stale availability. Native claims honor
both canceled/cancelled outbox spellings. Validated preorder taps open Preorders using a fixed route,
not arbitrary supplied URLs. Provider acceptance is not device receipt. SMS routing is unchanged.

## Release and limits

Apply the reviewed migration before Admin, Transportation and Driver hosted release. Shared changes
also pass the Rider build without changing its design. Existing push-capable shells suffice: no
native rebuild, environment variable or new credential is required.
See [manual checks](../operations/driver-preorders-manual-test.md).

Minimal-schema PostgreSQL smoke uses the actual automatic matcher and Rider active guard. It covers
ownership, tenant isolation, overlap, priority/fallback, cancellation and stale alerts. It does not
certify the complete Supabase chain, true concurrent sessions or physical-device delivery.
