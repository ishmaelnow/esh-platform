import { describe, expect, it } from "vitest";
import { parseDispatchBookingInput } from "./dispatch";

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
