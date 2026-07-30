import { describe, expect, it } from "vitest";
import {
  availabilityBlockerDetails,
  availabilityErrorMessage,
  documentIssueLabel,
} from "./availability";

describe("driver availability messaging", () => {
  it("identifies each required driver document issue", () => {
    expect(
      availabilityBlockerDetails(
        "driver_documents_incomplete",
        [
          {
            evidenceType: "personal_photo",
            requiredForActivation: true,
            reviewStatus: "pending",
          },
          {
            evidenceType: "reference_document",
            requiredForActivation: true,
            reviewStatus: "expiration_missing",
          },
          {
            evidenceType: "vehicle_photo",
            requiredForActivation: false,
            reviewStatus: "missing",
          },
        ],
        [],
      ),
    ).toEqual([
      "Personal photo: waiting for administrator approval",
      "Reference document: approved, but a future expiration date is required",
    ]);
  });

  it("identifies required vehicle document issues", () => {
    expect(
      availabilityBlockerDetails(
        "vehicle_documents_incomplete",
        [],
        [
          {
            evidenceType: "insurance",
            requiredForService: true,
            reviewStatus: "expired",
          },
          {
            evidenceType: "inspection",
            requiredForService: false,
            reviewStatus: "missing",
          },
        ],
      ),
    ).toEqual(["Vehicle insurance: document is expired"]);
  });

  it("falls back to the database blocker when details are unavailable", () => {
    expect(availabilityBlockerDetails("driver_documents_incomplete", [], [])).toEqual([
      "Driver documents must be approved and current",
    ]);
    expect(availabilityBlockerDetails("vehicle_not_assigned", [], [])).toEqual([
      "An active vehicle must be assigned",
    ]);
    expect(availabilityBlockerDetails("service_area_not_selected", [], [])).toEqual([
      "Select an operating service area",
    ]);
  });

  it("keeps all document states actionable", () => {
    expect(documentIssueLabel("missing")).toBe("document is missing");
    expect(documentIssueLabel("rejected")).toBe("rejected; upload a replacement");
    expect(documentIssueLabel("expired")).toBe("document is expired");
  });

  it("translates database eligibility errors", () => {
    expect(
      availabilityErrorMessage(
        "cannot go online: driver_documents_incomplete, vehicle_not_assigned",
      ),
    ).toBe(
      "Cannot go online. Driver documents must be approved and current; An active vehicle must be assigned.",
    );
  });
});
