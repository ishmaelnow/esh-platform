import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), service: vi.fn() }));
vi.mock("@esh-platform/supabase", () => ({ createAuthenticatedSupabaseClient: mocks.authenticated, createServiceSupabaseClient: mocks.service }));
import { GET, POST, DELETE } from "./route";

const tenantId = "11111111-1111-4111-8111-111111111111";
const riderId = "22222222-2222-4222-8222-222222222222";
const prefix = `${tenantId}/${riderId}/`;
const getUser = vi.fn(), rpc = vi.fn(), single = vi.fn(), sign = vi.fn(), upload = vi.fn(), remove = vi.fn();
const query = { select: vi.fn(), eq: vi.fn(), single };
const storage = { createSignedUrl: sign, upload, remove };
const from = vi.fn(() => storage);
function request(method = "GET", body?: FormData, extra = "", auth = "Bearer fixture") {
  return new Request(`https://rider.test/api/profile/photo?tenantSlug=provider${extra}`, {
    method, headers: { Authorization: auth }, ...(body ? { body } : {}),
  });
}
function photoForm(mime = "image/jpeg", bytes = new Uint8Array([255, 216, 255, 1, 255, 217])) {
  const form = new FormData(); form.set("photo", new File([bytes], "photo.jpg", { type: mime }));
  form.set("tenantId", "attacker-tenant"); form.set("riderProfileId", "attacker-rider"); form.set("storagePath", "attacker/path");
  return form;
}
beforeEach(() => {
  vi.clearAllMocks();
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  getUser.mockResolvedValue({ data: { user: { id: "owner", email_confirmed_at: "2026-10-01" } }, error: null });
  rpc.mockImplementation((name: string) => Promise.resolve(name === "my_rider_portal"
    ? { data: { tenant: { tenantId }, profile: { riderProfileId: riderId, status: "active" } }, error: null }
    : { data: { previousPath: `${prefix}old.jpg` }, error: null }));
  single.mockResolvedValue({ data: { photo_storage_path: `${prefix}photo.jpg` }, error: null });
  sign.mockResolvedValue({ data: { signedUrl: "https://storage.test/private-photo" }, error: null });
  upload.mockResolvedValue({ error: null }); remove.mockResolvedValue({ error: null });
  mocks.authenticated.mockReturnValue({ auth: { getUser }, rpc, from: vi.fn(() => query) });
  mocks.service.mockReturnValue({ storage: { from } });
});

describe("private Rider profile photo", () => {
  it("requires verified authentication before any privileged storage", async () => {
    expect((await GET(request("GET", undefined, "", ""))).status).toBe(401);
    getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
    expect((await POST(request("POST", photoForm()))).status).toBe(401);
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("denies a provider without an owned active profile and tenant resolution failures", async () => {
    rpc.mockResolvedValueOnce({ data: { tenant: { tenantId }, profile: null }, error: null });
    expect((await POST(request("POST", photoForm()))).status).toBe(403);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "private backend detail" } });
    const result = await GET(request()); expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private backend detail");
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("signs only an RLS-owned scoped path for five minutes without returning the raw path", async () => {
    const result = await GET(request("GET", undefined, "&riderProfileId=someone-else"));
    expect(query.eq).toHaveBeenCalledWith("tenant_id", tenantId);
    expect(query.eq).toHaveBeenCalledWith("rider_profile_id", riderId);
    expect(sign).toHaveBeenCalledWith(`${prefix}photo.jpg`, 300);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toEqual({ url: "https://storage.test/private-photo" });
    single.mockResolvedValueOnce({ data: { photo_storage_path: "another-rider/file.jpg" }, error: null });
    sign.mockClear(); expect((await GET(request())).status).toBe(503); expect(sign).not.toHaveBeenCalled();
  });
  it("treats no optional photo as a successful empty result without storage access", async () => {
    single.mockResolvedValueOnce({ data: { photo_storage_path: null }, error: null });
    expect(await (await GET(request())).json()).toEqual({ url: null }); expect(mocks.service).not.toHaveBeenCalled();
  });
  it("bounds bodies and rejects forged MIME signatures before upload", async () => {
    expect((await POST(request("POST", photoForm("image/jpeg", new Uint8Array([60, 104, 116, 109, 108]))))).status).toBe(400);
    expect((await POST(request("POST", photoForm("application/pdf")))).status).toBe(400);
    const oversized = new Request("https://rider.test/api/profile/photo?tenantSlug=provider", {
      method: "POST", headers: { Authorization: "Bearer fixture", "Content-Type": "multipart/form-data; boundary=fixture" },
      body: new Uint8Array(1_150_000),
    });
    expect((await POST(oversized)).status).toBe(413);
    expect(upload).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
  });
  it("uploads under derived ownership, commits through own RPC and removes only replaced scoped photo", async () => {
    const result = await POST(request("POST", photoForm())); expect(result.status).toBe(200);
    expect(from).toHaveBeenCalledWith("rider-profile-photos");
    const path = upload.mock.calls[0]?.[0] as string;
    expect(path).toMatch(new RegExp(`^${prefix}[0-9a-f-]+\\.jpg$`));
    expect(rpc).toHaveBeenCalledWith("set_my_rider_profile_photo", { target_tenant_slug: "provider", storage_path_value: path, mime_type_value: "image/jpeg" });
    expect(remove).toHaveBeenCalledWith([`${prefix}old.jpg`]);
  });
  it("retains candidate photo on ambiguous commit failures and omits diagnostics", async () => {
    rpc.mockImplementation((name: string) => Promise.resolve(name === "my_rider_portal"
      ? { data: { tenant: { tenantId }, profile: { riderProfileId: riderId, status: "active" } }, error: null }
      : { data: null, error: { message: "secret storage path" } }));
    const result = await POST(request("POST", photoForm())); expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("secret storage path"); expect(remove).not.toHaveBeenCalled();
  });
  it("removes metadata via own RPC before best-effort scoped storage cleanup", async () => {
    const result = await DELETE(request("DELETE")); expect(result.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_my_rider_profile_photo", { target_tenant_slug: "provider", storage_path_value: null, mime_type_value: null });
    expect(remove).toHaveBeenCalledWith([`${prefix}old.jpg`]);
    remove.mockClear(); rpc.mockImplementation((name: string) => Promise.resolve(name === "my_rider_portal"
      ? { data: { tenant: { tenantId }, profile: { riderProfileId: riderId, status: "active" } }, error: null }
      : { data: { previousPath: "another-tenant/private.jpg" }, error: null }));
    expect((await DELETE(request("DELETE"))).status).toBe(200); expect(remove).not.toHaveBeenCalled();
  });
});
