import { expect, it } from "vitest";
import type { AdminServerConfig } from "@/lib/config";
import { buildPrivacySafePush } from "./push";
import { buildRiderNotificationContent } from "./email";
import { nativePayload, type NativeMessage } from "./native-provider";
import { readNativeClaims } from "./native-push";
const config = { redirects: { riderAppUrl: "https://rider.eshapp.com", driverAppUrl: "https://driver.eshapp.com" } } as AdminServerConfig;
const bookingId = "90000000-0000-4000-8000-000000000001", caseId = "a0000000-0000-4000-8000-000000000001";
const payload = { tenant_slug: "test-company", booking_id: bookingId, case_id: caseId,
  response: "PRIVATE RESPONSE", description: "PRIVATE REPORT", rider_name: "PRIVATE NAME", pickup_address: "PRIVATE ADDRESS", url: "https://evil.invalid" };
const message: NativeMessage = { attemptId: "fixture", product: "rider", platform: "ios", token: "fixture-token", title: "ESH update",
  body: "Generic update", tenantSlug: "test-company", expiresAt: new Date(Date.now() + 60000).toISOString(), notificationType: "rider_support_update", bookingId, caseId };
it("keeps email and web previews generic and routes only to the known report", () => {
  const push = buildPrivacySafePush("rider_support_update", payload, config);
  const email = buildRiderNotificationContent("rider_support_update", payload, config.redirects.riderAppUrl);
  for (const content of [push, email]) { expect(JSON.stringify(content)).not.toMatch(/PRIVATE|evil.invalid/); }
  expect(new URL(push.url).searchParams.get("support")).toBe(caseId);
  expect(email.text).toContain(push.url);
  expect(buildPrivacySafePush("rider_support_update", { ...payload, case_id: "../invalid" }, config).url).not.toContain("support=");
});
it("native payloads whitelist product, tenant and valid support routing without report text", () => {
  expect(nativePayload(message)).toEqual({ product: "rider", tenantSlug: "test-company", notificationType: "rider_support_update", bookingId, caseId });
  expect(nativePayload({ ...message, caseId: "bad" })).toEqual({ product: "rider", tenantSlug: "test-company" });
  expect(nativePayload({ ...message, product: "driver" })).toEqual({ product: "driver", tenantSlug: "test-company" });
  expect(readNativeClaims([{ ...message, claimId: "claim" }])).toHaveLength(1);
  expect(() => readNativeClaims([{ ...message, claimId: "claim", bookingId: null }])).toThrow("Invalid native delivery claim.");
});
