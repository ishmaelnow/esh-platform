import { describe, expect, it, vi } from "vitest";
import type { PlatformSupabaseClient } from "./index";
import { createTripMessageController, readTripMessages, type TripMessageState } from "./trip-messages";

describe("trip message transport", () => {
  it("rejects malformed message payloads", () => {
    expect(readTripMessages([])).toEqual([]);
    expect(readTripMessages([{ messageId: "unicode", senderRole: "rider", body: "🚕".repeat(1000), sentAt: new Date().toISOString() }])).toHaveLength(1);
    expect(() => readTripMessages([{ body: "private" }])).toThrow();
    expect(() => readTripMessages(null)).toThrow();
  });
  it("keeps a request ID for uncertain retries, clears draft only after confirmation", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: "network" } })
      .mockResolvedValueOnce({ data: "confirmed-id", error: null }).mockResolvedValue({ data: [], error: null });
    const states: TripMessageState[] = [];
    const model = createTripMessageController({ rpc } as unknown as PlatformSupabaseClient, "trip", "rider", (state) => states.push(state));
    model.draft("I am outside");
    await model.send();
    expect(states.at(-1)?.draft).toBe("I am outside");
    expect(states.at(-1)?.error).toContain("could not be confirmed");
    await model.send();
    const first = rpc.mock.calls[0]?.[1] as { request_value: string };
    const retry = rpc.mock.calls[1]?.[1] as { request_value: string };
    expect(first.request_value).toBe(retry.request_value);
    expect(states.at(-1)?.draft).toBe("");
    expect(states.at(-1)?.sending).toBe(false);
  });
  it("ignores late responses after leaving a conversation", async () => {
    let resolve!: (value: unknown) => void;
    const rpc = vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; }));
    const changed = vi.fn();
    const model = createTripMessageController({ rpc } as unknown as PlatformSupabaseClient, "trip", "driver", changed);
    const pending = model.refresh();
    model.stop(); resolve({ data: [{ messageId: "private", senderRole: "rider", body: "secret", sentAt: new Date().toISOString() }], error: null });
    await pending;
    expect(changed).not.toHaveBeenCalled();
  });
  it("clears visible messages when access/refresh fails", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [{ messageId: "1", senderRole: "driver", body: "hello", sentAt: new Date().toISOString() }], error: null })
      .mockResolvedValue({ data: null, error: { message: "denied" } });
    const states: TripMessageState[] = [];
    const model = createTripMessageController({ rpc } as unknown as PlatformSupabaseClient, "trip", "rider", (state) => states.push(state));
    await model.refresh(); await model.refresh();
    expect(states.at(-1)?.messages).toEqual([]);
    expect(states.at(-1)?.error).toContain("unavailable");
  });
});
