import { describe, expect, it, vi } from "vitest";
import type { PlatformSupabaseClient } from "./index";
import { createTripAttentionController, readTripAttention, type TripAttentionState } from "./trip-attention";
const booking = "90000000-0000-4000-8000-000000000001";
const item = { kind: "messages", bookingId: booking, itemId: booking, count: 2 };
describe("private unread attention", () => {
  it("rejects malformed payloads without accepting fabricated counts or targets", () => {
    expect(readTripAttention([item])).toEqual([item]);
    for (const value of [null, [{ ...item, kind: "arbitrary" }], [{ ...item, count: -1 }], [{ ...item, count: 1.5 }], [{ ...item, bookingId: "url" }]])
      expect(() => readTripAttention(value)).toThrow();
  });
  it("scopes list calls and acknowledges only the supplied messages", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [item], error: null });
    const changed = vi.fn();
    const model = createTripAttentionController({ rpc } as unknown as PlatformSupabaseClient, "rider", "tenant", changed);
    await model.refresh();
    expect(rpc).toHaveBeenCalledWith("my_trip_attention", { role_value: "rider", tenant_value: "tenant" });
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValue({ data: [], error: null });
    await model.mark(booking, { messages: ["visible-message"] });
    expect(rpc).toHaveBeenCalledWith("mark_my_trip_messages_read", { booking_value: booking, role_value: "rider", message_values: ["visible-message"] });
    expect(changed).toHaveBeenLastCalledWith({ items: [], error: "" });
  });
  it("does not optimistically clear on failed acknowledgement and uses exact loaded version", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [item], error: null }).mockResolvedValue({ data: null, error: { message: "PRIVATE failure" } });
    const states: TripAttentionState[] = [];
    const model = createTripAttentionController({ rpc } as unknown as PlatformSupabaseClient, "driver", null, (state) => states.push(state));
    await model.refresh(); await model.mark(booking, { caseId: booking, version: 2 });
    expect(states.at(-1)?.items).toEqual([item]);
    expect(states.at(-1)?.error).toContain("could not be saved");
    expect(states.at(-1)?.error).not.toContain("PRIVATE");
    expect(rpc).toHaveBeenCalledWith("mark_my_trip_support_read", { booking_value: booking, role_value: "driver", case_value: booking, version_value: 2 });
    await model.refresh();
    expect(states.at(-1)?.items).toEqual([]);
    expect(states.at(-1)?.error).toContain("could not be checked");
  });
  it("discards obsolete account loads and acknowledgements after stopping", async () => {
    let resolve!: (value: unknown) => void;
    const rpc = vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; }));
    const changed = vi.fn();
    const model = createTripAttentionController({ rpc } as unknown as PlatformSupabaseClient, "driver", null, changed);
    const pending = model.refresh(); model.stop(); resolve({ data: [item], error: null }); await pending;
    await model.mark(booking, { messages: ["visible"] });
    expect(changed).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("latest refresh wins when requests complete out of order", async () => {
    const pending: ((value: unknown) => void)[] = [];
    const rpc = vi.fn().mockImplementation(() => new Promise((done) => pending.push(done)));
    const changed = vi.fn();
    const model = createTripAttentionController({ rpc } as unknown as PlatformSupabaseClient, "driver", null, changed);
    const old = model.refresh(), fresh = model.refresh();
    pending[1]!({ data: [], error: null }); await fresh;
    pending[0]!({ data: [item], error: null }); await old;
    expect(changed).toHaveBeenCalledTimes(1); expect(changed).toHaveBeenLastCalledWith({ items: [], error: "" });
  });
});
