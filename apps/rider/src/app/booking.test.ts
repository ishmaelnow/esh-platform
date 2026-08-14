import { describe, expect, it } from "vitest";
import {
  bookingStatusLabel,
  canCancelBooking,
  normalizeTenantSlug,
  riderErrorMessage,
  formatDateTimeInputInZone,
  zonedDateTimeToIso,
  generateRecurringPickupTimes,
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

  it("generates selected recurring weekdays in the tenant time zone", () => {
    expect(generateRecurringPickupTimes({ startDate: "2026-08-03", endDate: "2026-08-10",
      localTime: "09:15", weekdays: [1, 3], timeZone: "America/New_York" })).toEqual([
      "2026-08-03T13:15:00.000Z", "2026-08-05T13:15:00.000Z",
      "2026-08-10T13:15:00.000Z",
    ]);
  });

  it("rejects empty and oversized recurring schedules", () => {
    expect(() => generateRecurringPickupTimes({ startDate: "2026-08-03", endDate: "2026-08-03",
      localTime: "09:15", weekdays: [1], timeZone: "UTC" })).toThrow("at least two trips");
    expect(() => generateRecurringPickupTimes({ startDate: "2026-08-01", endDate: "2026-09-30",
      localTime: "09:15", weekdays: [1, 2, 3, 4, 5, 6, 7], timeZone: "UTC", maximum: 5 })).toThrow("limited to 5 trips");
  });

  it("normalizes tenant links and unknown errors", () => {
    expect(normalizeTenantSlug(" Dallas-Rides ")).toBe("dallas-rides");
    expect(riderErrorMessage(new Error("Not available"))).toBe("Not available");
    expect(riderErrorMessage({ message: "Database rejected booking" })).toBe("Database rejected booking");
    expect(riderErrorMessage("unknown")).toBe("Something went wrong. Please try again.");
  });
});
