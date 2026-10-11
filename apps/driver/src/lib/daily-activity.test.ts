import { describe, expect, it } from "vitest";
import { activityLabels, type DailyActivity } from "./daily-activity";

const day: DailyActivity = { driverProfileId: "driver", timeZone: "America/Chicago", localDate: "2026-10-11",
  startsAt: "2026-10-11T05:00:00Z", endsAt: "2026-10-12T05:00:00Z", asOf: "2026-10-11T12:00:00Z",
  completedTrips: 2, distanceMeters: 12340, missingDistanceTrips: 0, onlineSeconds: 7325 };
describe("Driver daily activity display", () => {
  it("uses measured kilometers and whole hours/minutes", () => {
    expect(activityLabels(day)).toEqual({ distance: "12.3 km", online: "2h 2m" });
  });
  it("distinguishes unavailable measurements from a genuine empty day", () => {
    expect(activityLabels(null)).toEqual({ distance: "Unavailable", online: "Unavailable" });
    expect(activityLabels({ ...day, distanceMeters: 0, onlineSeconds: 0 })).toEqual({ distance: "0 km", online: "0h 0m" });
    expect(activityLabels({ ...day, distanceMeters: null, onlineSeconds: null })).toEqual(activityLabels(null));
  });
});
