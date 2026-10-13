# Trusted-contact trip links

Rider explicitly creates a temporary link from Share my trip in Current trip after Driver acceptance.
Home's existing Track ride leads there. No default sharing, contact collection, automatic messages,
SMS, notification producer, booking/payment mutation or background GPS is introduced.

The link reveals only accepted/arrived/in-progress status, expiry and the current assigned Driver's
fresh consented coordinate/timestamp. No booking/account/tenant IDs, names, exact pickup/destination
addresses, vehicle details, photos, notes, messages, phone numbers, earnings or payment records are
returned. No recipient login is required. Anyone possessing the link can use or forward it; Rider
copy explains this. Driver's existing sharing copy explains trusted-contact links, and stopping Driver
location sharing removes location from links while status remains available. No Rider GPS is shared.

The Rider server generates 32 cryptographically random bytes and stores only SHA-256 hex through
an authenticated owned RPC. The raw URL-safe token is returned once to the creating session and kept
only in memory for explicit Web Share/clipboard/manual copying. It is never placed in query/path,
audit metadata or logs. `/share-trip#token=...` retains it in the browser fragment; recipient requests
send it only in the POST body to `/api/trips/shared`. The page has noindex/nofollow and no-referrer
metadata; API replies are private/no-store. Do not add analytics or request-body logging here.

The private RLS table exposes no rows or mutations to anon/authenticated. Owner RPC derives current
Rider/person, active tenant and owned booking under a booking lock. One link per booking; replacement
invalidates the previous link atomically. Creation requires accepted/arrived/in-progress status and
an active assigned Driver. Status/revoke remain owned. Creation/revocation audit contains booking
and action only. Raw tokens cannot be recovered after reload; the Rider can stop the existing link
or deliberately create a replacement. Lost creation response is recovered with status, never an
automatic second creation.

Public lookup is a service-only RPC used exclusively by Rider's server. It joins exact tenant,
booking, Rider, bound Driver and active auth-linked people on every read, with four-hour expiry.
Driver location requires sharing enabled, valid coordinates and timestamp within 60 seconds, with
30-second future tolerance. Stale coordinates are omitted, never presented as live or last known.
No caller-selected booking/profile query or anonymous database grant exists. Completion, cancellation,
Rider change or Driver reassignment deletes the capability. Expired rows are unreadable and replaced
by explicit creation or deleted on terminal lifecycle; no scheduled cleanup job is required.

The recipient page polls every ten seconds only while visible/online, aborts obsolete requests and
clears trip data on hidden/offline/request failure. Location freshness/expiry also age every second
locally. Transient failures recover; revoked/ended tokens stop polling until manual refresh. Changed
fragments reload cleanly. The existing interactive geographic renderer is mounted only with real
fresh coordinates, retaining attribution; missing location uses status-only UI with no invented map
center. No route history or ETA is supplied. Revocation affects future reads; pixels/screenshots and
already returned coordinates cannot be recalled, and a read racing revocation can finish. Foreground
polling bounds normal removal; this is not an emergency monitoring service.

Migration: `20261012000100_trip_share_links.sql`. Existing Rider Supabase service credential and map
configuration suffice. Native shells load the hosted page; no APK/IPA or App Link change. Full
Supabase-chain/concurrency and physical sharing remain owner acceptance beyond local fixtures.
