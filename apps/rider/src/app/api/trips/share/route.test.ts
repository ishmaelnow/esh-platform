import { beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), service: vi.fn(), authenticated: vi.fn() }));
vi.mock("@esh-platform/supabase", () => ({ createAuthenticatedSupabaseClient: mocks.authenticated, createServiceSupabaseClient: () => ({ rpc: mocks.service }) }));
import { GET, POST, DELETE } from "./route";
import { POST as read } from "../shared/route";
const bookingId = "90000000-0000-4000-8000-000000000001";
beforeEach(() => { vi.clearAllMocks(); mocks.authenticated.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: { active: true, expiresAt: new Date(Date.now()+60_000).toISOString() }, error: null }); });
function request(method: string, authenticated = true) { return new Request(`https://rider.test/api/trips/share?bookingId=${bookingId}`, {
  method, headers: authenticated ? { Authorization: "Bearer TEST" } : {}, ...(method !== "GET" ? { body: JSON.stringify({ bookingId }) } : {}) }); }
it("requires auth and uses only the caller JWT for owner operations", async () => {
  expect((await POST(request("POST", false))).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
  await GET(request("GET")); await DELETE(request("DELETE"));
  expect(mocks.authenticated).toHaveBeenCalledWith("TEST"); expect(mocks.service).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith("manage_my_trip_share", { booking_value: bookingId, action_value: "stop" });
});
it("returns random raw tokens once and stores only their SHA-256 hashes", async () => {
  const response = await POST(request("POST")); const data = await response.json() as { token: string };
  expect(data.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(mocks.rpc).toHaveBeenCalledWith("manage_my_trip_share", { booking_value: bookingId, action_value: "create", hash_value: createHash("sha256").update(data.token).digest("hex") });
  expect(response.headers.get("cache-control")).toContain("no-store");
  const second = await POST(request("POST")); expect((await second.json() as { token: string }).token).not.toBe(data.token);
});
it("hides backend errors and never returns a token on failure", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE" } });
  const response = await POST(request("POST")); expect(response.status).toBe(400); expect(await response.text()).not.toContain("PRIVATE");
});
it("public reads reject malformed tokens before using service privileges", async () => {
  expect((await read(new Request("https://rider.test/api/trips/shared", { method: "POST", body: JSON.stringify({ token: "invalid" }) }))).status).toBe(404);
  expect(mocks.service).not.toHaveBeenCalled();
});
it("public response strips internal fields and expired links fail closed", async () => {
  const body = JSON.stringify({ token: "A".repeat(43) });
  mocks.service.mockResolvedValue({ data: { status: "accepted", expiresAt: new Date(Date.now()+60_000).toISOString(), customer_phone: "PRIVATE", location: null }, error: null });
  const response = await read(new Request("https://rider.test/api/trips/shared", { method: "POST", body }));
  expect(response.status).toBe(200); expect(await response.text()).not.toContain("PRIVATE");
  mocks.service.mockResolvedValue({ data: null, error: null });
  expect((await read(new Request("https://rider.test/api/trips/shared", { method: "POST", body }))).status).toBe(404);
});
it("temporary backend exceptions remain retryable and do not expose internals", async () => {
  mocks.service.mockRejectedValue(new Error("PRIVATE"));
  const response = await read(new Request("https://rider.test/api/trips/shared", { method: "POST", body: JSON.stringify({ token: "A".repeat(43) }) }));
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("PRIVATE");
});
