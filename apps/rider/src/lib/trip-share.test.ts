import { describe, expect, it } from "vitest";
import { readSharedTrip, shareTokenPattern } from "./trip-share";
describe("shared trip projection", () => {
  it("whitelists only active status, expiry and coordinates", () => {
    expect(readSharedTrip({ status: "accepted", expiresAt: "2026-10-12T20:00:00Z", secret: "PRIVATE",
      location: { latitude: 40, longitude: -75, recordedAt: "2026-10-12T19:00:00Z", address: "PRIVATE" } }))
      .toEqual({ status: "accepted", expiresAt: "2026-10-12T20:00:00Z", location: { latitude: 40, longitude: -75, recordedAt: "2026-10-12T19:00:00Z" } });
  });
  it("rejects terminal/malformed state and invalid coordinates", () => {
    for (const value of [null, {}, { status: "completed", expiresAt: "2026-10-12T20:00:00Z" }]) expect(readSharedTrip(value)).toBeNull();
    expect(readSharedTrip({ status: "arrived", expiresAt: "2026-10-12T20:00:00Z", location: { latitude: 999 } })?.location).toBeNull();
  });
  it("accepts only bounded URL-safe random tokens", () => {
    expect(shareTokenPattern.test("A".repeat(43))).toBe(true);
    for (const value of ["", "A".repeat(44), "../secret", "https://elsewhere.test"]) expect(shareTokenPattern.test(value)).toBe(false);
  });
});
