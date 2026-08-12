import { afterEach, describe, expect, it, vi } from "vitest";
import {
  coordinateDistanceKm,
  formatRouteDistance,
  formatRouteDuration,
  geocodePermanentAddress,
  retrieveAddressSuggestion,
  routeTripMetrics,
  suggestRegionalAddresses,
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
  it("uses traffic-aware road metrics for a trusted fare quote", async () => {
    const fetchMock = vi.fn((input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
      expect(url.pathname).toContain("/directions/v5/mapbox/driving-traffic/");
      return Promise.resolve(new Response(JSON.stringify({ routes: [{ distance: 24140.16, duration: 1680 }] })));
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(routeTripMetrics({
      accessToken: "public-token",
      pickup: { latitude: 40.05, longitude: -75.15 },
      destination: { latitude: 39.87, longitude: -75.24 },
    })).resolves.toEqual({ distanceMeters: 24140, durationSeconds: 1680 });
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
    ).resolves.toEqual({
      latitude: 39.8744,
      longitude: -75.2424,
      formattedAddress: "PHL AIRPORT",
    });
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
  it("accepts and normalizes a regional medium-confidence spelling correction", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      features: [{
        geometry: { coordinates: [-75.189, 39.953] },
        properties: {
          feature_type: "address",
          full_address: "3141 Chestnut Street, Philadelphia, Pennsylvania 19104, United States",
          match_code: { confidence: "medium" },
        },
      }],
    })))));
    await expect(
      geocodePermanentAddress("3141 chesnut street philadelphia", "public-token", {
        latitude: 39.9526,
        longitude: -75.1652,
        maxDistanceKm: 50,
        requireVerifiedAddress: true,
      }),
    ).resolves.toEqual({
      latitude: 39.953,
      longitude: -75.189,
      formattedAddress: "3141 Chestnut Street, Philadelphia, Pennsylvania 19104, United States",
    });
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
  it("requests regional autocomplete suggestions with one search session", async () => {
    const fetchMock = vi.fn((input: URL | RequestInfo) => {
      const url = input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
      expect(url.pathname).toBe("/search/searchbox/v1/suggest");
      expect(url.searchParams.get("session_token")).toBe("session-1");
      expect(url.searchParams.get("proximity")).toBe("-75.1652,39.9526");
      expect(url.searchParams.get("types")).toBe("address");
      expect(url.searchParams.get("bbox")).toBeTruthy();
      return Promise.resolve(new Response(JSON.stringify({ suggestions: [{
        mapbox_id: "address.3141",
        name: "3141 Chestnut Street",
        place_formatted: "Philadelphia, Pennsylvania 19104, United States",
      }] })));
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(suggestRegionalAddresses({
      accessToken: "public-token",
      context: { latitude: 39.9526, longitude: -75.1652 },
      query: "3141 chesnut",
      radiusKm: 50,
      sessionToken: "session-1",
      types: "address",
    })).resolves.toEqual([{
      mapboxId: "address.3141",
      label: "3141 Chestnut Street, Philadelphia, Pennsylvania 19104, United States",
    }]);
  });
  it("retrieves the selected autocomplete result with the same session", async () => {
    const fetchMock = vi.fn((input: URL | RequestInfo) => {
      const url = input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
      expect(url.pathname).toBe("/search/searchbox/v1/retrieve/address.3141");
      expect(url.searchParams.get("session_token")).toBe("session-1");
      return Promise.resolve(new Response(JSON.stringify({ features: [{ properties: {
        full_address: "3141 Chestnut Street, Philadelphia, Pennsylvania 19104, United States",
      } }] })));
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(retrieveAddressSuggestion({
      accessToken: "public-token",
      mapboxId: "address.3141",
      sessionToken: "session-1",
    })).resolves.toEqual({
      mapboxId: "address.3141",
      label: "3141 Chestnut Street, Philadelphia, Pennsylvania 19104, United States",
    });
  });
});
