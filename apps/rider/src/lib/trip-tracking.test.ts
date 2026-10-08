import { describe, expect, it } from "vitest";
import { currentTripLocation, trackingMessage } from "./trip-tracking";
const now = Date.parse("2026-10-08T12:00:00Z");
const location = { bookingId: "test", latitude: 32.78, longitude: -96.8, accuracyMeters: 10, recordedAt: new Date(now).toISOString(), fresh: true };
describe("Rider tracking exposure and freshness", () => {
  it.each(["requested", "offered", "completed", "cancelled"])("hides cached location in %s", (status) => {
    expect(currentTripLocation(status, location, now)).toBeNull();
  });
  it("ages cached readings without requiring a successful refresh", () => {
    expect(currentTripLocation("accepted", location, now + 61_000)?.fresh).toBe(false);
    expect(currentTripLocation("accepted", location, now + 60_000)?.fresh).toBe(true);
    expect(currentTripLocation("accepted", { ...location, fresh: false }, now)?.fresh).toBe(false);
  });
  it("rejects invalid coordinates and never treats invalid timestamps as fresh", () => {
    expect(currentTripLocation("accepted", { ...location, latitude: 100 }, now)).toBeNull();
    expect(currentTripLocation("accepted", { ...location, recordedAt: "invalid" }, now)?.fresh).toBe(false);
  });
  it("distinguishes arrival from destination travel", () => {
    expect(trackingMessage("arrived")).toBe("Your driver has arrived");
    expect(trackingMessage("in_progress")).toContain("destination");
  });
});
