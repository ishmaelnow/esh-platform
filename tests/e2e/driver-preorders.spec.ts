import { expect, test, type Page } from "@playwright/test";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { setupDriverPreview } = require("../fixtures/driver-preview.cjs") as { setupDriverPreview: (page: Page) => Promise<void> };
test("preorders reserve/release, preserve availability, persist settings and recover failed changes at 414 x 896", async ({ page }) => {
  await page.setViewportSize({ width: 414, height: 896 });
  await setupDriverPreview(page);
  const card = { bookingId: "preview-preorder", scheduledPickupAt: new Date(Date.now() + 172800000).toISOString(),
    dispatchReadyAt: new Date(Date.now() + 171000000).toISOString(), serviceAreaName: "Preview area", fareAmountMinor: 2500, fareCurrencyCode: "USD" };
  let offline = false; let reserved = false; let fail = false;
  const writes: string[] = [];
  await page.route("**/rest/v1/rpc/*", async (route) => {
    const rpc = new URL(route.request().url()).pathname.split("/").pop()!;
    if (rpc === "my_driver_preorders") return route.fulfill({ json: { receiveWhileOffline: offline, timeZone: "America/Chicago",
      assignedCount: reserved ? 1 : 0, newCount: reserved ? 0 : 1,
      assigned: reserved ? [{ ...card, reservationId: "preview-reservation", pickupAddress: "Private test pickup", destinationAddress: "Private test destination" }] : [],
      new: reserved ? [] : [card] } });
    if (["set_my_driver_preorder_settings", "reserve_my_driver_preorder", "release_my_driver_preorder"].includes(rpc)) {
      writes.push(rpc);
      if (fail) return route.fulfill({ status: 409, json: { message: "Another Driver reserved this preorder" } });
      if (rpc === "set_my_driver_preorder_settings") offline = route.request().postDataJSON().enabled_value as boolean;
      else reserved = rpc === "reserve_my_driver_preorder";
      return route.fulfill({ json: rpc === "reserve_my_driver_preorder" ? "preview-reservation" : true });
    }
    return route.fallback();
  });
  await page.goto("/");
  await expect(page.getByRole("switch", { name: "Driver availability" })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: /Preorders/ }).click();
  await page.getByRole("tab", { name: "New 1" }).click();
  await expect(page.getByText("Private test pickup")).toHaveCount(0);
  await expect(page.getByText("Trip fare: $25.00", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/driver-preorders-new-414.png", fullPage: true });
  await page.getByRole("button", { name: "Reserve trip" }).click();
  await page.getByRole("tab", { name: "Assigned to me 1" }).click();
  await expect(page.getByText("Private test pickup", { exact: false })).toBeVisible();
  await page.screenshot({ path: "test-results/driver-preorders-assigned-414.png", fullPage: true });
  await page.getByRole("switch", { name: "Receive while offline" }).click();
  await expect(page.getByRole("switch", { name: "Receive while offline" })).toBeChecked();
  await page.reload();
  await page.getByRole("button", { name: /Preorders/ }).click();
  await expect(page.getByRole("switch", { name: "Receive while offline" })).toBeChecked();
  await page.getByRole("button", { name: "Release reservation" }).click();
  await expect(page.getByRole("tab", { name: "Assigned to me 0" })).toBeVisible();
  await page.getByRole("tab", { name: "New 1" }).click();
  fail = true;
  await page.getByRole("button", { name: "Reserve trip" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Another Driver reserved this preorder" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Assigned to me 0" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Reserve trip" }).click();
  await expect(page.getByRole("tab", { name: "Assigned to me 1" })).toBeVisible();
  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(page.getByRole("switch", { name: "Driver availability" })).toHaveAttribute("aria-checked", "false");
  expect(writes).toEqual(["reserve_my_driver_preorder", "set_my_driver_preorder_settings", "release_my_driver_preorder", "reserve_my_driver_preorder", "reserve_my_driver_preorder"]);
});
