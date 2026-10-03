import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), service: vi.fn() }));
vi.mock("@esh-platform/supabase", () => ({ createServiceSupabaseClient: mocks.service, createAuthenticatedSupabaseClient: mocks.client }));
import { GET, PATCH } from "./route";

const tenantId = "10000000-0000-4000-8000-000000000001";
const evidenceId = "20000000-0000-4000-8000-000000000001";
const update = vi.fn(), eq = vi.fn(), single = vi.fn(), requirement = vi.fn(), signed = vi.fn();
const query = { select: vi.fn(), eq, single, maybeSingle: requirement, update };
function review(body: Record<string, unknown>) {
  return PATCH(new Request("http://admin.test/api/tenant-admin/drivers/evidence", {
    method: "PATCH", headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, evidenceId, ...body }),
  }));
}
beforeEach(() => {
  vi.clearAllMocks();
  eq.mockReturnValue(query); query.select.mockReturnValue(query); update.mockReturnValue(query);
  single.mockResolvedValue({ data: { evidence_type: "insurance", evidence_id: evidenceId, storage_bucket: "driver-application-files", storage_path: "tenant/private-insurance.pdf" }, error: null });
  requirement.mockResolvedValue({ data: { expiration_required: true }, error: null });
  mocks.client.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: "fixture-reviewer", error: null }), from: () => query });
  signed.mockResolvedValue({ data: { signedUrl: "https://storage.example.invalid/fixture" }, error: null });
  mocks.service.mockReturnValue({ storage: { from: () => ({ createSignedUrl: signed }) } });
});
describe("Insurance uses the existing application evidence review", () => {
  it("requires a future expiration before approving insurance", async () => {
    expect((await review({ status: "approved" })).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
  it("reviews any ID through the same controls without inventing an expiration requirement", async () => {
    single.mockResolvedValue({ data: { evidence_type: "driver_id_photo", evidence_id: evidenceId }, error: null });
    requirement.mockResolvedValue({ data: { expiration_required: false }, error: null });
    expect((await review({ status: "approved" })).status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ review_status: "approved", expires_on: null }));
  });
  it("approves insurance without a vehicle or assignment", async () => {
    expect((await review({ status: "approved", expiresOn: "2099-01-01" })).status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ review_status: "approved", expires_on: "2099-01-01", reviewed_by_person_id: "fixture-reviewer" }));
    expect(eq).toHaveBeenCalledWith("tenant_id", tenantId);
    expect(eq).toHaveBeenCalledWith("evidence_id", evidenceId);
  });
  it("requires a reason for rejection and records it through the normal route", async () => {
    expect((await review({ status: "rejected" })).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
    expect((await review({ status: "rejected", notes: "Policy does not match" })).status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ review_status: "rejected", review_notes: "Policy does not match" }));
  });
  it("does not update when RLS hides another tenant's evidence", async () => {
    single.mockResolvedValue({ data: null, error: null });
    expect((await review({ status: "approved", expiresOn: "2099-01-01" })).status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });
  it("opens only the authorized application evidence file", async () => {
    const response = await GET(new Request(`http://admin.test/api/tenant-admin/drivers/evidence?tenantId=${tenantId}&evidenceId=${evidenceId}`, { headers: { Authorization: "Bearer fixture" } }));
    expect(response.status).toBe(200);
    expect(signed).toHaveBeenCalledWith("tenant/private-insurance.pdf", 600);
  });
});
