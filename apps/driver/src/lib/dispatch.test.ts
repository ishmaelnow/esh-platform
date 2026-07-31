import { describe, expect, it } from "vitest";
import { offerCountdownLabel, offerSecondsRemaining } from "./dispatch";

describe("dispatch offer countdown", () => {
  it("rounds remaining partial seconds up", () => {
    expect(
      offerSecondsRemaining("2026-08-01T12:00:02.100Z", Date.parse("2026-08-01T12:00:00Z")),
    ).toBe(3);
  });

  it("never reports negative time", () => {
    const now = Date.parse("2026-08-01T12:00:05Z");
    expect(offerSecondsRemaining("2026-08-01T12:00:00Z", now)).toBe(0);
    expect(offerCountdownLabel("2026-08-01T12:00:00Z", now)).toContain("expired");
  });
});
