# Driver map home

The approved Rider application is preserved. Driver composes its existing authenticated portal
and RPCs inside a map-first shell using the Rider navy (#153258), white floating surfaces, rounded
controls and safe-area layout patterns. The shared RiderHomeMap remains the geographic renderer;
Driver alone opts into an additional Mapbox Traffic vector layer. Its default remains off for Rider.
Traffic uses the [published traffic tileset](https://docs.mapbox.com/data/tilesets/reference/mapbox-traffic-v1/).
Without a public Mapbox token it attempts the existing real OpenFreeMap fallback and omits traffic;
Mapbox GL JS can reject its own SDK authorization without a valid token. Production verification
requires Driver's own valid public token. Isolated preview credentials and live OpenFreeMap data
are test harness behavior, not a production authorization bypass.
No production fixture, decorative grid or static map is imported by Driver.

## Location and navigation

Pickup/destination navigation opens installed maps using geo links on Android and Apple Maps
directions on iOS; browsers retain HTTPS directions. It no longer invokes embedded Android
Mapbox navigation or requires its APK-bundled public token. Existing coordinates are preserved.
The live ESH map still uses its existing provider configuration. Existing native SDK code remains
in the shell, unused by these controls; removing it is outside this focused hosted change.

Driver map GPS is foreground and display-only. Explicit locate requests permission, while an
already granted permission enables foreground position updates. Watches stop when the document
is hidden, the Driver scope changes or the shell unmounts. Denial/unavailability explains that the
authorized operating area remains the fallback; without an area the map uses a world overview.
Centering on a position never enables server location sharing, updates availability or writes GPS.
The existing opt-in online sharing RPCs and trip privacy/lifecycle contracts remain authoritative.

The left drawer provides Profile, Notifications, Wallet, Recent orders and Settings. Existing
documents, ratings, dispatch, vehicle compliance, service-area and location controls remain
accessible through secondary screens. The drawer traps keyboard focus, restores focus on close,
dismisses with Escape/backdrop and participates in browser/native back history. A visible back
button returns from secondary screens to Home. No competing bottom navigation is added.

## Totals and confirmed availability

Today's completed trip count comes from authorized completed reputation records, deduplicated by
booking ID. Earnings and platform fees come from today's locked wallet rows, with reversed earnings
excluded, using the existing local-date statement contract. Earnings include pending collection;
the card explicitly says earned, not paid out. The main amount is Driver earnings, not Rider fares.
Fee text means the platform's locked fare share, not an invented processor fee. Rating averages
only already-disclosed received ratings. No rating is invented when none has been disclosed.
Unavailable data renders a dash rather than falsely reporting zero. Recorded empty earnings/counts
render zero. Daily distance and online duration are not exposed by the existing Driver RPCs, so
those fields explicitly remain unavailable; no device-only counter is presented as a daily total.

The fixed availability switch reflects confirmed effectiveStatus. Pending updates disable it and
keep its prior position. Rejected/network updates display their failure and preserve confirmed
status. Only a confirmed offline response clears local sharing state. Existing server eligibility,
authorization, area selection, auditing and dispatch behavior are unchanged.

## Unsupported reference features

The existing repository has no Driver SOS/emergency flow. No SOS button or emergency request is
invented. The verified map controls open operating areas, assigned vehicle/compliance, location
sharing and active dispatch, and center actual GPS. Traffic toggles the real provider overlay when
configured. Unknown screenshot icons do not receive decorative or guessed behaviors.

Driver Preorders now has an owned reservation/list API and persistent offline-alert setting locally,
pending its migration and hosted release. Future reservations remain separate from timed dispatch
offers. See [Driver Preorders](driver-preorders.md) for privacy and dispatch boundaries.

Original map-home polish introduced no schema/auth change. Preorders uses its separate migration
and owned RPCs. Fixtures are isolated under tests/tooling, and no production availability,
emergency, booking, payout or notification action is used for design verification.
