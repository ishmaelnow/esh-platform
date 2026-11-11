import { describe, expect, it } from "vitest";
import { credentialsCover, type PlanningRecord } from "./planning";
import {
  credentialKeys,
  normalizeCredentialKey,
  policyReviewIssues,
  qualificationName,
} from "./policy-review-validation";

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
  it("handles natural qualification names and preserves valid existing identifiers", () => {
    expect(
      credentialKeys('"CPR / FIRST AID", `Wheelchair training`, 2026 clearance, Sûreté'),
    ).toEqual(["cpr_first_aid", "wheelchair_training", "qualification_2026_clearance", "surete"]);
    expect(normalizeCredentialKey("district__driver_")).toBe("district__driver_");
    expect(normalizeCredentialKey("A")).toBe("qualification_a");
    expect(qualificationName("wheelchair_training")).toBe("wheelchair training");
    expect(normalizeCredentialKey(qualificationName("district__driver_"))).toBe(
      "district__driver_",
    );
  });
  it("matches ordinary policy names to independently reviewed resource qualifications", () => {
    const reviewed: PlanningRecord = {
      id: "TEST DRIVER",
      kind: "resource",
      customerId: null,
      reference: "TEST DRIVER",
      revision: 1,
      state: "active",
      actorId: "TEST REVIEWER",
      recordedAt: "2026-11-11",
      reason: "TEST REVIEW",
      data: {
        validFrom: "2026-01-01",
        validUntil: "2027-12-31",
        credentials: [
          {
            key: normalizeCredentialKey("`WHEELCHAIR TRAINING`"),
            validFrom: "2026-01-01",
            validUntil: "2027-12-31",
          },
        ],
      },
    };
    expect(
      credentialsCover(reviewed, credentialKeys("Wheelchair training"), "2026-12-12", "2027-06-01"),
    ).toBe(true);
    expect(
      credentialsCover(reviewed, credentialKeys("Different training"), "2026-12-12", "2027-06-01"),
    ).toBe(false);
  });
  it("accepts the documented test policy and optional empty equipment lists", () => {
    const form = validForm();
    expect(policyReviewIssues(form)).toEqual([]);
    form.delete("driver_car_seat");
    form.delete("attendant_car_seat");
    form.set("driverKeys", "test_driver_clearance, test_lift_driver");
    expect(policyReviewIssues(form)).toEqual([]);
  });
  it.each(["`test_driver`", '"test_driver"', "Test_driver", "test driver", "test-driver"])(
    "automatically handles ordinary formatting in %s",
    (key) => {
      const form = validForm();
      form.set("driverKeys", key);
      expect(policyReviewIssues(form)).toEqual([]);
      expect(credentialKeys(key)).toEqual(["test_driver"]);
    },
  );
  it("checks every equipment/role field and bounds each list", () => {
    for (const tag of ["wheelchair_lift", "booster_seat", "car_seat"])
      for (const role of ["driver", "attendant"]) {
        const form = validForm();
        form.set(`${role}_${tag}`, "***");
        expect(policyReviewIssues(form)).toHaveLength(1);
      }
    const form = validForm();
    form.set("driverKeys", Array.from({ length: 21 }, (_, i) => `test_${i}`).join(","));
    expect(policyReviewIssues(form)).toEqual([expect.stringContaining("no more than 20")]);
  });
  it("handles the owner's mixed-case/spaced entries consistently for policy and resource keys", () => {
    const form = validForm();
    const entries = {
      driverKeys: "cDRIVER TODAY",
      attendantKeys: "cATTEND TODAY",
      driver_wheelchair_lift: "cWHELL TODAY",
      attendant_wheelchair_lift: "cWHELLTO TODAY 2 ",
      driver_booster_seat: "cBOOST TODAY",
      attendant_booster_seat: "cSEAT TODAY",
      driver_car_seat: "cAR SEAT TODAY",
      attendant_car_seat: "cAR SEAT ATTENDANT TODAY",
    };
    for (const [key, value] of Object.entries(entries)) {
      form.set(key, value);
      expect(credentialKeys(value)).toEqual([normalizeCredentialKey(value)]);
      expect(normalizeCredentialKey(normalizeCredentialKey(value))).toBe(
        normalizeCredentialKey(value),
      );
    }
    expect(policyReviewIssues(form)).toEqual([]);
    expect(credentialKeys('`Wheelchair Training`, "Booster Training"')).toEqual([
      "wheelchair_training",
      "booster_training",
    ]);
    form.set("driverKeys", "***");
    expect(policyReviewIssues(form)).toEqual([
      expect.stringContaining("enter a qualification name"),
    ]);
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
