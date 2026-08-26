import { describe, expect, it } from "vitest";
import {
  EMPTY_RIDER_SMS_SETTINGS,
  FAIR_FARE_PRIVACY_POLICY_URL,
  RIDER_SMS_DISCLOSURE_VERSION,
  normalizeE164,
  smsConsentStatusMessage,
} from "./sms-consent";

describe("Rider SMS consent", () => {
  it("defaults to no consent and no delivery", () => {
    expect(EMPTY_RIDER_SMS_SETTINGS.consented).toBe(false);
    expect(EMPTY_RIDER_SMS_SETTINGS.deliveryEnabled).toBe(false);
    expect(EMPTY_RIDER_SMS_SETTINGS.status).toBe("not_consented");
  });

  it("uses the approved disclosure contract", () => {
    expect(RIDER_SMS_DISCLOSURE_VERSION).toBe("fair_fare_esh_operational_sms_v1");
    expect(FAIR_FARE_PRIVACY_POLICY_URL).toBe("https://fairfareride.com/privacy-policy");
  });

  it("normalizes an international mobile number", () => {
    expect(normalizeE164("+1 (215) 555-0123")).toBe("+12155550123");
    expect(() => normalizeE164("215-555-0123")).toThrow(/international format/);
  });

  it("keeps consent distinct from delivery verification", () => {
    expect(smsConsentStatusMessage({
      ...EMPTY_RIDER_SMS_SETTINGS,
      consented: true,
      status: "consented_unverified",
      consentedAt: "2026-08-26T12:00:00Z",
    })).toContain("delivery remains off");
  });
});
