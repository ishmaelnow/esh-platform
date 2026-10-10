import { describe, expect, it } from "vitest";
import type { AdminServerConfig } from "@/lib/config";
import { buildPrivacySafePush } from "./push";

const config = { redirects: { riderAppUrl: "https://rider.eshapp.com",
  driverAppUrl: "https://driver.eshapp.com" } } as AdminServerConfig;

describe("privacy-safe web push", () => {
  it("routes messages without exposing private text or arbitrary URLs", () => {
    for (const role of ["rider", "driver"]) {
      const alert = buildPrivacySafePush(`${role}_trip_message`, { body: "PRIVATE TEXT", url: "https://evil.invalid" }, config);
      expect(alert.body).toBe("You have a new trip message. Open ESH to read it.");
      expect(alert.url).toContain(role === "rider" ? "view=trips" : "view=dispatch");
      expect(JSON.stringify(alert)).not.toContain("PRIVATE");
      expect(JSON.stringify(alert)).not.toContain("evil.invalid");
    }
  });
  it("routes preorder alerts to the known Driver view without private trip details", () => {
    const alert = buildPrivacySafePush("driver_preorder_available", { pickup_address: "PRIVATE ADDRESS", url: "https://evil.invalid" }, config);
    expect(alert.url).toBe("https://driver.eshapp.com/?view=preorders");
    expect(JSON.stringify(alert)).not.toContain("PRIVATE");
    expect(JSON.stringify(alert)).not.toContain("evil.invalid");
  });
  it("routes Rider alerts without exposing addresses or payment details", () => {
    const push = buildPrivacySafePush("rider_recurring_autopay_failed", {
      tenant_slug: "philadelphia", pickup_address: "Private pickup",
      destination_address: "Private destination", amount_minor: 4836,
    }, config);
    expect(push.body).toContain("needs your attention");
    expect(push.url).toContain("tenant=philadelphia");
    expect(JSON.stringify(push)).not.toContain("Private pickup");
    expect(JSON.stringify(push)).not.toContain("4836");
  });

  it("routes Driver offers without exposing Rider trip data", () => {
    const push = buildPrivacySafePush("dispatch_offer_created", {
      customer_name: "Private Rider", pickup_address: "Private pickup",
    }, config);
    expect(push.body).toBe("You have a new trip offer.");
    expect(push.url).toBe("https://driver.eshapp.com/");
    expect(JSON.stringify(push)).not.toContain("Private Rider");
  });
});
