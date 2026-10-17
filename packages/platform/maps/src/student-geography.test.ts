import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveStudentStop, studentRoadRoute, type StudentStop } from "./student-geography";
const hint = { latitude: 40, longitude: -75 };
const signal = new AbortController().signal;
const feature = (accuracy = "rooftop", confidence = "exact") => ({
  geometry: { coordinates: [-75, 40] },
  properties: {
    feature_type: "address",
    full_address: "TEST 123 Street, City, PA",
    match_code: { confidence },
    coordinates: {
      accuracy,
      routable_points: [{ name: "default", latitude: 40.0001, longitude: -75 }],
    },
  },
});
afterEach(() => vi.unstubAllGlobals());
describe("Student precision and proposed road routes", () => {
  it("persists permanent address and separate routable point, never approves safety", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ features: [feature()] }));
    vi.stubGlobal("fetch", fetcher);
    const stop = await resolveStudentStop("TEST ADDRESS", hint, "North gate", "test", signal);
    expect(stop).toMatchObject({
      latitude: 40.0001,
      addressLatitude: 40,
      pointSource: "routable",
      loadingInstructions: "North gate",
      safetyStatus: "unreviewed",
    });
    expect(new URL(fetcher.mock.calls[0]![0] as URL).searchParams.get("permanent")).toBe("true");
  });
  it.each([
    ["interpolated", "exact"],
    ["approximate", "exact"],
    ["rooftop", "medium"],
  ])("rejects uncertain %s/%s results", async (accuracy, confidence) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ features: [feature(accuracy, confidence)] })),
    );
    await expect(resolveStudentStop("TEST", hint, "", "test", signal)).rejects.toThrow("precise");
  });
  it("does not silently resolve a different neighborhood", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ features: [feature()] })));
    await expect(
      resolveStudentStop("TEST", { latitude: 41, longitude: -75 }, "", "test", signal),
    ).rejects.toThrow();
  });
  it("requests actual ordered multi-stop curbside geometry with the driving profile", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        waypoints: [{ distance: 0 }, { distance: 10 }, { distance: 5 }, { distance: 0 }],
        routes: [
          {
            distance: 1000,
            duration: 200,
            geometry: {
              type: "LineString",
              coordinates: [
                [-75, 40],
                [-75.01, 40.01],
              ],
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const stops = Array.from(
      { length: 4 },
      (_, i) => ({ ...hint, longitude: -75 + i / 100 }) as StudentStop,
    );
    const result = await studentRoadRoute(stops, "test", signal);
    expect(result.distanceMeters).toBe(1000);
    const url = new URL(fetcher.mock.calls[0]![0] as URL);
    expect(url.pathname).toContain("/mapbox/driving/");
    expect(url.searchParams.get("approaches")).toBe("curb;curb;curb;curb");
  });
  it("rejects road snapping far away from the selected loading point", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          waypoints: [{ distance: 500 }, { distance: 0 }],
          routes: [
            {
              distance: 100,
              duration: 20,
              geometry: {
                type: "LineString",
                coordinates: [
                  [-75, 40],
                  [-75, 41],
                ],
              },
            },
          ],
        }),
      ),
    );
    await expect(studentRoadRoute([hint, hint] as StudentStop[], "test", signal)).rejects.toThrow(
      "sufficiently close",
    );
  });
});
