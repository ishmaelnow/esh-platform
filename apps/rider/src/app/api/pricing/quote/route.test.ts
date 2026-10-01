import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Maps from "@esh-platform/maps";

const mocks = vi.hoisted(() => ({ authRpc: vi.fn(), serviceRpc: vi.fn(), geocode: vi.fn(), route: vi.fn() }));
vi.mock("@esh-platform/supabase", () => ({
  createAuthenticatedSupabaseClient: () => ({ rpc: mocks.authRpc }),
  createServiceSupabaseClient: () => ({ rpc: mocks.serviceRpc, from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { fraction_digits: 2 }, error: null }) }) }) }) }),
}));
vi.mock("@esh-platform/maps", async (importOriginal) => ({
  ...await importOriginal<typeof Maps>(),
  geocodePermanentAddress: mocks.geocode, routeTripMetrics: mocks.route, resolveTollsForRoute: () => [],
}));
vi.mock("../../../../lib/toll-pricing", () => ({ loadTollCatalog: () => Promise.resolve([]) }));
import { POST } from "./route";

const pickup = { latitude: 32.78, longitude: -96.8, formattedAddress: "Verified pickup" };
const destination = { latitude: 33.3, longitude: -96.8, formattedAddress: "Verified destination" };
const body = { tenantSlug: "test-provider", pickupAddress: "Pickup", destinationAddress: "Destination", pickupCoordinates: pickup, destinationCoordinates: destination };
function request(overrides: Record<string, unknown> = {}, authorized = true) {
  return new Request("http://localhost/api/pricing/quote", { method: "POST", headers: { "Content-Type": "application/json", ...(authorized ? { Authorization: "Bearer contract-test" } : {}) }, body: JSON.stringify({ ...body, ...overrides }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "test-only");
  mocks.authRpc.mockImplementation((name: string, args: { target_service_area_id?: string }) => Promise.resolve({ error: null, data:
    name === "my_rider_portal" ? { profile: { riderProfileId: "rider-test" }, serviceAreas: [{ serviceAreaId: "near" }, { serviceAreaId: "far" }] }
      : args.target_service_area_id === "near" ? { latitude: 32.78, longitude: -96.8, radiusKm: 20 } : { latitude: 40, longitude: -110, radiusKm: 20 },
  }));
  mocks.geocode.mockImplementation((address: string) => Promise.resolve(address === "Pickup" ? pickup : destination));
  mocks.route.mockResolvedValue({ distanceMeters: 60000, durationSeconds: 3600, tollCollections: [] });
  mocks.serviceRpc.mockResolvedValue({ error: null, data: { quoteId: "quote-test", currencyCode: "USD", fareAmountMinor: 1000 } });
});
afterEach(() => vi.unstubAllEnvs());

describe("server automatic service coverage", () => {
  it("requires authentication before looking up coverage", async () => {
    expect((await POST(request({}, false))).status).toBe(400);
    expect(mocks.authRpc).not.toHaveBeenCalled();
  });
  it("rejects an unauthorized explicit area before pricing", async () => {
    expect((await POST(request({ serviceAreaId: "other-tenant" }))).status).toBe(400);
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });
  it("selects from server-geocoded coordinates despite misleading client hints", async () => {
    const response = await POST(request({ pickupCoordinates: { latitude: 40, longitude: -110 } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ serviceAreaId: "near" });
    expect(mocks.serviceRpc).toHaveBeenCalledWith("create_rider_price_quote_with_service_type", expect.objectContaining({ target_service_area_id: "near", pickup_latitude_value: pickup.latitude, destination_latitude_value: destination.latitude }));
  });
  it("rejects a server-resolved pickup outside every authorized area before routing or quoting", async () => {
    mocks.geocode.mockResolvedValue({ ...pickup, latitude: 45, longitude: -90 });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.route).not.toHaveBeenCalled();
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });
  it("rejects missing coordinates for new automatic-coverage requests", async () => {
    expect((await POST(request({ pickupCoordinates: null }))).status).toBe(400);
    expect(mocks.geocode).not.toHaveBeenCalled();
  });
  it("keeps existing explicit-area recurring callers compatible", async () => {
    expect((await POST(request({ serviceAreaId: "near", pickupCoordinates: null, destinationCoordinates: null }))).status).toBe(200);
  });
});
