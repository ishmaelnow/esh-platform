import { describe, expect, it } from "vitest";
import { resolveRideCoverage } from "./service-coverage";

const area = { serviceAreaId: "authorized", latitude: 32.78, longitude: -96.8, radiusKm: 20 };
describe("automatic service coverage", () => {
  it("selects a covering pickup area while retaining out-of-area destinations", () => {
    expect(resolveRideCoverage([area], area, { latitude: 33.3, longitude: -96.8 }).serviceAreaId).toBe("authorized");
  });
  it("chooses the nearest authorized center deterministically for overlapping areas", () => {
    const nearer = { ...area, serviceAreaId: "nearer", latitude: 32.79 };
    expect(resolveRideCoverage([area, nearer], nearer, area).serviceAreaId).toBe("nearer");
  });
  it("rejects uncovered pickup, distant destination and invalid coordinates", () => {
    expect(() => resolveRideCoverage([area], { latitude: 35, longitude: -96.8 }, area)).toThrow(/coverage/);
    expect(() => resolveRideCoverage([area], area, { latitude: 45, longitude: -96.8 })).toThrow(/coverage/);
    expect(() => resolveRideCoverage([area], { latitude: NaN, longitude: -96.8 }, area)).toThrow(/verified/);
    expect(() => resolveRideCoverage([], area, area)).toThrow(/coverage/);
  });
});
