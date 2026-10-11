import { expect, it } from "vitest";
import { readSupportLink, readSupportTap } from "./support-link";
const target = { bookingId: "90000000-0000-4000-8000-000000000001", caseId: "a0000000-0000-4000-8000-000000000001", tenantSlug: "test-company" };
it("accepts only fixed Rider routes and valid report identifiers", () => {
  const url = `https://rider.eshapp.com/?tenant=test-company&view=trips&booking=${target.bookingId}&support=${target.caseId}`;
  expect(readSupportLink(url, "https://rider.eshapp.com")).toEqual(target);
  expect(readSupportLink(url.replace("rider.eshapp.com", "evil.invalid"), "https://rider.eshapp.com")).toBeNull();
  expect(readSupportLink(url.replace("/?", "/other?"), "https://rider.eshapp.com")).toBeNull();
  expect(readSupportLink("bad url", "https://rider.eshapp.com")).toBeNull();
  expect(readSupportTap({ ...target, product: "rider", notificationType: "rider_support_update" })).toEqual(target);
  for (const invalid of [{ product: "driver" }, { caseId: "bad" }, { bookingId: null }, { tenantSlug: "https://evil.invalid" }, { notificationType: "other" }])
    expect(readSupportTap({ ...target, product: "rider", notificationType: "rider_support_update", ...invalid })).toBeNull();
});
