import { afterEach, describe, expect, it, vi } from "vitest";
import {
  coordinateDistanceKm,
  formatRouteDistance,
  formatRouteDuration,
  geocodePermanentAddress,
} from "./index";

afterEach(() => vi.unstubAllGlobals());

describe("trip route formatting", () => {
  it("formats road distance in miles", () => {
    expect(formatRouteDistance(8046.72)).toBe("5.0 mi");
    expect(formatRouteDistance(32186.88)).toBe("20 mi");
  });
  it("formats short and long ETAs", () => {
    expect(formatRouteDuration(600)).toBe("10 min");
    expect(formatRouteDuration(4500)).toBe("1 hr 15 min");
  });
  it("measures coordinates so implausible geocoding can be rejected", () => {
    const philadelphiaToAirport = coordinateDistanceKm(
      { latitude: 39.9526, longitude: -75.1652 },
      { latitude: 39.8744, longitude: -75.2424 },
    );
    const philadelphiaToLosAngeles = coordinateDistanceKm(
      { latitude: 39.9526, longitude: -75.1652 },
      { latitude: 34.0522, longitude: -118.2437 },
    );
    expect(philadelphiaToAirport).toBeLessThan(20);
    expect(philadelphiaToLosAngeles).toBeGreaterThan(3_000);
  });
  it("biases geocoding to the service area and skips a cross-country result", async () => {
    const fetchMock = vi.fn((input: URL | RequestInfo) => {
      const url = input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
      expect(url.searchParams.get("proximity")).toBe("-75.1652,39.9526");
      expect(url.searchParams.get("limit")).toBe("5");
      return Promise.resolve(new Response(JSON.stringify({
        features: [
          { geometry: { coordinates: [-118.2437, 34.0522] } },
          { geometry: { coordinates: [-75.2424, 39.8744] } },
        ],
      })));
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      geocodePermanentAddress("PHL AIRPORT", "public-token", {
        latitude: 39.9526,
        longitude: -75.1652,
      }),
    ).resolves.toEqual({ latitude: 39.8744, longitude: -75.2424 });
  });
  it("rejects an unverified pickup even when it is geographically nearby", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      features: [{
        geometry: { coordinates: [-75.2424, 39.8744] },
        properties: { feature_type: "address", match_code: { confidence: "low" } },
      }],
    })))));
    await expect(
      geocodePermanentAddress("6434 GARMIN ST PHILADELPHIA", "public-token", {
        latitude: 39.9526,
        longitude: -75.1652,
        maxDistanceKm: 50,
        requireVerifiedAddress: true,
      }),
    ).rejects.toThrow("complete, verified street address");
  });
  it("rejects results outside the regional trip boundary", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      features: [{ geometry: { coordinates: [-118.2437, 34.0522] } }],
    })))));
    await expect(
      geocodePermanentAddress("ambiguous place", "public-token", {
        latitude: 39.9526,
        longitude: -75.1652,
      }),
    ).rejects.toThrow("could not be verified near the selected service area");
  });
});
