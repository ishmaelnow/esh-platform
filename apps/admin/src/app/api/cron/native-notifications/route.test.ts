import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
const mocks = vi.hoisted(() => ({ native: vi.fn(), queued: vi.fn() }));
vi.mock("@esh-platform/supabase", () => ({ createServiceSupabaseClient: () => ({ fixture: true }) }));
vi.mock("@/lib/config", () => ({ getAdminServerConfig: () => ({ fixture: true }) }));
vi.mock("@/lib/notifications/native-push", () => ({ deliverNativeNotifications: mocks.native }));
vi.mock("@/lib/notifications/delivery", () => ({ deliverQueuedNotifications: mocks.queued }));
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("CRON_SECRET", "local-test-only");
  mocks.native.mockResolvedValue({ nativeAccepted: 1, nativeFailed: 0 });
  mocks.queued.mockResolvedValue({ sent: 1 });
});
afterEach(() => vi.unstubAllEnvs());
const request = () => new Request("https://admin.example.invalid/api/cron/native-notifications", { headers: { authorization: "Bearer local-test-only" } });
it("rejects unauthenticated cron requests without delivery", async () => {
  expect((await GET(new Request("https://admin.example.invalid/api/cron/native-notifications"))).status).toBe(401);
  expect(mocks.native).not.toHaveBeenCalled(); expect(mocks.queued).not.toHaveBeenCalled();
});
it("recovers only support email/web events while claiming native once", async () => {
  expect((await GET(request())).status).toBe(200);
  expect(mocks.native).toHaveBeenCalledOnce();
  expect(mocks.queued).toHaveBeenCalledWith(expect.anything(), expect.anything(), { notificationType: "rider_support_update", limit: 20, skipNative: true });
});
it("an email queue outage does not prevent native delivery", async () => {
  mocks.queued.mockRejectedValue(new Error("Fixture outage"));
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ nativeAccepted: 1, support: { unavailable: true } });
});
