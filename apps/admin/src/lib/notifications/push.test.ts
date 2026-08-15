import { describe, expect, it } from "vitest";
import type { AdminServerConfig } from "@/lib/config";
import { buildPrivacySafePush } from "./push";

const config = { redirects: { riderAppUrl: "https://rider.eshapp.com",
  driverAppUrl: "https://driver.eshapp.com" } } as AdminServerConfig;

describe("privacy-safe web push", () => {
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
