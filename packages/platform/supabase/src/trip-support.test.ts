import { describe, expect, it, vi } from "vitest";
import type { PlatformSupabaseClient } from "./index";
import { createRiderSupportController, readSupportCases, type SupportState } from "./trip-support";

const report = { caseId: "case", bookingId: "trip", category: "lost_item", description: "Lost a test bag", status: "open",
  response: "", version: 1, createdAt: "2026-10-10T12:00:00Z", updatedAt: "2026-10-10T12:00:00Z", updates: [] };
describe("trip support transport", () => {
  it("rejects malformed reports and review histories", () => {
    expect(readSupportCases([report])).toHaveLength(1);
    for (const value of [null, {}, [{}], [{ ...report, status: "approved" }], [{ ...report, version: 0 }], [{ ...report, updates: [{ response: "hello" }] }]])
      expect(() => readSupportCases(value)).toThrow();
  });
  it("reuses the request identity after an uncertain send without exposing transport details", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "TypeError Load failed" } })
      .mockResolvedValueOnce({ data: "case", error: null }).mockResolvedValue({ data: [report], error: null });
    const states: SupportState[] = [];
    const controller = createRiderSupportController({ rpc } as unknown as PlatformSupabaseClient, "trip", (state) => states.push(state));
    await controller.refresh();
    expect(await controller.send("lost_item", "Lost a test bag")).toBe(false);
    expect(states.at(-1)?.error).toContain("couldn’t confirm");
    expect(states.at(-1)?.error).not.toContain("TypeError");
    expect(await controller.send("lost_item", "Lost a test bag")).toBe(true);
    expect(rpc.mock.calls[1]?.[1]).toEqual(rpc.mock.calls[2]?.[1]);
    expect(states.at(-1)?.cases).toHaveLength(1);
  });
  it("distinguishes a confirmed submission from a failed subsequent refresh", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: "case", error: null })
      .mockRejectedValue(new TypeError("Load failed"));
    const states: SupportState[] = [];
    const controller = createRiderSupportController({ rpc } as unknown as PlatformSupabaseClient, "trip", (state) => states.push(state));
    await controller.refresh();
    expect(await controller.send("lost_item", "Lost a test bag")).toBe(true);
    expect(states.at(-1)?.message).toContain("Report received");
    expect(states.at(-1)?.error).toContain("could not be refreshed");
    expect(states.at(-1)?.ready).toBe(false);
  });
  it("ignores late responses after a trip/account leaves the screen", async () => {
    let resolve!: (value: unknown) => void;
    const rpc = vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; }));
    const changed = vi.fn();
    const controller = createRiderSupportController({ rpc } as unknown as PlatformSupabaseClient, "trip", changed);
    const request = controller.refresh();
    controller.stop(); changed.mockClear(); resolve({ data: [report], error: null }); await request;
    expect(changed).not.toHaveBeenCalled();
  });
  it("clears private reports when refresh fails and blocks submission until recovery", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [report], error: null }).mockResolvedValue({ data: null, error: { message: "denied" } });
    const states: SupportState[] = [];
    const controller = createRiderSupportController({ rpc } as unknown as PlatformSupabaseClient, "trip", (state) => states.push(state));
    await controller.refresh(); await controller.refresh();
    expect(states.at(-1)?.cases).toEqual([]);
    expect(await controller.send("trip_issue", "An issue with the trip")).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
