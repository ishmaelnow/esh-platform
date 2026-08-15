# Trip reputation

Reputation V1 lets Riders and Drivers independently rate a completed trip. Rider ratings cover
overall experience, safety, communication, and vehicle cleanliness. Driver ratings cover overall
experience, communication, readiness, and respect. An optional comment is limited to 1,000
characters.

`trip_ratings` is tenant-owned and permits one submission per reviewer role and booking. Submission
RPCs derive the authenticated Rider or Driver, verify ownership of a completed trip, and enforce a
30-day window. Clients cannot insert, update, or directly read raw ratings. Tenant dispatch managers
may read them under RLS and may hide or restore a rating through an audited moderation RPC.

To discourage retaliation, a received rating is revealed only after both parties have submitted or
seven days after completion. Hidden ratings are never returned to the rated party; the submitter can
still see their own submission. Ratings do not affect dispatch eligibility or matching in V1.

Notification delivery, appeals, aggregate public profiles, and rating-based matching remain deferred.
