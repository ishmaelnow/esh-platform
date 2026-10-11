import type { PlatformSupabaseClient } from "@esh-platform/supabase";
import type { AdminServerConfig } from "@/lib/config";
import { buildPrivacySafePush } from "./push";
import { configuredNativePlatforms, nativeProviderConfig, sendNativePush } from "./native-provider";
import type { NativeMessage, NativeProviderConfig, NativeResult } from "./native-provider";
import { supportTarget } from "./support-target";

export type NativeClaim = Omit<NativeMessage, "title" | "body"> & { claimId: string; notificationType: string };
export function readNativeClaims(value: unknown): NativeClaim[] {
  if (!Array.isArray(value)) throw new Error("Invalid native delivery claim.");
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid native delivery claim.");
    const row = entry as Record<string, unknown>;
    if (!["rider", "driver"].includes(String(row.product)) || !["android", "ios"].includes(String(row.platform))
      || ["attemptId", "claimId", "token", "tenantSlug", "notificationType", "expiresAt"].some((key) => typeof row[key] !== "string")
      || !Number.isFinite(Date.parse(String(row.expiresAt)))) throw new Error("Invalid native delivery claim.");
    if (row.notificationType === "rider_support_update" && (row.product !== "rider" || !supportTarget(row)))
      throw new Error("Invalid native delivery claim.");
    return row as NativeClaim;
  });
}
export async function deliverNativeNotifications(service: PlatformSupabaseClient, config: AdminServerConfig,
  scope: { tenantId?: string; notificationId?: string; limit?: number } = {},
  provider: NativeProviderConfig = nativeProviderConfig(),
  send: (message: NativeMessage, configuration: NativeProviderConfig) => Promise<NativeResult> = sendNativePush) {
  const platforms = configuredNativePlatforms(provider);
  if (!platforms.length) return { nativeAccepted: 0, nativeFailed: 0, nativeSkipped: true };
  const { data, error } = await service.rpc("claim_native_push_attempts", {
    tenant_value: scope.tenantId ?? null, notification_value: scope.notificationId ?? null,
    limit_value: Math.min(Math.max(scope.limit ?? 5, 1), 5), platforms_value: platforms });
  if (error) throw new Error("Native notification queue is unavailable.");
  let nativeAccepted = 0; let nativeFailed = 0;
  for (const claim of readNativeClaims(data)) {
    const safe = buildPrivacySafePush(claim.notificationType, { tenant_slug: claim.tenantSlug }, config);
    const result = await send({ ...claim, title: safe.title, body: safe.body }, provider)
      .catch(() => ({ accepted: false, expired: false, status: null, code: "provider_unavailable" }));
    const finished = await service.rpc("finish_native_push_attempt", { attempt_value: claim.attemptId,
      claim_value: claim.claimId, status_value: result.accepted ? "accepted" : result.expired || result.code === "expired" ? "expired" : "failed",
      response_value: result.status, failure_value: result.code, expire_registration: result.expired });
    if (finished.error) throw new Error("Native notification result could not be saved.");
    if (!finished.data) continue;
    if (result.accepted) nativeAccepted++; else nativeFailed++;
  }
  return { nativeAccepted, nativeFailed, nativeSkipped: false };
}
