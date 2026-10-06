import { describe, expect, it } from "vitest";
import { parseSavedPlaces } from "./saved-places";

describe("saved address response validation", () => {
  const place = { key: "home", label: "Fixture address", latitude: 32.79, longitude: -96.81 };
  it("accepts empty accounts and valid geographic coordinates", () => {
    expect(parseSavedPlaces([])).toEqual([]);
    expect(parseSavedPlaces([place])).toEqual([place]);
  });
  it.each([null, {}, [null], [{ ...place, key: "other" }], [place, place],
    [{ ...place, label: " " }], [{ ...place, label: "x".repeat(501) }],
    [{ ...place, latitude: NaN }], [{ ...place, latitude: 91 }],
    [{ ...place, longitude: Infinity }], [{ ...place, longitude: "-96.81" }]])("rejects unsafe responses %#", (data) => {
    expect(() => parseSavedPlaces(data)).toThrow();
  });
});
