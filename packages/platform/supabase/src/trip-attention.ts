import type { PlatformSupabaseClient } from "./index";

export type TripAttention = { kind: "messages" | "support"; bookingId: string; itemId: string; count: number };
export type TripAttentionState = { items: TripAttention[]; error: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readTripAttention(value: unknown): TripAttention[] {
  if (!Array.isArray(value) || value.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return true;
    const row = entry as Record<string, unknown>;
    return !["messages", "support"].includes(String(row.kind)) || typeof row.bookingId !== "string" || !uuid.test(row.bookingId)
      || typeof row.itemId !== "string" || !uuid.test(row.itemId) || !Number.isSafeInteger(row.count) || Number(row.count) < 1;
  })) throw new Error("Updates unavailable");
  return value as TripAttention[];
}

// No outbox reads, local storage, optimistic clearing or background sending.
export function createTripAttentionController(client: PlatformSupabaseClient, role: "rider" | "driver", tenantId: string | null,
  emit: (state: TripAttentionState) => void) {
  let stopped = false, generation = 0;
  let state: TripAttentionState = { items: [], error: "" };
  const update = (patch: Partial<TripAttentionState>) => { if (!stopped) { state = { ...state, ...patch }; emit(state); } };
  async function refresh() {
    if (stopped) return;
    const current = ++generation;
    try {
      const result = await client.rpc("my_trip_attention", { role_value: role, tenant_value: tenantId });
      if (stopped || current !== generation) return;
      if (result.error) throw result.error;
      update({ items: readTripAttention(result.data), error: "" });
    } catch {
      if (current === generation) update({ items: [], error: "Unread updates could not be checked. Open messages or reports to refresh." });
    }
  }
  async function mark(bookingId: string, target: { messages: string[] } | { caseId: string; version: number }) {
    if (stopped) return;
    try {
      const result = "messages" in target
        ? await client.rpc("mark_my_trip_messages_read", { booking_value: bookingId, role_value: role, message_values: target.messages })
        : await client.rpc("mark_my_trip_support_read", { booking_value: bookingId, role_value: role, case_value: target.caseId, version_value: target.version });
      if (stopped) return;
      if (result.error || result.data !== true) throw new Error("Read status unavailable");
      await refresh();
    } catch { update({ error: "Read status could not be saved. Reopen the conversation or report to try again." }); }
  }
  return { refresh, mark, stop() { stopped = true; generation++; } };
}
