# Rating review requests

This feature completes the existing 20260815000500 appeal foundation. It does not create a new
rating system, change the 30-day rating submission window, reveal undisclosed ratings, alter matching,
or generate notification events. Requests and company decisions are read inside existing ratings
screens; refresh retrieves updates. Received-rating/review-decision alerts remain separate work.

Rider/Driver Post-trip ratings show Request review only beside a disclosed received rating, separate
from the participant's own submitted score. One owned list read per mounted ratings section supplies
status/history, including a removed rating whose received score no longer appears. Initial list
failure disables new submissions instead of treating unavailable data as an empty list. Ten-second
request timeouts, stale-result/unmount protection and account/tenant/profile keys isolate state.
Failed submissions preserve the reason. Unknown outcomes retry the same request and recover the
original ID without creating duplicate requests or audit entries. Original reasons are immutable.

The new additive 20261013000100 migration reuses trip_rating_appeals and existing public RPC signatures.
Internal authorization derives the current active person and correct Rider/Driver profile, exact
tenant and completed booking. Rider tenant slug must match. The received rating must belong to the
subject profile, be visible and disclosed by mutual submission or seven elapsed days. Ordinary
submission windows and moderation are unchanged. Existing committed requests remain recoverable
after removal, while current booking ownership is still required. List RPCs explicitly filter role,
tenant and active ownership; shared person identity does not imply cross-product access.

Admin Reputation gains a bounded 50-record review queue with submitted/all/kept/removed filters and
pagination. The database requires active person/tenant plus existing can_manage_dispatch authority.
The queue returns the received rating and reason only to authorized operators; requesters see their
own reason/status/decision, not internal reviewer identity or another party's appeal.

Operators explicitly choose Keep rating or Remove rating and provide an explanation. Resolution locks
the appeal; exact decision/notes retries are idempotent, differing later decisions are rejected.
Removal hides the existing rating through its existing moderation fields without deleting history.
Moderator reason is generic; the explanation stays in requester/Admin appeal data. Existing separately
audited manual moderation rights remain intact; a past decision is not a permanent restoration ban.
Submission and resolution audit excludes reason, comment and explanation bodies. No payment, refund,
Driver availability, dispatch, auth policy or new native permission changes.

RLS denies requester direct appeal-table reads and writes; owned RPCs provide scoped projection.
Existing dispatch-manager read policy remains. Internal helper mutations have no client execution
grant. No new service-role route, secrets, cron or native rebuild. Transportation renders the shared
Admin component and must receive the hosted UI update along with Rider and Driver.

Local checks load actual reputation, prior appeal and new migrations against minimal PostgreSQL
dependencies. This is not full production Supabase-chain or concurrent-session certification.
