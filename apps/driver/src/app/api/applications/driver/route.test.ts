import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), service: vi.fn() }));
vi.mock("@esh-platform/supabase", () => ({ createAuthenticatedSupabaseClient: mocks.authenticated, createServiceSupabaseClient: mocks.service }));
import { GET, POST } from "./route";

const authRpc = vi.fn();
const serviceRpc = vi.fn();
const upload = vi.fn();
const remove = vi.fn();
const getUser = vi.fn();
const single = vi.fn();
const eq = vi.fn(() => ({ single }));

function applicationRequest(options: { files?: boolean; slug?: string; extra?: boolean } = {}) {
  const form = new FormData();
  form.set("tenantSlug", options.slug ?? "fixture-company"); form.set("fullName", "Fixture Applicant");
  if (options.files !== false) for (const field of ["personalPhoto", "driverIdPhoto", "vehiclePhoto", "document", "insurance"])
    form.set(field, new File([new Uint8Array([255, 216, 255, 224, 0])], `${field}.jpg`, { type: "image/jpeg" }));
  if (options.extra) { form.set("applicant_user_id", "victim"); form.set("tenant_id", "victim-tenant"); form.set("email", "victim@example.invalid"); }
  return new Request("http://driver.test/api/applications/driver", { method: "POST", body: form, headers: { Authorization: "Bearer fixture-token" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "verified-applicant", email: "applicant@example.invalid", email_confirmed_at: "2026-10-02" } }, error: null });
  authRpc.mockImplementation((name: string) => Promise.resolve({ data: name === "list_transport_application_tenants" ? [{ tenant_slug: "fixture-company", display_name: "Fixture company" }] : [], error: null }));
  mocks.authenticated.mockReturnValue({ auth: { getUser }, rpc: authRpc });
  single.mockResolvedValue({ data: { tenant_id: "authorized-tenant" }, error: null });
  upload.mockResolvedValue({ error: null }); remove.mockResolvedValue({ error: null });
  serviceRpc.mockImplementation((_name: string, input: { uploaded_evidence: Array<{ storage_path: string }> }) => Promise.resolve({
    data: { applicationId: "application", acceptedPaths: input.uploaded_evidence.map((file) => file.storage_path) }, error: null,
  }));
  mocks.service.mockReturnValue({ from: () => ({ select: () => ({ eq }) }), storage: { from: () => ({ upload, remove }) }, rpc: serviceRpc });
});

describe("Driver applicant API authorization and submission", () => {
  it("rejects unauthenticated requests before creating a privileged client", async () => {
    expect((await GET(new Request("http://driver.test/api/applications/driver"))).status).toBe(401);
    expect(mocks.service).not.toHaveBeenCalled(); expect(mocks.authenticated).not.toHaveBeenCalled();
  });
  it("rejects unverified identity before reading status or uploading", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "unverified", email: "applicant@example.invalid" } }, error: null });
    expect((await POST(applicationRequest())).status).toBe(401);
    expect(authRpc).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
  });
  it("reads only the authenticated own-status RPC without using service role", async () => {
    const response = await GET(new Request("http://driver.test/api/applications/driver?applicant_user_id=victim", { headers: { Authorization: "Bearer fixture-token" } }));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(authRpc).toHaveBeenCalledWith("my_driver_applications"); expect(mocks.service).not.toHaveBeenCalled();
  });
  it("fails closed when status is unavailable", async () => {
    authRpc.mockResolvedValue({ data: null, error: { message: "private database details" } });
    const response = await GET(new Request("http://driver.test", { headers: { Authorization: "Bearer fixture-token" } }));
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("private database details");
  });
  it("rejects a company absent from the active application directory", async () => {
    expect((await POST(applicationRequest({ slug: "other-tenant" }))).status).toBe(400);
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("validates evidence before creating a privileged client", async () => {
    const form = new FormData(); form.set("tenantSlug", "fixture-company"); form.set("fullName", "Fixture Applicant");
    form.set("personalPhoto", new File(["<script>unsafe</script>"], "photo.jpg", { type: "image/jpeg" }));
    const response = await POST(new Request("http://driver.test", { method: "POST", body: form, headers: { Authorization: "Bearer fixture-token" } }));
    expect(response.status).toBe(400); expect(mocks.service).not.toHaveBeenCalled();
  });
  it("rejects oversized streamed multipart content without trusting content length", async () => {
    const request = new Request("http://driver.test", { method: "POST", body: "x".repeat(4_400_001), headers: { Authorization: "Bearer fixture-token", "Content-Type": "multipart/form-data; boundary=fixture" } });
    expect((await POST(request)).status).toBe(413); expect(upload).not.toHaveBeenCalled();
  });
  it("derives identity and tenant on the server and submits all evidence in one transaction", async () => {
    expect((await POST(applicationRequest({ extra: true }))).status).toBe(200);
    expect(serviceRpc).toHaveBeenCalledTimes(1);
    const [name, input] = serviceRpc.mock.calls[0]! as [string, { applicant_user_id: string; uploaded_evidence: Array<{ storage_path: string }> }];
    expect(name).toBe("submit_driver_application_with_evidence_internal");
    expect(input.applicant_user_id).toBe("verified-applicant"); expect(input).not.toHaveProperty("email");
    expect(input.uploaded_evidence).toHaveLength(5);
    expect(input.uploaded_evidence.every((file: { storage_path: string }) => file.storage_path.startsWith("authorized-tenant/verified-applicant/"))).toBe(true);
  });
  it("cleans successful uploads when a later upload fails, without creating an application", async () => {
    upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "failed" } });
    expect((await POST(applicationRequest())).status).toBe(503);
    expect(remove.mock.calls[0]![0]).toHaveLength(1); expect(serviceRpc).not.toHaveBeenCalled();
  });
  it("removes uploaded files after a confirmed database rollback", async () => {
    serviceRpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "application reviewed" } });
    expect((await POST(applicationRequest())).status).toBe(409); expect(remove.mock.calls[0]![0]).toHaveLength(5);
  });
  it("retains files when a network failure makes the transaction outcome unknown", async () => {
    serviceRpc.mockResolvedValue({ data: null, error: { code: "", message: "network unavailable" } });
    expect((await POST(applicationRequest())).status).toBe(503); expect(remove).not.toHaveBeenCalled();
  });
  it("cleans unused uploads after an idempotent duplicate succeeds", async () => {
    serviceRpc.mockResolvedValue({ data: { applicationId: "application", acceptedPaths: [] }, error: null });
    expect((await POST(applicationRequest())).status).toBe(200); expect(remove.mock.calls[0]![0]).toHaveLength(5);
  });
});
