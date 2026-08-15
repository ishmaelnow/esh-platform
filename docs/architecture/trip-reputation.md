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

Reputation Appeals V2 lets the rated Rider or Driver appeal only a rating that the delayed-
disclosure contract has already revealed to them. The appeal reason is required, bounded, and
stored separately from the immutable rating. One appeal is allowed per rating and appellant.
Authenticated portal RPCs derive the appellant and trip ownership; clients cannot appeal ratings
belonging to another person or tenant and cannot read raw appeal rows.

Tenant dispatch managers can review appeals under tenant RLS and either uphold the rating or remove
it with required resolution notes. Removing an appealed rating uses the existing moderation fields
to hide it from the rated party; neither the original score/comment nor the appeal is deleted or
rewritten. Submission and resolution emit tenant audit events. An upheld decision leaves the rating
visible. Appeals do not affect dispatch eligibility, matching, or aggregate profiles.

Notification delivery, aggregate public profiles, and rating-based matching remain deferred.
