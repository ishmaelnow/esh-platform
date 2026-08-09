import { describe, expect, it } from "vitest";
import { formatRouteDistance, formatRouteDuration } from "./index";

describe("trip route formatting", () => {
  it("formats road distance in miles", () => {
    expect(formatRouteDistance(8046.72)).toBe("5.0 mi");
    expect(formatRouteDistance(32186.88)).toBe("20 mi");
  });
  it("formats short and long ETAs", () => {
    expect(formatRouteDuration(600)).toBe("10 min");
    expect(formatRouteDuration(4500)).toBe("1 hr 15 min");
  });
});
