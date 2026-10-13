import { describe, expect, it } from "vitest";
import { ratingUrl, readRatingLink, readRatingTap } from "./rating-link";
const bookingId = "90000000-0000-4000-8000-000000000001";
describe("owned rating routing hints", () => {
  it("routes disclosed ratings and decisions to their trip without submission intent", () => {
    for (const product of ["rider", "driver"] as const) for (const [suffix, intent] of [["received", "received"], ["reviewed", "review"]] as const) {
      const notificationType = `${product}_rating_${suffix}`;
      const data = { product, notificationType, bookingId, tenantSlug: "test-company" };
      expect(readRatingTap(data, product)).toEqual({ bookingId, tenantSlug: "test-company", intent });
      const origin = `https://${product}.eshapp.com`;
      expect(readRatingLink(ratingUrl(origin, data), origin)).toEqual({ bookingId, tenantSlug: "test-company", intent });
      expect(readRatingTap(data, product === "rider" ? "driver" : "rider")).toBeNull();
    }
    expect(readRatingLink(`https://rider.eshapp.com/?view=ratings&booking=${bookingId}&tenant=test&rating=evil`, "https://rider.eshapp.com")).toBeNull();
  });
  it("round trips only known-origin links with validated trip and tenant", () => {
    const url = ratingUrl("https://rider.eshapp.com", { booking_id: bookingId, tenant_slug: "test-company", url: "https://evil.invalid" });
    expect(readRatingLink(url, "https://rider.eshapp.com")).toEqual({ bookingId, tenantSlug: "test-company" });
    expect(readRatingLink(url, "https://driver.eshapp.com")).toBeNull();
    expect(readRatingLink("https://rider.eshapp.com/?view=ratings&booking=bad&tenant=test", "https://rider.eshapp.com")).toBeNull();
  });
  it("rejects another product or notification type and arbitrary target fields", () => {
    const value = { product: "rider", notificationType: "rider_rating_reminder", bookingId, tenantSlug: "test-company" };
    expect(readRatingTap(value, "rider")).toEqual({ bookingId, tenantSlug: "test-company" });
    expect(readRatingTap(value, "driver")).toBeNull();
    expect(readRatingTap({ ...value, bookingId: "../foreign" }, "rider")).toBeNull();
    expect(readRatingTap({ ...value, notificationType: "rider_support_update" }, "rider")).toBeNull();
  });
});
