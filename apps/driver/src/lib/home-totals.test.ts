import { describe, expect, it } from "vitest";
import { driverHomeTotals } from "./home-totals";

const today = new Date(2026, 9, 1, 12);
const completedAt = new Date(2026, 9, 1, 10).toISOString();
const yesterday = new Date(2026, 8, 30, 23).toISOString();
const trip = { bookingId: "priced", completedAt, pickupAddress: "", destinationAddress: "", fareAmountMinor: 1000, earningsAmountMinor: 800, platformFeeMinor: 200, paymentCollected: false, transferStatus: null };
describe("Driver home totals", () => {
  it("uses locked driver earnings and fees rather than gross fares, including pending earnings", () => {
    const totals = driverHomeTotals({ currencyCode: "USD", trips: [trip] }, [{ bookingId: "priced", completedAt, receivedRating: { overall: 4 } }], today);
    expect(totals.earnings).toContain("8.00"); expect(totals.fees).toContain("2.00"); expect(totals.trips).toBe(1); expect(totals.rating).toBe("4.00");
  });
  it("counts all completed trips once, including unpriced and reversed trips, without counting yesterday", () => {
    const reputation = ["priced", "unpriced", "unpriced"].map((bookingId) => ({ bookingId, completedAt, receivedRating: null }));
    reputation.push({ bookingId: "yesterday", completedAt: yesterday, receivedRating: null });
    const totals = driverHomeTotals({ currencyCode: "USD", trips: [{ ...trip, earningsReversed: true }, { ...trip, bookingId: "old", completedAt: yesterday }] }, reputation, today);
    expect(totals.trips).toBe(2); expect(totals.earnings).toContain("0.00"); expect(totals.fees).toContain("0.00"); expect(totals.rating).toBeNull();
  });
  it("distinguishes unavailable data from a valid empty day", () => {
    expect(driverHomeTotals(null, null, today)).toEqual({ trips: null, earnings: null, fees: null, rating: null });
    expect(driverHomeTotals({ currencyCode: "USD", trips: [] }, [], today).trips).toBe(0);
  });
  it("uses only disclosed ratings and averages them without revealing hidden ratings", () => {
    expect(driverHomeTotals(null, [{ bookingId: "one", completedAt, receivedRating: { overall: 5 } }, { bookingId: "two", completedAt, receivedRating: { overall: 4 } }, { bookingId: "hidden", completedAt, receivedRating: null }], today).rating).toBe("4.50");
  });
});
