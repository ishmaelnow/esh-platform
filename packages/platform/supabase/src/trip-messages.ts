import type { PlatformSupabaseClient } from "./index";

export type TripMessage = { messageId: string; senderRole: "rider" | "driver"; body: string; sentAt: string };
export type TripMessageState = { messages: TripMessage[]; loading: boolean; sending: boolean; error: string | null; draft: string };
export function readTripMessages(value: unknown): TripMessage[] {
  if (!Array.isArray(value) || value.some((item: unknown) => {
    if (!item || typeof item !== "object") return true;
    const row = item as Record<string, unknown>;
    return typeof row.messageId !== "string" || !["rider", "driver"].includes(String(row.senderRole))
      || typeof row.body !== "string" || Array.from(row.body).length > 1000 || typeof row.sentAt !== "string" || !Number.isFinite(Date.parse(row.sentAt));
  })) throw new Error("Messages unavailable.");
  return value as TripMessage[];
}

// Shared transport/state; each product owns its presentation. No persistent message cache.
export function createTripMessageController(client: PlatformSupabaseClient, bookingId: string,
  role: "rider" | "driver", onState: (state: TripMessageState) => void) {
  let state: TripMessageState = { messages: [], loading: true, sending: false, error: null, draft: "" };
  let stopped = false; let request = 0; let retryId: string | null = null;
  const emit = (patch: Partial<TripMessageState>) => { if (!stopped) { state = { ...state, ...patch }; onState(state); } };
  const refresh = async () => {
    const current = ++request;
    try {
      const result = await client.rpc("my_trip_messages", { booking_value: bookingId, role_value: role });
      if (stopped || current !== request) return;
      if (result.error) throw result.error;
      emit({ messages: readTripMessages(result.data), loading: false, error: null });
    } catch {
      if (!stopped && current === request) emit({ messages: [], loading: false, error: "Messages unavailable. The trip may have ended or your connection changed. Refresh to retry." });
    }
  };
  return {
    refresh,
    draft(value: string) { if (state.sending || stopped) return; retryId = null; emit({ draft: value.slice(0, 1000) }); },
    async send() {
      if (stopped || state.sending || !state.draft.trim()) return;
      retryId ??= crypto.randomUUID();
      emit({ sending: true, error: null });
      try {
        const result = await client.rpc("send_my_trip_message", { booking_value: bookingId, role_value: role,
          body_value: state.draft.trim(), request_value: retryId });
        if (stopped) return;
        if (result.error) throw result.error;
        if (!result.data) throw new Error("Message confirmation unavailable.");
        retryId = null; emit({ draft: "" });
        await refresh();
      } catch {
        emit({ error: "Message could not be confirmed. Your text is kept; retry sends the same message without duplicating it." });
      } finally { emit({ sending: false }); }
    },
    stop() { stopped = true; request++; state = { ...state, messages: [], draft: "" }; },
  };
}
