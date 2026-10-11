import { describe, expect, it } from "vitest";
import { ratingUrl, readRatingLink, readRatingTap } from "./rating-link";
const bookingId = "90000000-0000-4000-8000-000000000001";
describe("owned rating routing hints", () => {
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
