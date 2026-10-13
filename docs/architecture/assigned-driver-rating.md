# Assigned Driver rating in Rider tracking

Migration `20261013000300_assigned_driver_rating.sql` adds only a private aggregate helper and an
additive `driver.ratingSummary` field to the existing owned Rider portal. It preserves the actual
portal definition using a guarded projection anchor. No general Driver directory or Driver-ID
lookup is added. The helper has no anon/authenticated execution grant; the existing security-definer
portal calls it with the authenticated caller's identity. No rating table/storage grants or RLS
policies are broadened. Existing submission/moderation audit and immutable rating records remain.
There is no new write or polling audit stream for this aggregate read.

The helper verifies active tenant, person and owned Rider profile, current assigned active Driver,
and accepted/arrived/in-progress booking. It returns null outside that boundary, including past
trips. Scores are scoped to the assigned Driver profile in that tenant, not the person's other
tenant profiles. Completed trips contribute one visible Rider overall score each. Ratings count
only after the Driver has also submitted or seven days from that trip's completion. Hidden/removed
ratings, noncompleted trips, future completion times and mismatched historical assignments are
excluded. Detailed criteria are not averaged into the overall score.

The average is the sum of eligible overall scores divided by their count, rounded to two decimals.
This is an all-time tenant/profile average, not today's activity. Four scores 5, 4, 3 and 5 yield
4.25 across four ratings. Only `average` and `count` are returned; no individual scores, identities,
comments, addresses, appeal reasons or review decisions from historical trips are exposed.

Rider Home and Current trip show the summary beside the existing private Driver photo/name,
preserving vehicle/plate/map/booking layout. A confirmed zero count with null average is 'Not yet
rated'. Missing/invalid summary is 'Rating unavailable', never zero, five stars or an unrated claim.
The label handles a singular rating and wraps on compact screens. Photo absence keeps initials and
does not suppress a valid rating summary. Driver and Admin runtime are unchanged.

Assignment and summary arrive in the same portal response snapshot. Existing foreground refresh,
manual refresh, account/provider stale-response guards and trip lifecycle control updates. There
is no new request, timer, browser storage or profile cache. Offline/error behavior retains the
existing last-confirmed portal snapshot and connection notice; no new claim of live freshness.
Reassignment replaces the name and summary together on successful portal refresh. Completion or
cancellation removes active identification. No promise of immediate revocation of already viewed
information or protection from screenshots.

No payment, matching, notification, Driver eligibility, authentication or native permission change.
No new credential, environment variable, cron or native rebuild. Apply the migration before the
hosted Rider release. Existing shells load that release. Minimal SQL verification uses the actual
legacy portal and reputation definitions with disposable dependencies; real-account RLS and full
Supabase/concurrency acceptance remain owner checks.

See [manual acceptance](../operations/assigned-driver-rating-manual-test.md).
