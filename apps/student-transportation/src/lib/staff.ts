import type { PlatformSupabaseClient, SupabaseAuthSession } from "@esh-platform/supabase";
import type { EnrollmentContext } from "./enrollment";

export type StaffSection = "requests" | "enrollment" | "administration";
export type StaffWorkspace = {
  client: PlatformSupabaseClient;
  session: SupabaseAuthSession;
  tenantId: string;
  section: StaffSection;
  onContext: (context: EnrollmentContext) => void;
  onError: (error: unknown) => void;
  onBusy: (busy: boolean) => void;
};

export function studentRequestError(operation: string, error: unknown, status?: number): Error {
  const value = error && typeof error === "object" ? error : {};
  const rawCode = "code" in value ? value.code : undefined;
  const code = typeof rawCode === "string" && /^[A-Z0-9_]{1,64}$/.test(rawCode) ? rawCode : "";
  const rawMessage = "message" in value && typeof value.message === "string" ? value.message : "";
  const authDetail =
    /invalid api key|unregistered api key|no api key|missing api key|api key.*revoked/i.test(
      rawMessage,
    )
      ? "Supabase rejected the API key."
      : /jwt.*expired|expired.*jwt/i.test(rawMessage)
        ? "The session token has expired."
        : /invalid jwt|jwt.*invalid|invalid.*signature|signature.*invalid/i.test(rawMessage)
          ? "Supabase rejected the session token."
          : "Authentication was rejected.";
  const detail =
    status === 401
      ? authDetail
      : status === 403
        ? "Access was denied."
        : status === 402
          ? "Supabase API access is restricted. Check organization usage and billing."
          : status === 0
            ? "Could not reach Supabase."
            : "The request failed.";
  const reference = [status !== undefined ? `HTTP ${status}` : "", code]
    .filter(Boolean)
    .join(" / ");
  return Error(`${operation}: ${detail}${reference ? ` (${reference})` : ""}`);
}
