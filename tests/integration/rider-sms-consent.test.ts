import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260826000100_rider_sms_consent_foundation.sql",
  "utf8",
);
const withdrawalFix = readFileSync(
  "supabase/migrations/20260826000200_fix_rider_sms_withdrawal.sql",
  "utf8",
);
const riderPage = readFileSync("apps/rider/src/app/page.tsx", "utf8");
const riderSmsRoute = readFileSync("apps/rider/src/app/api/notifications/sms/route.ts", "utf8");

describe("Rider SMS consent foundation", () => {
  test("records current state and append-only consent evidence", () => {
    expect(migration).toContain("create table public.sms_consent_events");
    expect(migration).toContain("SMS consent history is append-only");
    expect(migration).toContain("consent_source");
    expect(migration).toContain("disclosure_version");
    expect(migration).toContain("fair_fare_esh_operational_sms_v1");
  });

  test("does not infer consent from saving a phone", () => {
    expect(migration).toContain("phone_saved_without_consent");
    expect(migration).toContain("sms_consent_value boolean");
    expect(migration).toContain("'delivery_enabled', saved.status = 'active'");
    expect(migration).toContain("status = 'consented_unverified'");
    expect(migration).toContain("Withdraw consent for the current number before saving a different number");
  });

  test("validates a disabled withdrawal row before conflict update", () => {
    expect(withdrawalFix).toContain("case when next_status in ('disabled', 'active') then existing.consented_at");
    expect(withdrawalFix).toContain("next_status = 'disabled'");
  });

  test("requires consent before Rider verification and delivery", () => {
    expect(migration).toContain("Explicit SMS consent for this phone is required before verification");
    expect(migration).toContain("existing.status = 'consented_unverified'");
    expect(migration).toContain("subscription.status = 'active'");
    expect(riderSmsRoute).toContain('consent.status !== "consented_unverified"');
    expect(riderSmsRoute).toContain("Save explicit SMS consent for this mobile number");
    expect(riderSmsRoute.indexOf("my_rider_sms_notification_settings")).toBeLessThan(
      riderSmsRoute.indexOf("requestTwilioVerification(phone)"),
    );
  });

  test("keeps the established Driver SMS path compatible", () => {
    expect(migration).toContain("create or replace function public.confirm_driver_sms_subscription_internal");
    expect(migration).toContain("'driver_verified_sms_flow'");
  });

  test("presents the required voluntary disclosure without invoking SMS delivery", () => {
    expect(riderPage).toContain("FAIR FARE COMPANY LLC");
    expect(riderPage).toContain("Msg and data rates may apply");
    expect(riderPage).toContain("Reply HELP for help or STOP to opt out");
    expect(riderPage).toContain("smsConsentChecked");
    expect(riderPage).toContain('supabase.rpc("save_my_rider_sms_consent"');
    expect(riderPage).not.toContain('fetch("/api/notifications/sms"');
    expect(riderPage).toContain('nextSettings.status === "disabled"');
    expect(riderPage).toContain("smsConsentEditing.current");
  });
});
