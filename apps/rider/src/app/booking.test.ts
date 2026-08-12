import { describe, expect, it } from "vitest";
import {
  bookingStatusLabel,
  canCancelBooking,
  normalizeTenantSlug,
  riderErrorMessage,
  formatDateTimeInputInZone,
  zonedDateTimeToIso,
} from "./booking";

describe("rider booking helpers", () => {
  it("permits cancellation only before a trip starts", () => {
    expect(canCancelBooking("requested")).toBe(true);
    expect(canCancelBooking("arrived")).toBe(true);
    expect(canCancelBooking("in_progress")).toBe(false);
    expect(canCancelBooking("completed")).toBe(false);
  });

  it("converts a tenant wall-clock pickup to UTC", () => {
    expect(zonedDateTimeToIso("2026-08-02T10:30", "America/Chicago")).toBe(
      "2026-08-02T15:30:00.000Z",
    );
    expect(formatDateTimeInputInZone(new Date("2026-08-02T15:30:00.000Z"), "America/Chicago")).toBe(
      "2026-08-02T10:30",
    );
  });

  it("presents lifecycle statuses in rider language", () => {
    expect(bookingStatusLabel("requested")).toBe("Finding a driver");
    expect(bookingStatusLabel("in_progress")).toBe("Trip in progress");
  });

  it("normalizes tenant links and unknown errors", () => {
    expect(normalizeTenantSlug(" Dallas-Rides ")).toBe("dallas-rides");
    expect(riderErrorMessage(new Error("Not available"))).toBe("Not available");
    expect(riderErrorMessage({ message: "Database rejected booking" })).toBe("Database rejected booking");
    expect(riderErrorMessage("unknown")).toBe("Something went wrong. Please try again.");
  });
});
