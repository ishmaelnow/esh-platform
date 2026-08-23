import { describe, expect, it } from "vitest";
import { contractFareMinor } from "./fare-policy";

describe("fare policy contract", () => {
  it("protects a guaranteed fare from traffic increases", () => {
    expect(contractFareMinor({ policy: "guaranteed_upfront", quotedFareMinor: 3200, actualFareMinor: 4700 })).toBe(3200);
  });
  it("uses trusted actual fare for metered trips", () => {
    expect(contractFareMinor({ policy: "metered_actual", quotedFareMinor: 3200, actualFareMinor: 4700 })).toBe(4700);
  });
  it("allows reductions and caps increases for protected flexible trips", () => {
    expect(contractFareMinor({ policy: "protected_flexible", quotedFareMinor: 3200, actualFareMinor: 2800, maximumFareMinor: 3800 })).toBe(2800);
    expect(contractFareMinor({ policy: "protected_flexible", quotedFareMinor: 3200, actualFareMinor: 4700, maximumFareMinor: 3800 })).toBe(3800);
  });
});
