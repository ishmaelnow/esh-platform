import type { PlatformSupabaseClient } from "./index";

export type SupportCategory = "trip_issue" | "lost_item";
export type SupportStatus = "open" | "in_review" | "resolved";
export type SupportCase = {
  caseId: string; bookingId: string; category: SupportCategory; description: string;
  status: SupportStatus; response: string; version: number; createdAt: string; updatedAt: string;
  updates: { status: SupportStatus; response: string; createdAt: string }[];
  riderName?: string; driverName?: string; pickupAddress?: string; destinationAddress?: string;
};
export const supportCategoryLabel = (value: SupportCategory) => value === "lost_item" ? "Lost item" : "Trip issue";
export const supportStatusLabel = (value: SupportStatus) => ({ open: "Received", in_review: "Under review", resolved: "Resolved" })[value];
const isStatus = (value: unknown): value is SupportStatus => ["open", "in_review", "resolved"].includes(String(value));
export function readSupportCases(value: unknown): SupportCase[] {
  if (!Array.isArray(value)) throw new Error("Support reports unavailable");
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("Support reports unavailable");
    const row = entry as Record<string, unknown>;
    if (!["caseId", "bookingId", "description", "response", "createdAt", "updatedAt"].every((key) => typeof row[key] === "string")
      || !["trip_issue", "lost_item"].includes(String(row.category)) || !isStatus(row.status)
      || !Number.isInteger(row.version) || Number(row.version) < 1 || !Array.isArray(row.updates)
      || row.updates.some((update: unknown) => !update || typeof update !== "object"
        || !isStatus((update as Record<string, unknown>).status)
        || typeof (update as Record<string, unknown>).response !== "string"
        || typeof (update as Record<string, unknown>).createdAt !== "string")) throw new Error("Support reports unavailable");
    return row as SupportCase;
  });
}

export type SupportState = { cases: SupportCase[]; loading: boolean; sending: boolean; ready: boolean; error: string; message: string };
// Memory-only retry ID: a response lost after commit can be retried without a second report.
export function createRiderSupportController(client: PlatformSupabaseClient, bookingId: string, emit: (state: SupportState) => void) {
  return createSupportController(client, bookingId, emit, "rider");
}
export function createDriverSupportController(client: PlatformSupabaseClient, bookingId: string, emit: (state: SupportState) => void) {
  return createSupportController(client, bookingId, emit, "driver");
}
function createSupportController(client: PlatformSupabaseClient, bookingId: string, emit: (state: SupportState) => void, role: "rider" | "driver") {
  let stopped = false, generation = 0;
  let retry: { category: SupportCategory; description: string; id: string } | null = null;
  let state: SupportState = { cases: [], loading: true, sending: false, ready: false, error: "", message: "" };
  const update = (patch: Partial<SupportState>) => { if (!stopped) { state = { ...state, ...patch }; emit(state); } };
  async function refresh() {
    if (stopped) return;
    const current = ++generation;
    update({ loading: true, error: "" });
    try {
      const result = await client.rpc(role === "driver" ? "my_driver_trip_support" : "my_trip_support", { booking_value: bookingId });
      if (stopped || current !== generation) return;
      if (result.error) throw result.error;
      update({ cases: readSupportCases(result.data), ready: true });
    } catch {
      if (current === generation) update({ cases: [], ready: false, error: "Your reports could not be refreshed. Check your connection and refresh to try again." });
    } finally { if (current === generation) update({ loading: false }); }
  }
  async function send(category: SupportCategory, description: string) {
    description = description.trim();
    if (stopped || state.sending || state.loading || !state.ready) return false;
    if (description.length < 10 || description.length > 2000) { update({ error: "Please describe the issue in 10 to 2000 characters." }); return false; }
    if (!retry || retry.category !== category || retry.description !== description) retry = { category, description, id: crypto.randomUUID() };
    update({ sending: true, error: "", message: "" });
    try {
      const result = await client.rpc(role === "driver" ? "create_my_driver_trip_support" : "create_my_trip_support", {
        booking_value: bookingId, category_value: category, description_value: description, request_value: retry.id,
      });
      if (stopped) return false;
      if (result.error || typeof result.data !== "string") throw result.error;
      retry = null;
      update({ message: "Report received. Reopen Get help or refresh here to check for a response." });
      await refresh();
      return true;
    } catch {
      update({ error: "We couldn’t confirm your report. Refresh to check whether it was received, or retry the same report." });
      return false;
    } finally { update({ sending: false }); }
  }
  return { refresh, send, stop: () => { stopped = true; generation++; } };
}
