import { buildEarningsStatement, type StatementTrip } from "./earnings-statement";

export function driverHomeTotals(wallet: { currencyCode: string; trips: StatementTrip[] } | null,
  reputation: { bookingId: string; completedAt: string; receivedRating: { overall: number } | null }[] | null,
  now = new Date()) {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const statement = wallet ? buildEarningsStatement(wallet.trips, [], { startDate: date, endDate: date }) : null;
  const start = new Date(`${date}T00:00:00`).getTime();
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const completed = reputation ? new Set(reputation.filter((trip) => {
    const time = new Date(trip.completedAt).getTime(); return time >= start && time < end.getTime();
  }).map((trip) => trip.bookingId)).size : null;
  const ratings = reputation?.flatMap((trip) => trip.receivedRating ? [trip.receivedRating.overall] : []) ?? [];
  const money = (amount: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: wallet!.currencyCode }).format(amount / 100);
  return { trips: completed, earnings: statement ? money(statement.earningsMinor) : null,
    fees: statement ? money(statement.platformFeesMinor) : null,
    rating: ratings.length ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(2) : null };
}
