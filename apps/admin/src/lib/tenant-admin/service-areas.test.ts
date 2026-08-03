import { describe, expect, it } from "vitest";
import { parseServiceAreaInput, restoreServiceAreaDraft } from "./service-areas";

describe("service area input", () => {
  it("normalizes a circular service area", () => {
    expect(
      parseServiceAreaInput({
        name: " Downtown ",
        description: " Core coverage ",
        centerLatitude: "32.7767",
        centerLongitude: -96.797,
        radiusKm: "25",
        coverageMode: "all_drivers",
      }),
    ).toEqual({
      name: "Downtown",
      description: "Core coverage",
      centerLatitude: 32.7767,
      centerLongitude: -96.797,
      radiusKm: 25,
      coverageMode: "all_drivers",
    });
  });

  it("rejects invalid coordinates and radius", () => {
    expect(() =>
      parseServiceAreaInput({
        name: "Bad latitude",
        centerLatitude: 91,
        centerLongitude: 0,
        radiusKm: 10,
        coverageMode: "all_drivers",
      }),
    ).toThrow(/latitude/i);
    expect(() =>
      parseServiceAreaInput({
        name: "Bad radius",
        centerLatitude: 0,
        centerLongitude: 0,
        radiusKm: 0,
        coverageMode: "all_drivers",
      }),
    ).toThrow(/radius/i);
  });

  it("requires a supported driver coverage mode", () => {
    expect(() =>
      parseServiceAreaInput({
        name: "Downtown",
        centerLatitude: 32.7767,
        centerLongitude: -96.797,
        radiusKm: 25,
        coverageMode: "some_drivers",
      }),
    ).toThrow(/eligible drivers/i);
  });
});

describe("service area browser draft", () => {
  it("restores an open in-progress form after a workspace remount", () => {
    expect(
      restoreServiceAreaDraft(
        JSON.stringify({
          showForm: true,
          draft: {
            name: "DFW Metroplex",
            description: "Dallas, Fort Worth, and Denton",
            centerLatitude: "32.8998",
            centerLongitude: "-97.0403",
            radiusKm: "70",
            coverageMode: "all_drivers",
          },
        }),
      ),
    ).toEqual({
      showForm: true,
      draft: {
        name: "DFW Metroplex",
        description: "Dallas, Fort Worth, and Denton",
        centerLatitude: "32.8998",
        centerLongitude: "-97.0403",
        radiusKm: "70",
        coverageMode: "all_drivers",
      },
    });
  });

  it("discards malformed session data safely", () => {
    expect(restoreServiceAreaDraft("not-json").showForm).toBe(false);
  });
});
