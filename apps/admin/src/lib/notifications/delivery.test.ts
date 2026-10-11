import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformSupabaseClient } from "@esh-platform/supabase";
import type { AdminServerConfig } from "@/lib/config";
import { deliverQueuedNotifications } from "./delivery";

const mocks = vi.hoisted(() => ({ email: vi.fn(), push: vi.fn(), sms: vi.fn(), native: vi.fn() }));
vi.mock("./email", () => ({ sendNotificationEmail: mocks.email }));
vi.mock("./push", () => ({ deliverNotificationPush: mocks.push }));
vi.mock("./sms", () => ({ deliverNotificationSms: mocks.sms }));
vi.mock("./native-push", () => ({ deliverNativeNotifications: mocks.native }));

function serviceFor(emailEnabled: boolean, notificationType = "rider_driver_arrived", alertCurrent = true) {
  const updates: Record<string, unknown>[] = [];
  let index = 0;
  const results = [
    { error: null },
    { data: [{ notification_id: "event", attempt_count: 0, email_delivery_enabled: true,
      notification_type: notificationType, recipient_email: "test@example.invalid", payload: {} }], error: null },
    { data: { notification_id: "event", email_delivery_enabled: emailEnabled }, error: null },
    { error: null },
  ];
  const from = vi.fn(() => {
    const result = results[index++];
    const builder = {
      update(value: Record<string, unknown>) { updates.push(value); return builder; },
      select() { return builder; }, eq() { return builder; }, in() { return builder; },
      lt() { return builder; }, lte() { return builder; }, order() { return builder; }, limit() { return builder; },
      maybeSingle() { return Promise.resolve(result); },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(result).then(resolve); },
    };
    return builder;
  });
  const rpc = vi.fn().mockResolvedValue({ data: alertCurrent, error: null });
  return { service: { from, rpc } as unknown as PlatformSupabaseClient, updates, rpc };
}

describe("channel-aware notification delivery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.email.mockResolvedValue({ id: "provider-receipt" });
    mocks.push.mockResolvedValue({ delivered: 1, failed: 0 });
    mocks.sms.mockResolvedValue({ accepted: 0, failed: 0 });
    mocks.native.mockResolvedValue({ nativeAccepted: 1, nativeFailed: 0 });
  });
  it("honors the claim-time email opt-out while continuing device delivery", async () => {
    const { service, updates } = serviceFor(false);
    const result = await deliverQueuedNotifications(service, {} as AdminServerConfig);
    expect(mocks.email).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledOnce();
    expect(mocks.native).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ sent: 0, emailSkipped: 1, nativeAccepted: 1 });
    expect(updates.at(-1)).toMatchObject({ delivery_status: "email_disabled" });
  });
  it("preserves enabled email delivery alongside device alerts", async () => {
    const { service, updates } = serviceFor(true);
    expect(await deliverQueuedNotifications(service, {} as AdminServerConfig))
      .toMatchObject({ sent: 1, emailSkipped: 0, nativeAccepted: 1 });
    expect(mocks.email).toHaveBeenCalledOnce();
    expect(updates.at(-1)).toMatchObject({ delivery_status: "sent", provider_message_id: "provider-receipt" });
  });
  it("suppresses a stale preorder before any email, Web Push or SMS send", async () => {
    const { service, updates, rpc } = serviceFor(true, "driver_preorder_available", false);
    await deliverQueuedNotifications(service, {} as AdminServerConfig);
    expect(rpc).toHaveBeenCalledWith("preorder_alert_current", { notification_value: "event" });
    expect(mocks.email).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.sms).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({ delivery_status: "canceled" });
  });
  it("suppresses support alerts when recipient ownership or access is no longer valid", async () => {
    const { service, updates, rpc } = serviceFor(true, "rider_support_update", false);
    await deliverQueuedNotifications(service, {} as AdminServerConfig, { notificationType: "rider_support_update", skipNative: true });
    expect(rpc).toHaveBeenCalledWith("support_alert_current", { notification_value: "event" });
    expect(mocks.email).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.native).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({ delivery_status: "canceled" });
  });
});
