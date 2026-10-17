import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
  resolve: vi.fn(),
  route: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
  cleanup: vi.fn(),
  service: vi.fn(),
  saved: vi.fn(),
}));
vi.mock("@esh-platform/supabase", () => ({
  createAuthenticatedSupabaseClient: () => ({
    rpc: mock.rpc,
    auth: { getUser: mock.getUser },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mock.saved }) }) }) }),
  }),
  createServiceSupabaseClient: (source: NodeJS.ProcessEnv) => {
    mock.service(source);
    return {
      from: () => ({ delete: () => ({ eq: () => ({ lt: mock.cleanup }) }), insert: mock.insert }),
    };
  },
}));
vi.mock("@esh-platform/maps", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveStudentStop: mock.resolve,
  studentRoadRoute: mock.route,
}));
import { POST } from "./route";
const tenant = "00000000-0000-0000-0000-000000000001",
  customer = "00000000-0000-0000-0000-000000000002",
  actor = "00000000-0000-0000-0000-000000000003";
const choice = {
  address: "TEST 123 Street, City, PA",
  latitude: 40,
  longitude: -75,
  loadingInstructions: "North gate",
};
const body = {
  action: "preview",
  tenantId: tenant,
  customerId: customer,
  scheduledAt: new Date(Date.now() + 3600000).toISOString(),
  destination: choice,
  students: [{ name: "TEST STUDENT", pickup: choice, accommodations: ["wheelchair_lift"] }],
  geography: { safetyStatus: "approved", stops: [] },
};
const request = (
  value: unknown = body,
  headers: Record<string, string> = { Authorization: "Bearer test" },
) =>
  new Request("https://school.eshapp.com/api/geography", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "test-public-token");
  vi.stubEnv("NEXT_STUDENT_SUPABASE_SECRET_KEY", "test-student-secret");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-other-product-secret");
  mock.getUser.mockResolvedValue({
    data: { user: { id: actor, email_confirmed_at: "2026-01-01" } },
    error: null,
  });
  mock.rpc.mockResolvedValue({ data: true, error: null });
  mock.cleanup.mockResolvedValue({ error: null });
  mock.resolve.mockResolvedValue({
    ...choice,
    address: "SERVER VERIFIED STREET",
    addressLatitude: 40,
    addressLongitude: -75,
    accuracy: "rooftop",
    pointSource: "routable",
    safetyStatus: "unreviewed",
  });
  mock.route.mockResolvedValue({
    geometry: {
      type: "LineString",
      coordinates: [
        [-75, 40],
        [-75.01, 40.01],
      ],
    },
    distanceMeters: 1000,
    durationSeconds: 100,
  });
  mock.single.mockResolvedValue({ data: { receipt_id: customer }, error: null });
  mock.insert.mockReturnValue({ select: () => ({ single: mock.single }) });
});
afterEach(() => vi.unstubAllEnvs());
describe("Student authoritative geography boundary", () => {
  it("requires the Student-specific secret even when a generic key exists", async () => {
    vi.stubEnv("NEXT_STUDENT_SUPABASE_SECRET_KEY", "");
    expect((await POST(request())).status).toBe(503);
    expect(mock.service).not.toHaveBeenCalled();
    expect(mock.resolve).not.toHaveBeenCalled();
  });
  it("fails closed when mapping configuration is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "");
    expect((await POST(request())).status).toBe(503);
    expect(mock.resolve).not.toHaveBeenCalled();
    expect(mock.service).not.toHaveBeenCalled();
  });
  it("creates actor-bound proof from provider results, ignoring browser approval claims", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mock.service).toHaveBeenCalledWith(expect.objectContaining({ SUPABASE_SERVICE_ROLE_KEY: "test-student-secret" }));
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: tenant,
        customer_id: customer,
        auth_user_id: actor,
      }),
    );
    const inserted = JSON.stringify(mock.insert.mock.calls);
    expect(inserted).toContain("SERVER VERIFIED STREET");
    expect(inserted).toContain('"safetyStatus":"unreviewed"');
    expect(inserted).not.toContain('"safetyStatus":"approved"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("denies missing/unverified auth and foreign origins before mapping", async () => {
    expect((await POST(request(body, {}))).status).toBe(401);
    expect(
      (await POST(request(body, { Authorization: "Bearer test", Origin: "https://evil.invalid" })))
        .status,
    ).toBe(403);
    mock.getUser.mockResolvedValue({ data: { user: { id: actor, email_confirmed_at: null } } });
    expect((await POST(request())).status).toBe(401);
    expect(mock.resolve).not.toHaveBeenCalled();
  });
  it("denies other customer/tenant access before privileged writes", async () => {
    mock.rpc.mockResolvedValue({ data: false, error: null });
    expect((await POST(request())).status).toBe(403);
    expect(mock.resolve).not.toHaveBeenCalled();
    expect(mock.service).not.toHaveBeenCalled();
  });
  it("does not create proof when any stop or route fails", async () => {
    mock.route.mockRejectedValue(Error("private provider secret"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mock.insert).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("secret");
  });
  it("respects disabled pilot and bounded input", async () => {
    vi.stubEnv("NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED", "false");
    expect((await POST(request())).status).toBe(503);
    vi.stubEnv("NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED", "true");
    expect((await POST(request({ ...body, extra: "x".repeat(41000) }))).status).toBe(400);
    expect(mock.resolve).not.toHaveBeenCalled();
  });
  it("uses caller RLS for existing previews and denies unverified history", async () => {
    mock.saved.mockResolvedValue({
      data: { geography_status: "unverified", geography: null },
      error: null,
    });
    expect(
      (await POST(request({ action: "saved", tenantId: tenant, requestId: customer }))).status,
    ).toBe(403);
    expect(mock.service).not.toHaveBeenCalled();
    expect(mock.route).not.toHaveBeenCalled();
  });
});
