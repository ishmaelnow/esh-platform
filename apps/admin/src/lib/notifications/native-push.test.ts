import { describe, expect, it, vi } from "vitest";
import type { PlatformSupabaseClient } from "@esh-platform/supabase";
import type { AdminServerConfig } from "@/lib/config";
import { deliverNativeNotifications, readNativeClaims } from "./native-push";
import type { NativeClaim } from "./native-push";
import type { NativeProviderConfig } from "./native-provider";

const config = { redirects:{ riderAppUrl:"https://rider.eshapp.com",driverAppUrl:"https://driver.eshapp.com" } } as AdminServerConfig;
const provider: NativeProviderConfig = { firebaseJson:"configured-fixture",apnsKey:"",apnsKeyId:"",apnsTeamId:"" };
const claim: NativeClaim = { attemptId:"fixture-attempt",claimId:"fixture-claim",product:"rider",platform:"android",
  token:"fixture-token",tenantSlug:"fixture-provider",notificationType:"rider_driver_arrived",expiresAt:new Date(Date.now()+60000).toISOString() };
describe("independent native delivery", () => {
  it("skips cleanly when credentials are not configured",async () => {
    const rpc = vi.fn();
    expect(await deliverNativeNotifications({ rpc } as unknown as PlatformSupabaseClient,config,{},
      { ...provider,firebaseJson:"" })).toMatchObject({ nativeSkipped:true }); expect(rpc).not.toHaveBeenCalled();
  });
  it("claims independently of email state and persists acceptance with a claim ID",async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data:[claim],error:null }).mockResolvedValueOnce({ data:true,error:null });
    const send = vi.fn().mockResolvedValue({ accepted:true,expired:false,status:200,code:null });
    expect(await deliverNativeNotifications({ rpc } as unknown as PlatformSupabaseClient,config,{ tenantId:"fixture-tenant" },provider,send))
      .toMatchObject({ nativeAccepted:1,nativeFailed:0 });
    expect(rpc).toHaveBeenNthCalledWith(1,"claim_native_push_attempts",expect.objectContaining({ tenant_value:"fixture-tenant",platforms_value:["android"],limit_value:5 }));
    expect(rpc).toHaveBeenNthCalledWith(2,"finish_native_push_attempt",expect.objectContaining({ claim_value:"fixture-claim",status_value:"accepted" }));
    expect(send.mock.calls[0]?.[0]).toMatchObject({ body:"Your Driver has arrived." });
  });
  it("keeps provider failure retryable and expires only invalid devices",async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data:[claim],error:null }).mockResolvedValueOnce({ data:true,error:null });
    const send = vi.fn().mockResolvedValue({ accepted:false,expired:false,status:503,code:"fcm_rejected" });
    await deliverNativeNotifications({ rpc } as unknown as PlatformSupabaseClient,config,{},provider,send);
    expect(rpc).toHaveBeenLastCalledWith("finish_native_push_attempt",expect.objectContaining({ status_value:"failed",expire_registration:false }));
  });
  it("rejects malformed claims without printing tokens",() => {
    expect(() => readNativeClaims([{ token:"private-device-token",platform:"foreign" }])).toThrow("Invalid native delivery claim.");
  });
});
