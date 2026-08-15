import { describe, expect, it } from "vitest";
import { buildPrivacySafeSms } from "./sms";

describe("privacy-safe SMS", () => {
  it("uses a generic arrival message", () => {
    const message = buildPrivacySafeSms("rider_driver_arrived");
    expect(message).toContain("has arrived");
    expect(message).not.toMatch(/street|\$|visa|rider name/i);
  });

  it("skips non-urgent lifecycle messages", () => {
    expect(buildPrivacySafeSms("rider_trip_completed")).toBeNull();
  });
});
