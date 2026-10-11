# Driver trip support

Recent orders lists the authenticated Driver's latest 50 completed or cancelled bookings.
Get help submits a private trip issue or lost-item report. This is company support, separate
from SOS, live trip chat, refunds, payment adjustments and compliance evidence.

The final/current assigned Driver owns the report. Ownership requires an active person,
Driver profile and tenant, plus exact booking assignment. Cleared or reassigned bookings
do not imply historical access. Riders cannot read Driver reports, and Drivers cannot read
Rider reports. No report attachments are supported.

Migration `20261010000600_driver_trip_support.sql` adds separate Driver case/update tables,
RLS, owned submission/read/history RPCs and dispatch-admin review RPCs. Direct authenticated
table access is denied. Submission request IDs and booking/category uniqueness prevent
duplicate reports; versioned reviews prevent stale overwrites and duplicate retry updates.
Audit records exclude report and reply bodies. The shared support controller preserves
memory-only drafts and request IDs across uncertain retries.

Transportation's Trip support queue has a Reports from filter. Drivers receive only their
own company reply history. The existing Driver trip-offer email preference now also controls
support-response emails; device consent remains independent. Generic response alerts contain
no report bodies, replies, names or addresses. Case/version keys deduplicate new updates.
Service-only checks revalidate active ownership at delivery/claim time. Email opt-out masks
queued mail without cancelling eligible native delivery. Both channels off queues no event.

The existing protected minute worker handles Rider and Driver support email/Web events
after independent native delivery. Native expiry and at-least-once provider contracts remain
unchanged. Fixed Driver links open Recent orders and the exact owned report, including a
report outside loaded history. Invalid or denied targets never substitute another report.
Initial session loading must finish before URL view selection is applied.

Deploy Driver, Admin sender and Transportation UI after the owner applies the migration.
No new environment variable, credential or native rebuild is required. Local browser fixtures
and minimal embedded PostgreSQL checks do not certify physical notification delivery or the
entire Supabase migration chain. See the operations manual for owner acceptance.
