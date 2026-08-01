import { describe, expect, it } from "vitest";
import { locationErrorMessage, locationFreshness } from "./location";

describe("Driver location privacy helpers", () => {
  it("classifies readings at the Rider freshness boundary", () => {
    const now = Date.parse("2026-08-01T12:01:00.000Z");
    expect(locationFreshness("2026-08-01T12:00:00.000Z", now)).toEqual({
      ageSeconds: 60,
      fresh: true,
    });
    expect(locationFreshness("2026-08-01T11:59:59.000Z", now).fresh).toBe(false);
  });

  it("turns browser permission and GPS failures into actionable messages", () => {
    expect(locationErrorMessage({ code: 1 })).toMatch(/permission was denied/i);
    expect(locationErrorMessage({ code: 2 })).toMatch(/could not determine/i);
    expect(locationErrorMessage({ code: 3 })).toMatch(/timed out/i);
  });
});
