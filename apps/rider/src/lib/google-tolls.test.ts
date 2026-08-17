import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateGoogleToll } from "./google-tolls";

afterEach(() => vi.unstubAllGlobals());

describe("Google Routes toll estimates", () => {
  it("returns a USD minor-unit estimate", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      routes: [{ travelAdvisory: { tollInfo: { estimatedPrice: [{ currencyCode: "USD", units: "6", nanos: 0 }] } } }],
    })) )));
    await expect(estimateGoogleToll("google-key", { latitude: 39.89, longitude: -75.12 }, { latitude: 39.90, longitude: -75.16 }))
      .resolves.toEqual(expect.objectContaining({ amountMinor: 600, currencyCode: "USD", estimated: true }));
  });

  it("returns no toll when Google omits toll information", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ routes: [{}] })) )));
    await expect(estimateGoogleToll("google-key", { latitude: 39.89, longitude: -75.12 }, { latitude: 39.90, longitude: -75.16 }))
      .resolves.toBeNull();
  });

  it("includes the provider HTTP status for a rejected request", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      error: { status: "PERMISSION_DENIED", message: "Routes API is disabled" },
    }), { status: 403 }))));
    await expect(estimateGoogleToll("google-key", { latitude: 39.89, longitude: -75.12 }, { latitude: 39.90, longitude: -75.16 }))
      .rejects.toThrow("temporarily unavailable (403 PERMISSION_DENIED): Routes API is disabled");
  });
});
