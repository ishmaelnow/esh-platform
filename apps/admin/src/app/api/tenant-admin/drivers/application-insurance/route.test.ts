import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), service: vi.fn() }));
vi.mock("@esh-platform/supabase", () => ({ createServiceSupabaseClient: mocks.service, createAuthenticatedSupabaseClient: mocks.client }));
import { GET, POST } from "./route";

const rpc = vi.fn();
const record = vi.fn();
const signed = vi.fn();
const select = vi.fn();
const query = { eq: vi.fn(), maybeSingle: record };
const tenant = "10000000-0000-4000-8000-000000000001";
const app = "20000000-0000-4000-8000-000000000001";
const url = `http://admin.test/api/tenant-admin/drivers/application-insurance?tenantId=${tenant}&applicationId=${app}`;
const insurance = { original_file_name: "fixture-insurance.pdf", storage_bucket: "driver-application-files", storage_path: "tenant/fixture/insurance.pdf", vehicle_evidence_id: null };

beforeEach(() => {
  vi.clearAllMocks();
  query.eq.mockReturnValue(query); select.mockReturnValue(query);
  record.mockResolvedValue({ data: insurance, error: null });
  rpc.mockImplementation((name: string) => Promise.resolve({ data: name === "can_manage_driver_management" ? true : "fixture-evidence", error: null }));
  mocks.client.mockReturnValue({ rpc, from: () => ({ select }) });
  signed.mockResolvedValue({ data: { signedUrl: "https://storage.example.invalid/fixture" }, error: null });
  mocks.service.mockReturnValue({ storage: { from: () => ({ createSignedUrl: signed }) } });
});

describe("Historical application insurance access", () => {
  it("requires authentication and tenant permission before storage access", async () => {
    expect((await GET(new Request(url))).status).toBe(403); expect(mocks.service).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: false, error: null });
    expect((await GET(new Request(url, { headers: { Authorization: "Bearer fixture" } }))).status).toBe(403);
    expect(select).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
  });
  it("scopes insurance to tenant and application and returns only display metadata", async () => {
    const response = await GET(new Request(url, { headers: { Authorization: "Bearer fixture" } }));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(query.eq).toHaveBeenCalledWith("tenant_id", tenant); expect(query.eq).toHaveBeenCalledWith("driver_application_id", app);
    expect(await response.json()).toEqual({ insurance: { fileName: "fixture-insurance.pdf", linked: false } });
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("opens only the authorized record path, ignoring caller-supplied storage paths", async () => {
    const response = await GET(new Request(`${url}&open=1&storage_path=another-tenant/private.pdf`, { headers: { Authorization: "Bearer fixture" } }));
    expect(response.status).toBe(200); expect(signed).toHaveBeenCalledWith(insurance.storage_path, 600);
  });
  it("does not sign a URL when RLS returns no application insurance", async () => {
    record.mockResolvedValue({ data: null, error: null });
    const response = await GET(new Request(`${url}&open=1`, { headers: { Authorization: "Bearer fixture" } }));
    expect(await response.json()).toEqual({ insurance: null }); expect(mocks.service).not.toHaveBeenCalled();
  });
  it("retires linking without changing or approving evidence", () => {
    const response = POST();
    expect(response.status).toBe(410);
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });
});
