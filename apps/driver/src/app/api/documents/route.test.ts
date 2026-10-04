import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), service: vi.fn() }));
vi.mock("@esh-platform/supabase", () => ({ createAuthenticatedSupabaseClient: mocks.authenticated, createServiceSupabaseClient: mocks.service }));
import { POST } from "./route";

const getUser = vi.fn();
const rpc = vi.fn();
const single = vi.fn();
const maybeSingle = vi.fn();
const sign = vi.fn();
const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), single, maybeSingle };
const from = vi.fn(() => query);
const bucket = vi.fn(() => ({ createSignedUrl: sign }));
const request = (body: Record<string, unknown> = {}, auth = "Bearer fixture") => new Request("https://driver.test/api/documents", {
  method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" },
  body: JSON.stringify({ evidenceType: "driver_id_photo", ...body }),
});
beforeEach(() => {
  vi.clearAllMocks();
  for (const method of [query.select, query.eq, query.order, query.limit]) method.mockReturnValue(query);
  getUser.mockResolvedValue({ data: { user: { id: "owner", email_confirmed_at: "2026-10-01" } }, error: null });
  rpc.mockResolvedValue({ data: { driverProfileId: "owned-driver" }, error: null });
  single.mockResolvedValue({ data: { tenant_id: "owned-tenant" }, error: null });
  maybeSingle.mockResolvedValue({ data: { storage_bucket: "driver-application-files", storage_path: "private/id.jpg", original_file_name: "ID.jpg", mime_type: "image/jpeg" }, error: null });
  sign.mockResolvedValue({ data: { signedUrl: "https://storage.test/private-preview" }, error: null });
  mocks.authenticated.mockReturnValue({ auth: { getUser }, rpc });
  mocks.service.mockReturnValue({ from, storage: { from: bucket } });
});
describe("own private document viewing", () => {
  it("rejects missing or unverified authentication before privileged access", async () => {
    expect((await POST(request({}, ""))).status).toBe(401);
    getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("derives driver and tenant, ignores supplied identities and signs only the latest owned file", async () => {
    const response = await POST(request({ driverProfileId: "someone-else", tenantId: "other", storagePath: "other/file" }));
    expect(response.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("driver_profile_id", "owned-driver");
    expect(query.eq).toHaveBeenCalledWith("tenant_id", "owned-tenant");
    expect(query.order).toHaveBeenCalledWith("submitted_at", { ascending: false });
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(1);
    expect(sign).toHaveBeenCalledWith("private/id.jpg", 300);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).not.toHaveProperty("storage_path");
  });
  it("rejects another application without accessing service/storage", async () => {
    rpc.mockResolvedValue({ data: [{ applicationId: "own-application" }], error: null });
    expect((await POST(request({ applicationId: "other-application" }))).status).toBe(404);
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("allows an owned application file through own-status authorization", async () => {
    rpc.mockResolvedValue({ data: [{ applicationId: "own-application" }], error: null });
    expect((await POST(request({ applicationId: "own-application" }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("my_driver_applications");
    expect(query.eq).toHaveBeenCalledWith("driver_application_id", "own-application");
  });
  it("fails closed on RPC errors, missing documents and storage failure without leaking diagnostics", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "private database detail" } });
    expect((await POST(request())).status).toBe(503);
    expect(mocks.service).not.toHaveBeenCalled();
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect((await POST(request())).status).toBe(404);
    expect(sign).not.toHaveBeenCalled();
    sign.mockResolvedValueOnce({ data: null, error: { message: "private storage detail" } });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private storage detail");
  });
  it("does not sign unsupported types or accounts without an owned profile", async () => {
    expect((await POST(request({ evidenceType: "unknown" }))).status).toBe(400);
    rpc.mockResolvedValue({ data: null, error: null });
    expect((await POST(request())).status).toBe(404);
    expect(mocks.service).not.toHaveBeenCalled();
  });
});
