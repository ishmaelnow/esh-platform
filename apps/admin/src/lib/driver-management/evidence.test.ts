import { describe, expect, it } from "vitest";
import {
  isEvidenceCurrentlyApproved,
  parseDriverEvidenceReview,
  validateEvidenceExpiration,
} from "./evidence";

describe("driver evidence", () => {
  it("normalizes an approval with an expiration date", () => {
    expect(
      parseDriverEvidenceReview({
        status: "approved",
        notes: " License verified ",
        expiresOn: "2027-07-24",
      }),
    ).toEqual({
      status: "approved",
      notes: "License verified",
      expiresOn: "2027-07-24",
    });
  });

  it("allows a previously rejected item to be approved without notes or expiration", () => {
    expect(parseDriverEvidenceReview({ status: "approved" })).toEqual({
      status: "approved",
      notes: null,
      expiresOn: null,
    });
  });

  it("requires rejection notes and a real ISO date", () => {
    expect(() => parseDriverEvidenceReview({ status: "rejected" })).toThrow(
      /rejection reason is required/i,
    );
    expect(() =>
      parseDriverEvidenceReview({ status: "approved", expiresOn: "2027-02-30" }),
    ).toThrow(/valid date/i);
  });

  it("treats expired evidence as noncompliant", () => {
    expect(
      isEvidenceCurrentlyApproved(
        { reviewStatus: "approved", expiresOn: "2026-07-23" },
        "2026-07-24",
      ),
    ).toBe(false);
    expect(
      isEvidenceCurrentlyApproved(
        { reviewStatus: "approved", expiresOn: "2026-07-24" },
        "2026-07-24",
      ),
    ).toBe(true);
  });

  it("requires a future date only for expiration-managed approvals", () => {
    const approval = { status: "approved" as const, notes: null, expiresOn: null };
    expect(() => validateEvidenceExpiration(approval, true, "2026-07-28")).toThrow(
      /future expiration date/i,
    );
    expect(validateEvidenceExpiration(approval, false, "2026-07-28")).toBe(approval);
    expect(
      validateEvidenceExpiration(
        { status: "approved", notes: null, expiresOn: "2026-07-29" },
        true,
        "2026-07-28",
      ),
    ).toMatchObject({ expiresOn: "2026-07-29" });
  });
});
