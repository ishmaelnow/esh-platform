import { expect, it } from "vitest";
import { readDriverSupportLink, readDriverSupportTap } from "./support-link";
const target = { bookingId: "90000000-0000-4000-8000-000000000001", caseId: "a0000000-0000-4000-8000-000000000001", tenantSlug: "test-company" };
it("accepts only fixed Driver routes and valid report identifiers", () => {
  const url = `https://driver.eshapp.com/?tenant=test-company&view=recent&booking=${target.bookingId}&support=${target.caseId}`;
  expect(readDriverSupportLink(url, "https://driver.eshapp.com")).toEqual(target);
  expect(readDriverSupportLink(url.replace("driver.eshapp.com", "evil.invalid"), "https://driver.eshapp.com")).toBeNull();
  expect(readDriverSupportLink(url.replace("/?", "/other?"), "https://driver.eshapp.com")).toBeNull();
  expect(readDriverSupportLink("bad url", "https://driver.eshapp.com")).toBeNull();
  expect(readDriverSupportTap({ ...target, product: "driver", notificationType: "driver_support_update" })).toEqual(target);
  for (const invalid of [{ product: "rider" }, { caseId: "bad" }, { bookingId: null }, { tenantSlug: "https://evil.invalid" }, { notificationType: "other" }])
    expect(readDriverSupportTap({ ...target, product: "driver", notificationType: "driver_support_update", ...invalid })).toBeNull();
});
