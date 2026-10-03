import { describe, expect, it } from "vitest";
import {
  applicationReviewEvidence,
  isEvidenceCurrentlyApproved,
  parseDriverEvidenceReview,
  validateEvidenceExpiration,
  driverDocumentRank,
  driverDocumentLabel,
} from "./evidence";

describe("driver evidence", () => {
  it("shows linked driver uploads with original application history, once and newest first", () => {
    const application = { tenant_id: "tenant", driver_application_id: "application", driver_profile_id: "driver" };
    const record = (id: string, type: string, app: string | null, driver: string | null, date: string, tenant = "tenant") => ({
      id, evidence_type: type, driver_application_id: app, driver_profile_id: driver, tenant_id: tenant,
      submitted_at: date, created_at: date, review_status: "pending",
    });
    const original = { ...record("portrait", "personal_photo", "application", "driver", "2026-10-01"), review_status: "rejected" };
    const records = [
      original,
      record("id", "driver_id_photo", null, "driver", "2026-10-03"),
      record("replacement", "personal_photo", null, "driver", "2026-10-04"),
      record("other-driver", "driver_id_photo", null, "other", "2026-10-05"),
      record("other-app", "insurance", "other", null, "2026-10-05"),
      record("other-tenant", "insurance", "application", "driver", "2026-10-05", "other"),
    ];
    const result = applicationReviewEvidence(application, records);
    expect(result.map((item) => item.id)).toEqual(["replacement", "portrait", "id"]);
    expect(result[1]).toBe(original);
    expect(result[1]?.review_status).toBe("rejected");
    expect(records[0]).toBe(original);
    expect(applicationReviewEvidence({ ...application, driver_profile_id: null }, records).map((item) => item.id)).toEqual(["portrait"]);
  });
  it("groups shuffled evidence in agreed order without changing newest-first records within a type", () => {
    const records = [
      { type: "insurance", id: "policy" }, { type: "reference_document", id: "registration" },
      { type: "personal_photo", id: "new-profile" }, { type: "driver_id_photo", id: "id" },
      { type: "vehicle_photo", id: "car" }, { type: "personal_photo", id: "old-profile" },
    ];
    const sorted = [...records].sort((a, b) => driverDocumentRank(a.type) - driverDocumentRank(b.type));
    expect(sorted.map((record) => record.id)).toEqual(["new-profile", "old-profile", "id", "car", "registration", "policy"]);
    expect(sorted.map((record) => driverDocumentLabel(record.type))).toEqual([
      "Profile photo", "Profile photo", "Driver ID photo", "Vehicle photo", "Vehicle registration document", "Vehicle insurance document",
    ]);
    expect(records[0]!.id).toBe("policy");
  });
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
