# Rider active booking guard

One authenticated person may start only one current ride across provider Rider profiles.
Active means requested, offered, accepted, arrived, or in_progress. Future scheduled and
recurring reservations remain allowed. Completed and cancelled rides release the limit.

Migration `20261007000100_rider_active_booking_guard.sql` adds a private RLS-protected slot
table keyed by person. A dispatch trigger claims this slot atomically on insertion or
promotion into an active status. This covers direct RPCs, wallet bookings, webhook
finalization, and scheduled activation. Conflicting transactions cannot create two new
active bookings. Existing lifecycle audit and notification writes roll back with a rejected
booking. The boolean authenticated RPC exposes only the caller's own active-ride state;
it does not expose another provider's booking details. Anonymous administrative bookings
without a Rider profile are outside this identity-based limit.

The Rider UI keeps timing controls available, blocks immediate submissions while a current
ride exists, and checks the server again before submitting. Checkout checks before wallet
reservation or opening Stripe. These preflight checks improve feedback; the database
trigger remains authoritative. Existing quote recovery stays idempotent.

Due scheduled bookings wait while their Rider is busy. Activation skips busy Riders before
the batch limit and isolates conflicts so other Riders can proceed. Once the current ride
ends, the next scheduler run can activate one waiting booking. No new late-trip expiry or
automatic cancellation policy is introduced.

Legacy duplicate active rides are preserved, with the oldest represented in the derived
slot table. They can finish normally; another active ride cannot be added until all finish.
The migration never cancels rides or rewrites financial records.

This is a booking limit, not a payment-session reservation. Separate checkouts opened before
either booking exists, or older open Stripe sessions, can still receive payment. The database
rejects the second active booking; a paid quote can remain unbooked until recovery is possible.
Preserve the recorded payment and recover the same quote, rather than charging again. Refunds
require the existing authorized refund flow. No automatic refund or financial cleanup is added.

Local PGlite verification uses a minimal isolated schema, including legacy duplicates,
cross-provider ownership, activation, release, and private-table access. It does not certify
concurrent PostgreSQL sessions or a complete production Supabase migration chain.
