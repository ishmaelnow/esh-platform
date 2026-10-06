import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { apnsHeaders, configuredNativePlatforms, fcmBody, nativePayload, readFirebaseAccount, sendNativePush, signedJwt } from "./native-provider";
import type { NativeMessage, NativeProviderConfig } from "./native-provider";

const message: NativeMessage = { attemptId: "11111111-1111-4111-8111-111111111111", product: "rider", platform: "android",
  token: "fixture-device-token", title: "ESH update", body: "A Driver accepted your trip.", tenantSlug: "fixture-provider",
  expiresAt: new Date(Date.now()+300000).toISOString() };
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const firebaseJson = JSON.stringify({ type: "service_account", project_id: "esh-platform-609d3",
  client_email: "fixture@esh-platform-609d3.iam.gserviceaccount.com", private_key: keys.privateKey.export({ type: "pkcs8", format: "pem" }) });
const config: NativeProviderConfig = { firebaseJson, apnsKey: "", apnsKeyId: "", apnsTeamId: "" };
describe("native provider privacy and signing", () => {
  it("uses only configured platform credentials", () => {
    expect(configuredNativePlatforms(config)).toEqual(["android"]);
    expect(configuredNativePlatforms({ ...config, firebaseJson: "" })).toEqual([]);
  });
  it("rejects client configuration and foreign projects without exposing credentials", () => {
    expect(() => readFirebaseAccount('{"project_info":{}}')).toThrow("configuration is invalid");
    expect(() => readFirebaseAccount(firebaseJson.replace("esh-platform-609d3", "foreign-project"))).toThrow("configuration is invalid");
  });
  it("restricts FCM to the intended Android package and bounded lifetime", () => {
    const body = fcmBody(message);
    expect(body.message.android.restricted_package_name).toBe("com.esh.rider");
    expect(body.message.android.ttl).toMatch(/^\d+s$/); expect(body.message.data).toEqual(nativePayload(message));
    expect(Object.keys(body.message.data)).toEqual(["product","tenantSlug"]);
  });
  it("signs Apple JWTs with the required raw ES256 signature and exact topic", () => {
    const apple = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const key = apple.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const token = signedJwt({ alg: "ES256", kid: "TESTKEY001" }, { iss: "TESTTEAM01", iat: 1 }, key);
    const parts = token.split("."); const signature = Buffer.from(parts[2]!, "base64url");
    expect(signature.length).toBe(64);
    expect(verify("sha256",Buffer.from(`${parts[0]}.${parts[1]}`),{ key: apple.publicKey, dsaEncoding:"ieee-p1363" },signature)).toBe(true);
    const headers = apnsHeaders({ ...message, product: "driver", platform: "ios" }, { ...config, apnsKey: key, apnsKeyId:"TESTKEY001",apnsTeamId:"TESTTEAM01" });
    expect(headers["apns-topic"]).toBe("com.esh.driver"); expect(headers["apns-push-type"]).toBe("alert");
  });
  it("does not send expired notifications", async () => {
    const request = vi.fn();
    expect(await sendNativePush({ ...message, expiresAt: new Date(0).toISOString() },config,request)).toMatchObject({ accepted:false,code:"expired" });
    expect(request).not.toHaveBeenCalled();
  });
  it("uses OAuth and FCM v1, and reports provider acceptance separately", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token:"fixture-oauth",expires_in:3600 }))
      .mockResolvedValueOnce(Response.json({ name:"fixture-accepted" }));
    expect(await sendNativePush(message,config,request)).toMatchObject({ accepted:true,status:200 });
    expect(request.mock.calls[0]?.[0]).toBe("https://oauth2.googleapis.com/token");
    expect(request.mock.calls[1]?.[0]).toBe("https://fcm.googleapis.com/v1/projects/esh-platform-609d3/messages:send");
  });
  it("expires unregistered tokens but sanitizes provider error details", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error:{ message:"private provider details",
      details:[{ errorCode:"UNREGISTERED" }] } }, { status:404 }));
    const result = await sendNativePush(message,config,request);
    expect(result).toEqual({ accepted:false,expired:true,status:404,code:"unregistered" });
    expect(JSON.stringify(result)).not.toContain("private provider");
  });
});
