import { describe, it, expect, vi } from "vitest";
import {
  attendantDemand,
  policyCredentialKeys,
  reviewWindow,
  vehicleBlockers,
  type PlanningRecord,
} from "./planning";
import { policyReviewIssues } from "./policy-review-validation";
const record = (data: PlanningRecord["data"]): PlanningRecord => ({
  id: "TEST",
  kind: "policy",
  customerId: "TEST SCHOOL",
  reference: "TEST",
  revision: 1,
  state: "active",
  data,
  actorId: "TEST REVIEWER",
  recordedAt: "2026-11-24",
  reason: "TEST REVIEW",
});
describe("school-owned policy rules", () => {
  it("permits explicitly reviewed empty requirements without relaxing legacy policies", () => {
    const student = record({ requirements: ["wheelchair_lift"], seating: "wheelchair" });
    expect(
      policyCredentialKeys(
        record({ policyVersion: 2, driverKeys: [], equipmentDriverKeys: {} }),
        "driver",
        [student],
      ),
    ).toEqual([]);
    expect(
      policyCredentialKeys(
        record({ driverKeys: ["district_driver"], equipmentDriverKeys: {} }),
        "driver",
        [student],
      ),
    ).toBeNull();
    expect(
      policyCredentialKeys(
        record({
          policyVersion: 2,
          driverKeys: ["district_driver"],
          equipmentDriverKeys: { wheelchair_lift: ["lift_training"] },
        }),
        "driver",
        [student],
      ),
    ).toEqual(["district_driver", "lift_training"]);
  });
  it("keeps dedicated student demand and reserves seats for school route monitors", () => {
    const student = record({ requirements: ["attendant"], seating: "seat" });
    expect(
      attendantDemand(record({ policyVersion: 2, minimumRouteAttendants: 0 }), [student]),
    ).toBe(1);
    expect(
      attendantDemand(record({ policyVersion: 2, minimumRouteAttendants: 3 }), [student]),
    ).toBe(3);
    const vehicle = record({ seats: 3, wheelchairPositions: 0, boosterSeats: 0, carSeats: 0 });
    expect(vehicleBlockers(vehicle, [student], 3)).toContain("passenger/attendant seats");
  });
  it("uses the next school day and exceptions for per-service-date suggestions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-22T12:00:00Z"));
    try {
      const policy = record({ policyVersion: 2, reviewCoverage: "service_date" });
      expect(
        reviewWindow(
          policy,
          "2026-11-22",
          "2026-12-18",
          [1, 2, 3, 4, 5],
          ["2026-11-23"],
          "America/New_York",
        ),
      ).toEqual({ from: "2026-11-24", until: "2026-11-24" });
      expect(reviewWindow(record({}), "2026-11-22", "2026-12-18")).toEqual({
        from: "2026-11-22",
        until: "2026-12-18",
      });
      expect(reviewWindow(policy, "2026-11-22", "2026-11-22", [])).toEqual({ from: "", until: "" });
    } finally {
      vi.useRealTimers();
    }
  });
  it("requires qualification text only for selected school requirements", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      reference: "TEST",
      sourceReference: "TEST POLICY",
      reason: "TEST REVIEW",
      validFrom: "2026-01-01",
      validUntil: "2027-01-01",
      policyVersion: "2",
      minimumRouteAttendants: "0",
      reviewCoverage: "full_term",
      policyReviewed: "on",
    }))
      form.set(key, value);
    expect(policyReviewIssues(form)).toEqual([]);
    form.set("require_driverKeys", "on");
    expect(policyReviewIssues(form)).toContain(
      "Required Driver qualifications: enter a qualification name.",
    );
    form.set("driverKeys", "School Driver Training");
    expect(policyReviewIssues(form)).toEqual([]);
    form.set("minimumRouteAttendants", "-1");
    expect(policyReviewIssues(form)).toContain("Enter an attendant minimum from 0 to 20.");
  });
});
