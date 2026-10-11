import { buildEarningsStatement, type StatementTrip } from "./earnings-statement";

export function driverHomeTotals(wallet: { currencyCode: string; trips: StatementTrip[] } | null,
  reputation: { bookingId: string; completedAt: string; receivedRating: { overall: number } | null }[] | null,
  now = new Date(), dayWindow?: { startsAt: string; endsAt: string }) {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const start = dayWindow ? Date.parse(dayWindow.startsAt) : new Date(`${date}T00:00:00`).getTime();
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const endsAt = dayWindow ? Date.parse(dayWindow.endsAt) : end.getTime();
  const activeTrips = wallet?.trips.filter((trip) => !trip.earningsReversed
    && Date.parse(trip.completedAt) >= start && Date.parse(trip.completedAt) < endsAt);
  const statement = wallet ? dayWindow ? {
    earningsMinor: activeTrips!.reduce((sum, trip) => sum + trip.earningsAmountMinor, 0),
    platformFeesMinor: activeTrips!.reduce((sum, trip) => sum + trip.platformFeeMinor, 0),
  } : buildEarningsStatement(wallet.trips, [], { startDate: date, endDate: date }) : null;
  const completed = reputation ? new Set(reputation.filter((trip) => {
    const time = new Date(trip.completedAt).getTime(); return time >= start && time < endsAt;
  }).map((trip) => trip.bookingId)).size : null;
  const ratings = reputation?.flatMap((trip) => trip.receivedRating ? [trip.receivedRating.overall] : []) ?? [];
  const money = (amount: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: wallet!.currencyCode }).format(amount / 100);
  return { trips: completed, earnings: statement ? money(statement.earningsMinor) : null,
    fees: statement ? money(statement.platformFeesMinor) : null,
    rating: ratings.length ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(2) : null };
}
