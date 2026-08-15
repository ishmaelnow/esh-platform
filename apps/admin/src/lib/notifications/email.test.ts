import { describe, expect, it } from "vitest";
import { buildDriverNotificationContent, buildRiderNotificationContent } from "./email";

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

  it("builds a Driver transfer notice with an Earnings deep link", () => {
    const content = buildDriverNotificationContent("driver_transfer_succeeded", {
      driver_name: "Test Driver", amount_minor: 4105, currency_code: "USD",
    }, "https://driver.eshapp.com");
    expect(content.subject).toContain("transferred");
    expect(content.text).toContain("$41.05");
    expect(content.text).toContain("view=earnings");
  });

  it("builds a failed bank payout notice with its reason", () => {
    const content = buildDriverNotificationContent("driver_bank_payout_failed", {
      driver_name: "Test Driver", amount_minor: 4105, currency_code: "USD",
      failure_message: "Bank account closed",
    }, "https://driver.eshapp.com");
    expect(content.subject).toContain("Action needed");
    expect(content.text).toContain("Bank account closed");
  });
});

describe("rider notification email content", () => {
  it("includes accepted driver details and a tenant-scoped Rider link", () => {
    const content = buildRiderNotificationContent(
      "rider_driver_accepted",
      {
        rider_name: "Manual Test Rider",
        tenant_slug: "dallas-rides",
        pickup_address: "100 Main St",
        destination_address: "DFW Terminal A",
        driver_name: "Test Driver",
        driver_number: "334525",
        vehicle_description: "Black 2025 Toyota Sienna · ABC1234",
      },
      "https://rider.eshapp.com",
    );

    expect(content.subject).toBe("Your driver accepted the trip");
    expect(content.text).toContain("Test Driver (#334525)");
    expect(content.text).toContain("Black 2025 Toyota Sienna");
    expect(content.text).toContain("https://rider.eshapp.com/?tenant=dallas-rides");
  });

  it("does not disclose driver details in a booking receipt", () => {
    const content = buildRiderNotificationContent(
      "rider_booking_created",
      {
        rider_name: "Manual Test Rider",
        pickup_address: "100 Main St",
        destination_address: "DFW Terminal A",
      },
      "https://rider.eshapp.com",
    );

    expect(content.subject).toBe("Your trip request was received");
    expect(content.text).not.toContain("Driver:");
    expect(content.text).toContain("Pickup: 100 Main St");
  });

  it("rejects unknown rider notification types", () => {
    expect(() =>
      buildRiderNotificationContent("rider_unknown", {}, "https://rider.eshapp.com"),
    ).toThrow("Unsupported rider notification type.");
  });

  it("builds a tenant-time-zone scheduled trip confirmation", () => {
    const content = buildRiderNotificationContent(
      "rider_booking_scheduled",
      {
        rider_name: "Scheduled Rider",
        scheduled_pickup_at: "2026-08-02T15:30:00.000Z",
        tenant_time_zone: "America/Chicago",
      },
      "https://rider.eshapp.com",
    );
    expect(content.subject).toBe("Your scheduled trip is confirmed");
    expect(content.text).toContain("10:30 AM");
    expect(content.text).toContain("America/Chicago");
  });

  it("builds a Rider refund notice with a Payments deep link", () => {
    const content = buildRiderNotificationContent("rider_refund_succeeded", {
      rider_name: "Test Rider", tenant_slug: "philadelphia", amount_minor: 1059,
      currency_code: "USD",
    }, "https://rider.eshapp.com");
    expect(content.subject).toContain("refund");
    expect(content.text).toContain("$10.59");
    expect(content.text).toContain("view=payments");
  });

  it("builds a recurring autopay success notice with the tenant-local pickup", () => {
    const content = buildRiderNotificationContent("rider_recurring_autopay_succeeded", {
      rider_name: "Repeat Rider", tenant_slug: "philadelphia",
      scheduled_pickup_at: "2026-08-16T00:40:00.000Z", tenant_time_zone: "America/New_York",
      pickup_address: "1200 Sansom Street", destination_address: "237 McClellan Street",
    }, "https://rider.eshapp.com");
    expect(content.subject).toContain("paid and scheduled");
    expect(content.text).toContain("8:40 PM");
    expect(content.text).toContain("view=payments");
  });

  it("builds an actionable recurring autopay failure notice", () => {
    const content = buildRiderNotificationContent("rider_recurring_autopay_failed", {
      rider_name: "Repeat Rider", tenant_slug: "philadelphia",
      scheduled_pickup_at: "2026-08-16T00:40:00.000Z", tenant_time_zone: "America/New_York",
    }, "https://rider.eshapp.com");
    expect(content.subject).toContain("Action needed");
    expect(content.text).toContain("pay manually");
  });
});
