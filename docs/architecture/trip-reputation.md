# Trip reputation

Reputation V1 lets Riders and Drivers independently rate a completed trip. Rider ratings cover
overall experience, safety, communication, and vehicle cleanliness. Driver ratings cover overall
experience, communication, readiness, and respect. An optional comment is limited to 1,000
characters.

Rider completed-trip cards show an optional “Rate your driver” control directly alongside the trip.
It opens an inline overall star selector, the existing safety/communication/cleanliness scores and
optional comment. A star choice is required before submission; no overall score is preselected.
The existing owned submission RPC is reused. Failed submissions retain entered feedback; submitted
cards show “You rated this trip” and the saved score. Cancelled/ineligible trips gain no rating form.
The separate Post-trip ratings section remains for disclosure/history and older trips outside the
loaded booking history. Each trip has only one mounted form; reminder links open and focus it.

`trip_ratings` is tenant-owned and permits one submission per reviewer role and booking. Submission
RPCs derive the authenticated Rider or Driver, verify ownership of a completed trip, and enforce a
30-day window. Clients cannot insert, update, or directly read raw ratings. Tenant dispatch managers
may read them under RLS and may hide or restore a rating through an audited moderation RPC.

To discourage retaliation, a received rating is revealed only after both parties have submitted or
seven days after completion. Hidden ratings are never returned to the rated party; the submitter can
still see their own submission. Ratings do not affect dispatch eligibility or matching in V1.

Optional post-trip reminders are documented in [Trip rating reminders](trip-rating-reminders.md).
Appeals, aggregate public profiles, received-rating alerts and rating-based matching remain deferred.
