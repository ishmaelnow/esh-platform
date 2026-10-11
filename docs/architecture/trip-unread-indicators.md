# Private trip unread indicators

Rider Trips and Driver Recent orders show unread company responses; Trip messages shows incoming
message counts. The menu has a compact navy aggregate badge. Driver's existing active-trip banner
also shows incoming message counts. Company-response links open the exact report, including reports
outside loaded history. No competing navigation or OS application-icon badge is introduced.

Migration 20261010000700_trip_unread_indicators.sql stores private attention acknowledgements.
The RLS table denies direct anonymous/authenticated access. Controlled security-definer RPCs use
fixed search paths, current active identity, tenant, product profile and booking ownership.
Message acknowledgements additionally reuse current-assignment/lifecycle authorization. Support
acknowledgements reuse existing finished-trip support access and exact case/profile binding.
Generic resource IDs are validated by those RPCs; booking deletion cascades and message deletion
removes its markers. Support markers follow retained case history. Service-role access stays privileged.

State is keyed by person, product role, item and version, shared across that person's signed-in
devices. No message body, reply, address, token or provider data is copied into it. Audit records
contain identifiers/counts/versions only. Neither party receives the other's read state; these
are personal unread indicators, not participant-facing read receipts.

The list RPC returns only IDs and counts. Messages are incoming, unread entries in the same latest
100-message window as the conversation API. Own sent messages never count. Support counts are
reports with a newer company-review version, not the number of individual review-history entries.
An unanswered submission is not unread. On initial rollout existing incoming messages and company
responses have no acknowledgements and can appear unread; no historical notification is sent.

Each product owns its React presentation and uses the shared headless controller. Foreground
counts refresh every 15 seconds and on connectivity/visibility recovery. Nothing polls while the
document is hidden or browser reports offline. A message marker after its body, or a report marker
after its responses, acknowledges only when it enters the visible viewport. Opening a menu/history
or fetching content alone never marks it read. Reading a focused report does not clear siblings.
Unsupported IntersectionObserver leaves counts unread rather than inferring that content was viewed.

Message acknowledgements name exact rendered incoming IDs (server bound: 100 per call). Support
acknowledgements use the displayed version; later replies stay unread, and an older acknowledgement
cannot regress saved progress. Repeated writes are idempotent. There is no clear-all operation.
Failed writes do not optimistically remove badges; reopen the item to retry. Failed counts clear
stale metadata and show an unavailable notice in Trips/Recent orders. Account/provider changes
remount the controller, and stopped/obsolete responses cannot populate the next context.

Existing message/support outbox producers, consent, native/Web/email routing, delivery retries and
minute worker remain unchanged. Unread state works with all external alerts disabled and does not
cancel already queued alerts. No secret, environment variable, native rebuild or Admin UI change.
Deploy Rider and Driver after the owner applies the intended migration. Full Supabase-chain and
physical-device acceptance remain separate from local fixtures and embedded PostgreSQL smoke checks.
