# Assigned Rider rating in Driver Dispatch

Migration `20261013000400_assigned_rider_rating.sql` adds a private aggregate helper and the
`riderRatingSummary` field to the existing active-trip projection of `my_driver_dispatch`.
The actual function definition is preserved through a guarded anchor that matches trips only;
offers do not gain the field. Existing offer-expiration processing and lifecycle are unchanged.
No new directory, Rider-ID lookup, endpoint, request, polling timer or browser storage.

The helper has no anon/authenticated execution grant. Existing dispatch calls it with caller
identity and checks active person, tenant, current Driver profile, active assigned Rider and an
accepted/arrived/in-progress booking. Another Driver, a Rider, unknown booking or ended assignment
cannot obtain the aggregate. Existing table RLS/grants and rating/moderation audit remain unchanged;
there is no new mutation or per-poll audit stream. Driver sees only average and count, never other
Drivers' individual scores, names, comments, addresses, review reasons or decisions.

This is the Rider's all-time average of visible Driver overall scores within the same tenant/Rider
profile. Each eligible completed trip contributes equally. Historical assignment and reviewer
identity must match, with completion not in the future. A score counts only after the Rider also
submitted or seven days after that trip completed. Hidden/removed ratings and detailed criteria
are excluded. Profiles sharing one person across tenants are not combined. The SQL average is
rounded to two decimals: 5, 4, 3 and 5 produce 4.25 across four ratings.

The existing active-trip Rider photo/name now includes the summary below the name. Missing photo
leaves initials while a valid summary remains visible. Confirmed zero/null average reads 'Not yet
rated'; missing/invalid data reads 'Rating unavailable', never a fabricated zero or five stars.
The photo remains 36px. The label wraps at compact widths; trip controls retain their layout.
Offers, preorders, Recent orders and ended trips gain no aggregate or photo exposure.

Assignment and summary arrive together in the same dispatch response snapshot. Existing refresh
and status changes replace the summary; failures retain the existing last-confirmed dispatch and
its existing error handling. No additional claim of live freshness, offline revocation or protection
from screenshots is made. Reassignment removes the old Driver's server access; completed/cancelled
trips disappear from dispatch through its existing query.

Approved Rider runtime is unchanged. Rider's assigned-Driver counterpart is documented in
[Assigned Driver rating](assigned-driver-rating.md), owner-applied/pushed at 511d0e1 and visible on
the owner's device. No auth, eligibility, dispatch matching, payment, notification or native change.
No new secret, environment variable, cron or APK/IPA. Apply this migration before hosted Driver
release. Minimal SQL checks load the actual dispatch/reputation definitions with disposable
dependencies, including an explicitly simulated legacy expiration dependency and identity context.
They do not certify full production migration-chain or concurrency behavior.

See [manual acceptance](../operations/assigned-rider-rating-manual-test.md).
