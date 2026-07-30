import { describe, expect, it } from "vitest";
import { parseServiceAreaInput } from "./service-areas";

describe("service area input", () => {
  it("normalizes a circular service area", () => {
    expect(
      parseServiceAreaInput({
        name: " Downtown ",
        description: " Core coverage ",
        centerLatitude: "32.7767",
        centerLongitude: -96.797,
        radiusKm: "25",
      }),
    ).toEqual({
      name: "Downtown",
      description: "Core coverage",
      centerLatitude: 32.7767,
      centerLongitude: -96.797,
      radiusKm: 25,
    });
  });

  it("rejects invalid coordinates and radius", () => {
    expect(() =>
      parseServiceAreaInput({
        name: "Bad latitude",
        centerLatitude: 91,
        centerLongitude: 0,
        radiusKm: 10,
      }),
    ).toThrow(/latitude/i);
    expect(() =>
      parseServiceAreaInput({
        name: "Bad radius",
        centerLatitude: 0,
        centerLongitude: 0,
        radiusKm: 0,
      }),
    ).toThrow(/radius/i);
  });
});
