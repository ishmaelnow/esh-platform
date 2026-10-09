import { describe, expect, it } from "vitest";
import { preorderTime, readPreorders } from "./DriverPreorders";
const valid = { receiveWhileOffline: false, timeZone: "America/Chicago", assignedCount: 0, newCount: 1, assigned: [],
  new: [{ bookingId: "booking", serviceAreaName: "Area", scheduledPickupAt: "2026-10-12T16:00:00Z",
    dispatchReadyAt: "2026-10-12T15:30:00Z", fareAmountMinor: 2500, fareCurrencyCode: "USD" }] };
describe("preorder data contract", () => {
  it("accepts real empty and populated results without manufacturing counts", () => {
    expect(readPreorders(valid)).toBe(valid);
    expect(readPreorders({ ...valid, newCount: 0, new: [] }).new).toEqual([]);
  });
  it("rejects unavailable and malformed results instead of treating them as empty", () => {
    for (const value of [null, [], {}, { ...valid, newCount: -1 }, { ...valid, timeZone: "invalid-zone" },
      { ...valid, new: [{ ...valid.new[0], scheduledPickupAt: "invalid" }] },
      { ...valid, new: [{ ...valid.new[0], fareAmountMinor: Number.MAX_SAFE_INTEGER + 1 }] }])
      expect(() => readPreorders(value)).toThrow();
  });
  it("formats pickup times in the tenant time zone", () => {
    expect(preorderTime("2026-10-12T16:00:00Z", "America/Chicago")).toContain("11:00");
    expect(preorderTime("2026-10-12T16:00:00Z", "America/New_York")).toContain("12:00");
  });
});
