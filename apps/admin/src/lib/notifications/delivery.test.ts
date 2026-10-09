import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformSupabaseClient } from "@esh-platform/supabase";
import type { AdminServerConfig } from "@/lib/config";
import { deliverQueuedNotifications } from "./delivery";

const mocks = vi.hoisted(() => ({ email: vi.fn(), push: vi.fn(), sms: vi.fn(), native: vi.fn() }));
vi.mock("./email", () => ({ sendNotificationEmail: mocks.email }));
vi.mock("./push", () => ({ deliverNotificationPush: mocks.push }));
vi.mock("./sms", () => ({ deliverNotificationSms: mocks.sms }));
vi.mock("./native-push", () => ({ deliverNativeNotifications: mocks.native }));

function serviceFor(emailEnabled: boolean) {
  const updates: Record<string, unknown>[] = [];
  let index = 0;
  const results = [
    { error: null },
    { data: [{ notification_id: "event", attempt_count: 0, email_delivery_enabled: true,
      notification_type: "rider_driver_arrived", recipient_email: "test@example.invalid", payload: {} }], error: null },
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
  return { service: { from } as unknown as PlatformSupabaseClient, updates };
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
});
