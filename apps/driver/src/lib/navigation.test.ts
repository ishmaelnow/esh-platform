import { describe, expect, it } from "vitest";
import { buildNavigationUrl } from "./navigation";

describe("driver navigation links", () => {
  const destination = { latitude: 39.9526, longitude: -75.1652, label: "Pickup" };

  it("opens an Android geo intent", () => {
    expect(buildNavigationUrl("android", destination)).toContain("geo:0,0?q=");
  });

  it("opens Apple Maps on iOS", () => {
    expect(buildNavigationUrl("ios", destination)).toContain("maps://?daddr=");
  });

  it("uses a web directions link outside native apps", () => {
    expect(buildNavigationUrl("web", destination)).toContain("google.com/maps/dir");
  });
});
