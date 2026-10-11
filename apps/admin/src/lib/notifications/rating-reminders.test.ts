import { expect, it } from "vitest";
import type { AdminServerConfig } from "@/lib/config";
import { buildPrivacySafePush } from "./push";
import { buildDriverNotificationContent, buildRiderNotificationContent } from "./email";
import { nativePayload, type NativeMessage } from "./native-provider";
import { readNativeClaims } from "./native-push";
import { buildPrivacySafeSms } from "./sms";
const config = { redirects: { riderAppUrl: "https://rider.eshapp.com", driverAppUrl: "https://driver.eshapp.com" } } as AdminServerConfig;
const bookingId = "90000000-0000-4000-8000-000000000001";
it("keeps both participant reminders generic and points each channel to the correct rating", () => {
  for (const product of ["rider", "driver"] as const) {
    const notificationType = `${product}_rating_reminder`;
    const payload = { tenant_slug: "test-company", booking_id: bookingId, comment: "PRIVATE COMMENT", overall: "PRIVATE SCORE", url: "https://evil.invalid" };
    const alert = buildPrivacySafePush(notificationType, payload, config);
    const email = product === "rider" ? buildRiderNotificationContent(notificationType, payload, config.redirects.riderAppUrl)
      : buildDriverNotificationContent(notificationType, payload, config.redirects.driverAppUrl);
    expect(alert.title).toBe("ESH update");
    expect(alert.url).toContain(`${product}.eshapp.com/?view=ratings`);
    expect(email.text).toContain(alert.url);
    expect(JSON.stringify({ alert, email })).not.toMatch(/PRIVATE|evil.invalid/);
    const message: NativeMessage = { attemptId: "fixture", product, platform: "android", token: "fixture-token", title: alert.title, body: alert.body,
      tenantSlug: "test-company", expiresAt: new Date(Date.now() + 60000).toISOString(), notificationType, bookingId };
    expect(nativePayload(message)).toEqual({ product, tenantSlug: "test-company", notificationType, bookingId });
    expect(readNativeClaims([{ ...message, claimId: "claim" }])).toHaveLength(1);
    expect(() => readNativeClaims([{ ...message, claimId: "claim", bookingId: "bad" }])).toThrow("Invalid native delivery claim.");
    expect(buildPrivacySafeSms(notificationType)).toBeNull();
  }
});
