export type StatementTrip = {
  bookingId: string;
  completedAt: string;
  pickupAddress: string;
  destinationAddress: string;
  fareAmountMinor: number;
  earningsAmountMinor: number;
  platformFeeMinor: number;
  paymentCollected: boolean;
  transferStatus: "pending" | "succeeded" | "failed" | "reversed" | null;
  earningsReversed?: boolean;
};

export type StatementPayout = {
  payoutId: string;
  status: "pending" | "in_transit" | "paid" | "failed" | "canceled";
  amountMinor: number;
  currencyCode: string;
  providerCreatedAt: string;
};

export type StatementPeriod = { startDate: string; endDate: string };

export function buildEarningsStatement(
  trips: StatementTrip[],
  payouts: StatementPayout[],
  period: StatementPeriod,
) {
  const startsAt = startOfLocalDate(period.startDate);
  const endsAt = dayAfterLocalDate(period.endDate);
  const includedTrips = trips.filter((trip) => inPeriod(trip.completedAt, startsAt, endsAt));
  const activeTrips = includedTrips.filter((trip) => !trip.earningsReversed);
  const includedPayouts = payouts.filter((payout) => inPeriod(payout.providerCreatedAt, startsAt, endsAt));
  return {
    trips: includedTrips,
    payouts: includedPayouts,
    tripCount: activeTrips.length,
    grossFaresMinor: sum(activeTrips.map((trip) => trip.fareAmountMinor)),
    earningsMinor: sum(activeTrips.map((trip) => trip.earningsAmountMinor)),
    platformFeesMinor: sum(activeTrips.map((trip) => trip.platformFeeMinor)),
    pendingMinor: sum(activeTrips.filter((trip) => !trip.paymentCollected).map((trip) => trip.earningsAmountMinor)),
    collectedMinor: sum(activeTrips.filter((trip) => trip.paymentCollected && trip.transferStatus !== "succeeded").map((trip) => trip.earningsAmountMinor)),
    transferredMinor: sum(activeTrips.filter((trip) => trip.transferStatus === "succeeded").map((trip) => trip.earningsAmountMinor)),
    bankPaidMinor: sum(includedPayouts.filter((payout) => payout.status === "paid").map((payout) => payout.amountMinor)),
  };
}

export function earningsStatementCsv(
  statement: ReturnType<typeof buildEarningsStatement>,
  currencyCode: string,
) {
  const rows: Array<Array<string | number>> = [[
    "Date", "Type", "Status", "Reference", "Pickup", "Destination", "Rider fare",
    "Driver earnings", "Platform fee", "Bank payout", "Currency",
  ]];
  for (const trip of statement.trips) rows.push([
    trip.completedAt, "Trip earning",
    trip.earningsReversed ? "Reversed after refund" : trip.transferStatus === "succeeded" ? "Transferred to Stripe" : trip.paymentCollected ? "Collected" : "Pending payment",
    trip.bookingId, trip.pickupAddress, trip.destinationAddress,
    minorDecimal(trip.fareAmountMinor), minorDecimal(trip.earningsAmountMinor),
    minorDecimal(trip.platformFeeMinor), "", currencyCode,
  ]);
  for (const payout of statement.payouts) rows.push([
    payout.providerCreatedAt, "Bank payout", payout.status.replaceAll("_", " "), payout.payoutId,
    "", "", "", "", "", minorDecimal(payout.amountMinor), currencyCode,
  ]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function startOfLocalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  return new Date(`${value}T00:00:00`).getTime();
}

function dayAfterLocalDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return Number.NaN;
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

function inPeriod(value: string, startsAt: number, endsAt: number) {
  const timestamp = new Date(value).getTime();
  return !Number.isNaN(startsAt) && !Number.isNaN(endsAt) && timestamp >= startsAt && timestamp < endsAt;
}

function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function minorDecimal(value: number) { return (value / 100).toFixed(2); }
function csvCell(value: string | number) { return `"${String(value).replaceAll('"', '""')}"`; }
