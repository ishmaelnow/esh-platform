import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Maps from "@esh-platform/maps";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), user: vi.fn(), geocode: vi.fn() }));
vi.mock("@esh-platform/supabase", () => ({ createAuthenticatedSupabaseClient: () => ({ auth: { getUser: mocks.user }, rpc: mocks.rpc }) }));
vi.mock("@esh-platform/maps", async (original) => ({ ...await original<typeof Maps>(), geocodePermanentAddress: mocks.geocode }));
import { POST } from "./route";

const riderId = "22222222-2222-4222-8222-222222222222";
const body = { tenantSlug: "provider", riderProfileId: riderId, key: "home", label: "Selected address", latitude: 32.79, longitude: -96.81 };
function request(overrides: Record<string, unknown> = {}, authenticated = true) {
  return new Request("https://rider.test/api/places", { method: "POST", headers: {
    "Content-Type": "application/json", Origin: "https://rider.test", ...(authenticated ? { Authorization: "Bearer fixture" } : {}),
  }, body: JSON.stringify({ ...body, ...overrides }) });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "fixture");
  mocks.user.mockResolvedValue({ data: { user: { email_confirmed_at: "2026-10-01" } }, error: null });
  mocks.rpc.mockImplementation((name: string) => Promise.resolve({ error: null,
    data: name === "my_rider_portal" ? { profile: { riderProfileId: riderId, status: "active" } } : null }));
  mocks.geocode.mockResolvedValue({ formattedAddress: "Permanent address", latitude: 32.7901, longitude: -96.8101 });
});
afterEach(() => vi.unstubAllEnvs());

describe("private saved address endpoint", () => {
  it("requires verified authentication before maps or mutations", async () => {
    expect((await POST(request({}, false))).status).toBe(401);
    mocks.user.mockResolvedValue({ data: { user: {} }, error: null });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.geocode).not.toHaveBeenCalled();
  });
  it("rejects foreign accounts and inactive profiles before geocoding", async () => {
    expect((await POST(request({ riderProfileId: "other" }))).status).toBe(403);
    mocks.rpc.mockResolvedValue({ data: { profile: { riderProfileId: riderId, status: "inactive" } }, error: null });
    expect((await POST(request())).status).toBe(403); expect(mocks.geocode).not.toHaveBeenCalled();
  });
  it("rejects invalid keys, missing coordinates, invalid latitude and excessive labels", async () => {
    for (const overrides of [{ key: "office" }, { latitude: null }, { latitude: 91 }, { label: "x".repeat(501) }, { label: " " }])
      expect((await POST(request(overrides))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("bounds JSON bodies before parsing and handles malformed JSON", async () => {
    const raw = (value: string) => new Request("https://rider.test/api/places", { method: "POST", headers: { Authorization: "Bearer fixture" }, body: value });
    expect((await POST(raw("x".repeat(4097)))).status).toBe(413);
    expect((await POST(raw("{"))).status).toBe(400);
    expect(mocks.geocode).not.toHaveBeenCalled();
  });
  it("stores server permanent geography, not client coordinates, through authenticated ownership", async () => {
    const result = await POST(request({ tenantId: "ignored", personId: "ignored" }));
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
    expect(mocks.geocode).toHaveBeenCalledWith("Selected address", "fixture", {
      latitude: 32.79, longitude: -96.81, maxDistanceKm: 2, requireVerifiedAddress: true, requestOrigin: "https://rider.test",
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith("save_my_rider_place", {
      target_tenant_slug: "provider", expected_rider_profile_id: riderId, place_key_value: "home",
      address_label_value: "Permanent address", latitude_value: 32.7901, longitude_value: -96.8101,
    });
  });
  it("does not persist unverifiable or malformed geocoding results", async () => {
    mocks.geocode.mockRejectedValueOnce(new Error("private provider detail"));
    const result = await POST(request()); expect(result.status).toBe(422);
    expect(await result.text()).not.toContain("private provider detail");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    mocks.geocode.mockResolvedValue({ formattedAddress: "Invalid", latitude: NaN, longitude: 0 });
    expect((await POST(request())).status).toBe(503);
  });
  it("reports uncertain writes without success or sensitive backend errors", async () => {
    mocks.rpc.mockImplementation((name: string) => Promise.resolve(name === "my_rider_portal"
      ? { data: { profile: { riderProfileId: riderId, status: "active" } }, error: null }
      : { data: null, error: { message: "private backend detail" } }));
    const result = await POST(request()); expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ message: "Save status is uncertain. Refresh saved addresses before retrying." });
  });
  it("handles unavailable profile and map configuration before saving", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "");
    expect((await POST(request())).status).toBe(503); expect(mocks.geocode).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "private detail" } });
    expect((await POST(request())).status).toBe(503);
  });
});
