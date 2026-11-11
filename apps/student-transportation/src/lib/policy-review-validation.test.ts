import { describe, expect, it } from "vitest";
import { policyReviewIssues } from "./policy-review-validation";

function validForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    reference: "TEST_POLICY_20261111",
    sourceReference: "TEST ONLY - simulated district policy",
    validFrom: "2026-11-11",
    validUntil: "2027-06-30",
    driverKeys: "test_driver_clearance",
    attendantKeys: "test_attendant_clearance",
    driver_wheelchair_lift: "test_lift_driver",
    attendant_wheelchair_lift: "test_lift_attendant",
    driver_booster_seat: "test_booster_driver",
    attendant_booster_seat: "test_booster_attendant",
    driver_car_seat: "test_car_seat_driver",
    attendant_car_seat: "test_car_seat_attendant",
    policyReviewed: "on",
    reason: "TEST ONLY - validate planning qualification checks",
  }))
    form.set(key, value);
  return form;
}

describe("Policy review save guards", () => {
  it("accepts the documented test policy and optional empty equipment lists", () => {
    const form = validForm();
    expect(policyReviewIssues(form)).toEqual([]);
    form.delete("driver_car_seat");
    form.delete("attendant_car_seat");
    form.set("driverKeys", "test_driver_clearance, test_lift_driver");
    expect(policyReviewIssues(form)).toEqual([]);
  });
  it.each(["`test_driver`", '"test_driver"', "Test_driver", "test driver", "test-driver", "a"])(
    "blocks malformed credential key %s without echoing its contents",
    (key) => {
      const form = validForm();
      form.set("driverKeys", key);
      expect(policyReviewIssues(form)).toEqual([
        expect.stringContaining("Required Driver credential keys: each key must"),
      ]);
    },
  );
  it("checks every equipment/role field and bounds each list", () => {
    for (const tag of ["wheelchair_lift", "booster_seat", "car_seat"])
      for (const role of ["driver", "attendant"]) {
        const form = validForm();
        form.set(`${role}_${tag}`, "`invalid`");
        expect(policyReviewIssues(form)).toHaveLength(1);
      }
    const form = validForm();
    form.set("driverKeys", Array.from({ length: 21 }, (_, i) => `test_${i}`).join(","));
    expect(policyReviewIssues(form)).toEqual([expect.stringContaining("no more than 20")]);
  });
  it("requires nonblank references, reason, base credentials, dates and confirmation", () => {
    const form = validForm();
    for (const key of ["reference", "sourceReference", "reason", "driverKeys", "attendantKeys"])
      form.set(key, "  ");
    form.delete("policyReviewed");
    form.delete("validFrom");
    form.delete("validUntil");
    expect(policyReviewIssues(form)).toHaveLength(8);
  });
  it("rejects reversed or impossible dates and accepts same-day validity", () => {
    const form = validForm();
    form.set("validUntil", "2026-11-10");
    expect(policyReviewIssues(form)).toEqual([expect.stringContaining("on or after")]);
    form.set("validUntil", "2027-02-30");
    expect(policyReviewIssues(form)).toEqual([expect.stringContaining("valid through")]);
    form.set("validUntil", "2026-11-11");
    expect(policyReviewIssues(form)).toEqual([]);
  });
  it("validates revisions using the immutable reference absent from disabled inputs", () => {
    const form = validForm();
    form.delete("reference");
    expect(policyReviewIssues(form, "EXISTING_TEST_POLICY")).toEqual([]);
  });
});
