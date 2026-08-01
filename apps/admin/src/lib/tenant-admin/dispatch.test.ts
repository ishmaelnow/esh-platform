import { describe, expect, it } from "vitest";
import { parseDispatchBookingInput, parseMatchingSettingsInput } from "./dispatch";

describe("manual dispatch booking input", () => {
  it("normalizes a valid booking", () => {
    expect(
      parseDispatchBookingInput({
        customerName: " Alex Johnson ",
        customerPhone: " 469-555-0123 ",
        pickupAddress: " 100 Main St ",
        destinationAddress: " DFW Terminal A ",
        notes: " East entrance ",
      }),
    ).toEqual({
      customerName: "Alex Johnson",
      customerPhone: "469-555-0123",
      pickupAddress: "100 Main St",
      destinationAddress: "DFW Terminal A",
      notes: "East entrance",
    });
  });

  it("requires customer, pickup, and destination", () => {
    expect(() =>
      parseDispatchBookingInput({
        customerName: "",
        pickupAddress: "",
        destinationAddress: "",
      }),
    ).toThrow(/required/i);
  });
});

describe("automatic matching settings", () => {
  it("normalizes valid controls", () => {
    expect(
      parseMatchingSettingsInput({
        automaticMatchingEnabled: true,
        offerDurationSeconds: "90",
        maximumAttempts: "3",
      }),
    ).toEqual({
      automaticMatchingEnabled: true,
      offerDurationSeconds: 90,
      maximumAttempts: 3,
    });
  });

  it.each([
    [{ automaticMatchingEnabled: "true", offerDurationSeconds: 90, maximumAttempts: 3 }],
    [{ automaticMatchingEnabled: true, offerDurationSeconds: 29, maximumAttempts: 3 }],
    [{ automaticMatchingEnabled: true, offerDurationSeconds: 90, maximumAttempts: 11 }],
  ])("rejects unsafe settings %#", (input) => {
    expect(() => parseMatchingSettingsInput(input)).toThrow();
  });
});
