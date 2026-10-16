import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), send: vi.fn() }));
vi.mock("@esh-platform/supabase", () => ({
  createAuthenticatedSupabaseClient: () => ({ rpc: mock.rpc, auth: { getUser: mock.getUser } }),
  createAnonymousSupabaseClient: () => ({ auth: { signInWithOtp: mock.send } }),
}));
import { POST } from "./route";
const tenant = "00000000-0000-0000-0000-000000000001";
const customer = "00000000-0000-0000-0000-000000000050";
const body = {
  target_tenant_id: tenant,
  request_id_value: customer,
  name_value: "TEST FIRST SCHOOL",
  kind_value: "school",
  email_value: "brand-new@example.invalid",
};
const request = (
  value: unknown = body,
  headers: Record<string, string> = { Authorization: "Bearer test-token" },
) =>
  new Request("https://school.eshapp.com/api/customers/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED", "true");
  mock.rpc.mockReset();
  mock.getUser.mockReset();
  mock.send.mockReset();
  mock.getUser.mockResolvedValue({
    data: { user: { email_confirmed_at: "2026-01-01" } },
    error: null,
  });
  mock.rpc.mockResolvedValue({
    data: { customerId: customer, email: body.email_value, sendAllowed: true },
    error: null,
  });
  mock.send.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("customer invitation email boundary", () => {
  it("admits a brand-new email through pending invitation and sends a verification link", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("prepare_student_customer_invitation", body);
    expect(mock.send).toHaveBeenCalledWith({
      email: body.email_value,
      options: { shouldCreateUser: true, emailRedirectTo: "https://school.eshapp.com/school" },
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("does not send for unauthorized management requests", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "private SQL detail" } });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mock.send).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("private SQL");
  });
  it("requires a verified signed-in actor", async () => {
    expect((await POST(request(body, {}))).status).toBe(401);
    mock.getUser.mockResolvedValue({ data: { user: { email_confirmed_at: null } }, error: null });
    expect((await POST(request())).status).toBe(401);
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("respects the program feature flag", async () => {
    vi.stubEnv("NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED", "false");
    expect((await POST(request())).status).toBe(503);
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("blocks foreign browser origins", async () => {
    expect(
      (
        await POST(
          request(body, { Authorization: "Bearer test-token", Origin: "https://example.invalid" }),
        )
      ).status,
    ).toBe(403);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("retains saved account on email failure without claiming delivery", async () => {
    mock.send.mockResolvedValue({ error: { message: "secret provider failure" } });
    const response = await POST(request());
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).toContain("account is saved");
    expect(text).not.toContain("secret provider");
  });
  it("honors database resend throttling", async () => {
    mock.rpc.mockResolvedValue({
      data: { email: body.email_value, sendAllowed: false },
      error: null,
    });
    expect((await POST(request())).status).toBe(429);
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("resends only to the stored authorized invitation address", async () => {
    expect(
      (
        await POST(
          request({
            target_tenant_id: tenant,
            target_customer_id: customer,
            email_value: "attacker@example.invalid",
            redirectTo: "https://evil.invalid",
          }),
        )
      ).status,
    ).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("prepare_student_customer_resend", {
      target_tenant_id: tenant,
      target_customer_id: customer,
    });
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ email: body.email_value }));
  });
  it("rejects invalid IDs and oversized requests before provider calls", async () => {
    expect((await POST(request({ ...body, target_tenant_id: "bad" }))).status).toBe(400);
    expect((await POST(request({ ...body, name_value: "x".repeat(5000) }))).status).toBe(400);
    expect(mock.send).not.toHaveBeenCalled();
  });
});
