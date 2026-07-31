import { describe, expect, it } from "vitest";
import {
  bookingStatusLabel,
  canCancelBooking,
  normalizeTenantSlug,
  riderErrorMessage,
} from "./booking";

describe("rider booking helpers", () => {
  it("permits cancellation only before a trip starts", () => {
    expect(canCancelBooking("requested")).toBe(true);
    expect(canCancelBooking("arrived")).toBe(true);
    expect(canCancelBooking("in_progress")).toBe(false);
    expect(canCancelBooking("completed")).toBe(false);
  });

  it("presents lifecycle statuses in rider language", () => {
    expect(bookingStatusLabel("requested")).toBe("Finding a driver");
    expect(bookingStatusLabel("in_progress")).toBe("Trip in progress");
  });

  it("normalizes tenant links and unknown errors", () => {
    expect(normalizeTenantSlug(" Dallas-Rides ")).toBe("dallas-rides");
    expect(riderErrorMessage(new Error("Not available"))).toBe("Not available");
    expect(riderErrorMessage("unknown")).toBe("Something went wrong. Please try again.");
  });
});
