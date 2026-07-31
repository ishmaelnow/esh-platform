import { describe, expect, it } from "vitest";
import { buildDriverNotificationContent } from "./email";

describe("driver notification email content", () => {
  it("includes rejection context and the portal link", () => {
    const content = buildDriverNotificationContent(
      "driver_evidence_rejected",
      {
        driver_name: "Test Driver",
        evidence_type: "reference_document",
        review_notes: "Upload a clearer copy.",
      },
      "https://driver.eshapp.com",
    );

    expect(content.subject).toContain("reference document");
    expect(content.text).toContain("Upload a clearer copy.");
    expect(content.text).toContain("https://driver.eshapp.com/");
  });

  it("rejects unknown notification types", () => {
    expect(() =>
      buildDriverNotificationContent("unknown", {}, "https://driver.eshapp.com"),
    ).toThrow("Unsupported driver notification type.");
  });

  it("builds an expiration reminder with the evidence date", () => {
    const content = buildDriverNotificationContent(
      "driver_evidence_expiring_7d",
      {
        driver_name: "Test Driver",
        evidence_type: "reference_document",
        expires_on: "2026-08-03",
      },
      "https://driver.eshapp.com",
    );

    expect(content.subject).toContain("within 7 days");
    expect(content.text).toContain("Expiration date: 2026-08-03");
  });

  it("builds a vehicle compliance rejection notice", () => {
    const content = buildDriverNotificationContent(
      "vehicle_evidence_rejected",
      {
        driver_name: "Test Driver",
        evidence_type: "insurance",
        review_notes: "The policy number is not readable.",
      },
      "https://driver.eshapp.com",
    );

    expect(content.subject).toContain("vehicle insurance");
    expect(content.text).toContain("policy number");
  });

  it("builds a time-bounded dispatch offer notice", () => {
    const content = buildDriverNotificationContent(
      "dispatch_offer_created",
      {
        driver_name: "Test Driver",
        service_area_name: "Dallas Core",
        pickup_address: "100 Main St",
        destination_address: "DFW Terminal A",
        expires_at: "2026-08-01T12:01:30Z",
      },
      "https://driver.eshapp.com",
    );

    expect(content.subject).toBe("New trip offer");
    expect(content.text).toContain("Dallas Core");
    expect(content.text).toContain("Pickup: 100 Main St");
    expect(content.text).toContain("DFW Terminal A");
  });
});
