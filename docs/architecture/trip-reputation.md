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
Received ratings and review requests/decisions are shown on the same completed-trip card.
The separate Post-trip ratings section remains only for trips outside loaded completed history.
Each trip has only one mounted form; reminder links open and focus it.

Driver Recent orders embeds received ratings and review requests/decisions alongside
“Rate your passenger” on completed cards, using the owned reputation
result to determine eligibility and saved score. The same Driver-only form is reused by Ratings,
with an explicit overall star choice, compact existing communication/readiness/respect scores and
optional comment. Cancelled cards have no rating action. Submission uses the original Driver RPC;
failed requests preserve feedback and successful refreshes display the saved score. Only the active
screen mounts forms, so reminder IDs remain unique. Reminder links continue to open Ratings and
expand/focus the requested form. No Rider runtime or backend contract changes for this follow-up.

`trip_ratings` is tenant-owned and permits one submission per reviewer role and booking. Submission
RPCs derive the authenticated Rider or Driver, verify ownership of a completed trip, and enforce a
30-day window. Clients cannot insert, update, or directly read raw ratings. Tenant dispatch managers
may read them under RLS and may hide or restore a rating through an audited moderation RPC.

To discourage retaliation, a received rating is revealed only after both parties have submitted or
seven days after completion. Hidden ratings are never returned to the rated party; the submitter can
still see their own submission. Ratings do not affect dispatch eligibility or matching in V1.

Optional post-trip reminders are documented in [Trip rating reminders](trip-rating-reminders.md).
Rating review requests complete the existing appeals foundation; see [Rating review](rating-appeal-review.md).
Received-rating and review-decision alerts are documented in [Rating updates](rating-update-notifications.md).
Aggregate public profiles and rating-based matching remain deferred.
