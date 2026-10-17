import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  route: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
  cleanup: vi.fn(),
  service: vi.fn(),
}));
vi.mock("@esh-platform/supabase", () => ({
  createAuthenticatedSupabaseClient: () => ({ auth: { getUser: mock.getUser }, rpc: mock.rpc }),
  createServiceSupabaseClient: (source: NodeJS.ProcessEnv) => {
    mock.service(source);
    return {
      from: () => ({ delete: () => ({ eq: () => ({ lt: mock.cleanup }) }), insert: mock.insert }),
    };
  },
}));
vi.mock("@esh-platform/maps", async (load) => ({
  ...(await load<object>()),
  studentRoadRoute: mock.route,
}));
import { POST } from "./route";
const tenant = "00000000-0000-0000-0000-000000000001",
  customer = "00000000-0000-0000-0000-000000000002",
  id = "00000000-0000-0000-0000-000000000003";
const point = {
  data: {
    address: "TEST APPROVED ADDRESS",
    latitude: 40,
    longitude: -75,
    instructions: "TEST REVIEWED GATE",
  },
};
const body = {
  tenantId: tenant,
  planId: id,
  revision: 1,
  stops: [{ address: "FORGED", latitude: 0, longitude: 0 }],
};
const request = (
  value: unknown = body,
  headers: Record<string, string> = { Authorization: "Bearer TEST" },
) =>
  new Request("https://school.eshapp.com/api/planning/preview", {
    method: "POST",
    headers,
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "pk.test");
  vi.stubEnv("NEXT_STUDENT_SUPABASE_SECRET_KEY", "TEST STUDENT SECRET");
  mock.getUser.mockResolvedValue({
    data: { user: { id, email_confirmed_at: "2026-10-17" } },
    error: null,
  });
  mock.rpc.mockResolvedValue({
    data: { customerId: customer, planHash: "TEST HASH", snapshot: { points: [point, point] } },
    error: null,
  });
  mock.route.mockResolvedValue({
    distanceMeters: 1000,
    durationSeconds: 600,
    geometry: {
      type: "LineString",
      coordinates: [
        [-75, 40],
        [-75.01, 40.01],
      ],
    },
  });
  mock.cleanup.mockResolvedValue({ error: null });
  mock.single.mockResolvedValue({ data: { receipt_id: id }, error: null });
  mock.insert.mockReturnValue({ select: () => ({ single: mock.single }) });
});
afterEach(() => vi.unstubAllEnvs());
describe("Student reviewed-plan road proof", () => {
  it("uses only authorized server-projected loading points and actor-bound proof", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mock.rpc).toHaveBeenCalledWith("student_route_plan_preview", {
      t: tenant,
      id,
      revision_value: 1,
    });
    const serialized = JSON.stringify(mock.route.mock.calls);
    expect(serialized).toContain("TEST APPROVED ADDRESS");
    expect(serialized).not.toContain("FORGED");
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ auth_user_id: id, tenant_id: tenant, customer_id: customer }),
    );
    expect(JSON.stringify(mock.insert.mock.calls)).toContain('"kind":"planning"');
    expect(mock.service).toHaveBeenCalledWith(
      expect.objectContaining({ SUPABASE_SERVICE_ROLE_KEY: "TEST STUDENT SECRET" }),
    );
  });
  it("denies missing identity, unverified email and foreign origins", async () => {
    expect((await POST(request(body, {}))).status).toBe(401);
    expect(
      (await POST(request(body, { Authorization: "Bearer TEST", Origin: "https://evil.invalid" })))
        .status,
    ).toBe(403);
    mock.getUser.mockResolvedValue({ data: { user: { email_confirmed_at: null } }, error: null });
    expect((await POST(request())).status).toBe(401);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("does not call mapping or privileged storage when review access/revision is denied", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE DETAIL" } });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("PRIVATE DETAIL");
    expect(mock.route).not.toHaveBeenCalled();
    expect(mock.service).not.toHaveBeenCalled();
  });
  it("fails closed for missing dedicated configuration", async () => {
    vi.stubEnv("NEXT_STUDENT_SUPABASE_SECRET_KEY", "");
    expect((await POST(request())).status).toBe(503);
    expect(mock.insert).not.toHaveBeenCalled();
  });
  it("never mints approval proof after road-provider failure", async () => {
    mock.route.mockRejectedValue(Error("PRIVATE PROVIDER DETAIL"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mock.insert).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("PRIVATE PROVIDER");
  });
  it("bounds input, validates identifiers and respects the existing pilot gate", async () => {
    expect((await POST(request({ ...body, extra: "x".repeat(3000) }))).status).toBe(400);
    expect((await POST(request({ ...body, revision: 0 }))).status).toBe(400);
    vi.stubEnv("NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED", "false");
    expect((await POST(request())).status).toBe(503);
    expect(mock.route).not.toHaveBeenCalled();
  });
});
