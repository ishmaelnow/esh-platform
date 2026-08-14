import { describe, expect, it } from "vitest";
import { buildEarningsStatement, earningsStatementCsv } from "./earnings-statement";

describe("Driver earnings statements", () => {
  const trips = [
    { bookingId: "paid", completedAt: "2026-08-12T15:00:00Z", pickupAddress: "A", destinationAddress: "B", fareAmountMinor: 5000, earningsAmountMinor: 4000, platformFeeMinor: 1000, paymentCollected: true, transferStatus: "succeeded" as const },
    { bookingId: "pending", completedAt: "2026-08-13T15:00:00Z", pickupAddress: "C", destinationAddress: "D", fareAmountMinor: 2500, earningsAmountMinor: 2000, platformFeeMinor: 500, paymentCollected: false, transferStatus: null },
    { bookingId: "outside", completedAt: "2026-07-01T15:00:00Z", pickupAddress: "E", destinationAddress: "F", fareAmountMinor: 1000, earningsAmountMinor: 800, platformFeeMinor: 200, paymentCollected: true, transferStatus: null },
  ];
  const payouts = [
    { payoutId: "payout-paid", status: "paid" as const, amountMinor: 3000, currencyCode: "USD", providerCreatedAt: "2026-08-13T16:00:00Z" },
    { payoutId: "payout-failed", status: "failed" as const, amountMinor: 500, currencyCode: "USD", providerCreatedAt: "2026-08-13T17:00:00Z" },
  ];

  it("summarizes only activity inside the inclusive local-date period", () => {
    const statement = buildEarningsStatement(trips, payouts, { startDate: "2026-08-12", endDate: "2026-08-13" });
    expect(statement).toMatchObject({ tripCount: 2, grossFaresMinor: 7500, earningsMinor: 6000, platformFeesMinor: 1500, pendingMinor: 2000, collectedMinor: 0, transferredMinor: 4000, bankPaidMinor: 3000 });
  });

  it("exports quoted trip and payout rows without processor secrets", () => {
    const csv = earningsStatementCsv(buildEarningsStatement(trips, payouts, { startDate: "2026-08-12", endDate: "2026-08-13" }), "USD");
    expect(csv).toContain('"paid","A","B","50.00","40.00","10.00","","USD"');
    expect(csv).toContain('"Bank payout","paid","payout-paid"');
    expect(csv).not.toContain("outside");
  });

  it("retains refunded-trip history but excludes reversed earnings from active totals", () => {
    const reversed = { ...trips[0]!, bookingId: "refunded", earningsReversed: true };
    const statement = buildEarningsStatement([reversed, trips[1]!], [], { startDate: "2026-08-12", endDate: "2026-08-13" });
    expect(statement).toMatchObject({ tripCount: 1, grossFaresMinor: 2500, earningsMinor: 2000, transferredMinor: 0 });
    expect(statement.trips).toHaveLength(2);
    expect(earningsStatementCsv(statement, "USD")).toContain("Reversed after refund");
  });
});
