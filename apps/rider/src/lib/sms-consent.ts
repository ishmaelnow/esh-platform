export const RIDER_SMS_DISCLOSURE_VERSION = "fair_fare_esh_operational_sms_v1";
export const FAIR_FARE_PRIVACY_POLICY_URL = "https://fairfareride.com/privacy-policy";

export type RiderSmsConsentStatus = "not_consented" | "consented_unverified" | "active" | "disabled";

export type RiderSmsSettings = {
  enabled: boolean;
  deliveryEnabled: boolean;
  consented: boolean;
  phoneE164: string | null;
  maskedPhone: string | null;
  status: RiderSmsConsentStatus;
  consentedAt: string | null;
  verifiedAt: string | null;
  disabledAt: string | null;
  consentSource: string | null;
  disclosureVersion: string | null;
};

export const EMPTY_RIDER_SMS_SETTINGS: RiderSmsSettings = {
  enabled: false,
  deliveryEnabled: false,
  consented: false,
  phoneE164: null,
  maskedPhone: null,
  status: "not_consented",
  consentedAt: null,
  verifiedAt: null,
  disabledAt: null,
  consentSource: null,
  disclosureVersion: null,
};

export function normalizeE164(value: string) {
  const normalized = value.replace(/[\s().-]/g, "");
  if (!/^\+[1-9][0-9]{7,14}$/.test(normalized)) {
    throw new Error("Enter a mobile number in international format, such as +12155550123.");
  }
  return normalized;
}

export function smsConsentStatusMessage(settings: RiderSmsSettings) {
  if (settings.status === "active") return `SMS consent recorded and ${settings.maskedPhone ?? "your phone"} is verified for service messages.`;
  if (settings.status === "consented_unverified") return "SMS consent recorded. Text delivery remains off until the mobile number is verified.";
  if (settings.status === "disabled") return "SMS consent withdrawn. Text delivery is off.";
  return "SMS consent has not been granted. Saving a phone number does not turn on text messages.";
}
