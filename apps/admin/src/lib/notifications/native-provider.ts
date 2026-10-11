import { createPrivateKey, sign } from "node:crypto";
import { connect } from "node:http2";
import { supportTarget } from "./support-target";

export type NativeMessage = { attemptId: string; product: "rider" | "driver"; platform: "ios" | "android";
  token: string; title: string; body: string; tenantSlug: string; expiresAt: string;
  notificationType?: string; bookingId?: string; caseId?: string };
export type NativeResult = { accepted: boolean; expired: boolean; status: number | null; code: string | null };
export type NativeProviderConfig = { firebaseJson: string; apnsKey: string; apnsKeyId: string; apnsTeamId: string };

export function nativeProviderConfig(source: NodeJS.ProcessEnv = process.env): NativeProviderConfig {
  return { firebaseJson: source.FIREBASE_SERVICE_ACCOUNT_JSON ?? "", apnsKey: source.APNS_PRIVATE_KEY ?? "",
    apnsKeyId: source.APNS_KEY_ID ?? "", apnsTeamId: source.APNS_TEAM_ID ?? "" };
}
export function configuredNativePlatforms(config: NativeProviderConfig) {
  return [...(config.firebaseJson ? ["android"] : []),
    ...(config.apnsKey && config.apnsKeyId && config.apnsTeamId ? ["ios"] : [])];
}
const base64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
export function signedJwt(header: Record<string, string>, claims: Record<string, unknown>, key: string) {
  const input = `${base64(header)}.${base64(claims)}`;
  const signature = sign("sha256", Buffer.from(input), { key: createPrivateKey(key.replace(/\\n/g, "\n")),
    ...(header.alg === "ES256" ? { dsaEncoding: "ieee-p1363" as const } : {}) });
  return `${input}.${signature.toString("base64url")}`;
}
type FirebaseAccount = { project_id: string; client_email: string; private_key: string };
export function readFirebaseAccount(value: string): FirebaseAccount {
  let parsed: unknown;
  try { parsed = JSON.parse(value) as unknown; } catch { throw new Error("Firebase server configuration is invalid."); }
  if (!parsed || typeof parsed !== "object") throw new Error("Firebase server configuration is invalid.");
  const account = parsed as Record<string, unknown>;
  if (account.type !== "service_account" || account.project_id !== "esh-platform-609d3"
    || typeof account.client_email !== "string" || !account.client_email.endsWith("@esh-platform-609d3.iam.gserviceaccount.com")
    || typeof account.private_key !== "string") throw new Error("Firebase server configuration is invalid.");
  return { project_id: account.project_id, client_email: account.client_email, private_key: account.private_key };
}
let oauthCache: { source: string; token: string; expires: number } | null = null;
async function firebaseAccess(config: NativeProviderConfig, request: typeof fetch) {
  if (oauthCache?.source === config.firebaseJson && oauthCache.expires > Date.now() + 60000) return oauthCache.token;
  const account = readFirebaseAccount(config.firebaseJson);
  const now = Math.floor(Date.now() / 1000);
  const assertion = signedJwt({ alg: "RS256", typ: "JWT" }, { iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600 }, account.private_key);
  const response = await request("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const value = await response.json() as { access_token?: string; expires_in?: number };
  if (!response.ok || !value.access_token) throw new Error("Firebase server authentication failed.");
  oauthCache = { source: config.firebaseJson, token: value.access_token,
    expires: Date.now() + Math.min(value.expires_in ?? 3600, 3600) * 1000 };
  return value.access_token;
}

export function nativePayload(message: NativeMessage) {
  const target = supportTarget({ bookingId: message.bookingId, caseId: message.caseId });
  return { product: message.product, tenantSlug: message.tenantSlug,
    ...(message.product === "rider" && message.notificationType === "rider_support_update" && target
      ? { notificationType: "rider_support_update", ...target } : {}) };
}
export function fcmBody(message: NativeMessage) {
  const ttl = Math.max(0, Math.min(900, Math.floor((Date.parse(message.expiresAt) - Date.now()) / 1000)));
  return { message: { token: message.token, notification: { title: message.title, body: message.body },
    data: nativePayload(message), android: { restricted_package_name: `com.esh.${message.product}`,
      priority: "high", ttl: `${ttl}s`, notification: { channel_id: "esh_updates", tag: message.attemptId,
        icon: "ic_push_notification", color: "#153258" } } } };
}
async function sendFcm(message: NativeMessage, config: NativeProviderConfig, request: typeof fetch): Promise<NativeResult> {
  const token = await firebaseAccess(config, request);
  const response = await request("https://fcm.googleapis.com/v1/projects/esh-platform-609d3/messages:send", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000), body: JSON.stringify(fcmBody(message)) });
  if (response.ok) return { accepted: true, expired: false, status: response.status, code: null };
  const value = await response.json().catch(() => ({})) as { error?: { details?: Array<{ errorCode?: string }> } };
  const unregistered = value.error?.details?.some((entry) => entry.errorCode === "UNREGISTERED") ?? false;
  if (response.status === 401) oauthCache = null;
  return { accepted: false, expired: unregistered, status: response.status,
    code: unregistered ? "unregistered" : "fcm_rejected" };
}
export function apnsHeaders(message: NativeMessage, config: NativeProviderConfig) {
  if (!/^[A-Z0-9]{10}$/.test(config.apnsKeyId) || !/^[A-Z0-9]{10}$/.test(config.apnsTeamId))
    throw new Error("Apple server configuration is invalid.");
  const authorization = signedJwt({ alg: "ES256", kid: config.apnsKeyId }, {
    iss: config.apnsTeamId, iat: Math.floor(Date.now() / 1000) }, config.apnsKey);
  return { ":method": "POST", ":path": `/3/device/${message.token}`, authorization: `bearer ${authorization}`,
    "apns-topic": `com.esh.${message.product}`, "apns-push-type": "alert", "apns-priority": "10",
    "apns-id": message.attemptId, "apns-expiration": String(Math.floor(Date.parse(message.expiresAt) / 1000)) };
}
async function sendApns(message: NativeMessage, config: NativeProviderConfig): Promise<NativeResult> {
  const headers = apnsHeaders(message, config);
  return new Promise((resolve) => {
    const session = connect("https://api.push.apple.com"); // Production key / TestFlight only.
    let settled = false;
    const complete = (result: NativeResult) => {
      if (settled) return;
      settled = true; clearTimeout(timeout); session.destroy(); resolve(result);
    };
    const timeout = setTimeout(() => complete({ accepted: false, expired: false, status: null, code: "apns_timeout" }), 10000);
    session.on("error", () => complete({ accepted: false, expired: false, status: null, code: "apns_connection" }));
    const stream = session.request(headers);
    let status = 0; let response = "";
    stream.on("response", (value) => { status = Number(value[":status"]); });
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => { if (response.length < 1000) response += chunk; });
    stream.on("error", () => complete({ accepted: false, expired: false, status: null, code: "apns_connection" }));
    stream.on("end", () => {
      let reason: unknown;
      try { reason = (JSON.parse(response || "{}") as { reason?: unknown }).reason; } catch { reason = null; }
      const expired = status === 410 || reason === "Unregistered" || reason === "BadDeviceToken";
      complete({ accepted: status === 200, expired, status,
        code: status === 200 ? null : expired ? "unregistered" : "apns_rejected" });
    });
    stream.end(JSON.stringify({ aps: { alert: { title: message.title, body: message.body }, sound: "default" },
      ...nativePayload(message) }));
  });
}
export async function sendNativePush(message: NativeMessage, config: NativeProviderConfig,
  request: typeof fetch = fetch): Promise<NativeResult> {
  if (Date.parse(message.expiresAt) <= Date.now()) return { accepted: false, expired: false, status: null, code: "expired" };
  try { return message.platform === "android" ? await sendFcm(message, config, request) : await sendApns(message, config); }
  catch { return { accepted: false, expired: false, status: null, code: "provider_unavailable" }; }
}
