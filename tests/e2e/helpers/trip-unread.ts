import { expect, type Page } from "@playwright/test";
export async function verifyUnreadSupport(page: Page, role: "rider" | "driver") {
  const bookingId = "90000000-0000-4000-8000-000000000002";
  const first = "a0000000-0000-4000-8000-000000000001", second = "b0000000-0000-4000-8000-000000000002";
  const unread = new Set([first, second]);
  const marks: { case_value: string; version_value: number }[] = [];
  let fail = true;
  await page.route("**/rest/v1/rpc/my_trip_attention", (route) => route.fulfill({
    json: [...unread].map((itemId) => ({ kind: "support", bookingId, itemId, count: 1 })),
  }));
  await page.route(`**/rest/v1/rpc/${role === "rider" ? "my_trip_support" : "my_driver_trip_support"}`, (route) => route.fulfill({
    json: [first, second].map((caseId) => ({ caseId, bookingId, category: caseId === first ? "trip_issue" : "lost_item",
      description: "TEST private report", response: "TEST company reply", status: "resolved", version: 2,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      updates: [{ status: "resolved", response: "TEST company reply", createdAt: new Date().toISOString() }] })),
  }));
  await page.route("**/rest/v1/rpc/mark_my_trip_support_read", (route) => {
    const args = route.request().postDataJSON() as { case_value: string; version_value: number; role_value: string };
    expect(args.role_value).toBe(role); marks.push(args);
    if (fail) return route.fulfill({ status: 503, json: { message: "PRIVATE failure" } });
    unread.delete(args.case_value); return route.fulfill({ json: true });
  });
  await page.reload();
  const menu = page.getByRole("button", { name: `Open ${role === "rider" ? "rider" : "driver"} menu` });
  await expect(menu.locator(".trip-unread-badge")).toHaveText("2");
  await expect(menu.locator(".trip-unread-badge")).toHaveCSS("font-size", "11px");
  await menu.click();
  await page.getByRole("button", { name: role === "rider" ? /^Trips/ : /^Recent orders/ }).click();
  const updates = page.getByRole("region", { name: "Unread support responses" });
  await expect(updates.getByRole("button")).toHaveCount(2);
  expect(marks).toEqual([]);
  await page.screenshot({ path: `test-results/${role}-unread-414.png`, fullPage: true });
  await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }));
  await updates.getByRole("button").first().click();
  const support = page.locator(".trip-support").first();
  await support.locator(".trip-read-marker").scrollIntoViewIfNeeded();
  await expect(support.getByText("TEST company reply", { exact: true })).toBeVisible();
  expect(marks).toEqual([]);
  await page.evaluate(() => { Reflect.deleteProperty(document, "visibilityState"); document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(() => marks.length).toBe(1);
  await expect(page.getByText("Read status could not be saved.", { exact: false })).toBeVisible();
  await expect(updates.getByRole("button")).toHaveCount(2);
  expect(marks[0]?.case_value).toBe(first);
  expect(marks[0]?.version_value).toBe(2);
  fail = false;
  await page.getByRole("button", { name: "Close report", exact: true }).click();
  await updates.getByRole("button").first().click();
  await support.locator(".trip-read-marker").scrollIntoViewIfNeeded();
  await expect(updates.getByRole("button")).toHaveCount(1);
  expect(unread.has(second)).toBe(true);
  await page.setViewportSize({ width: 414, height: 520 });
  await support.getByRole("button", { name: "Refresh reports" }).scrollIntoViewIfNeeded();
  await expect(support.getByRole("button", { name: "Refresh reports" })).toBeInViewport();
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.locator(role === "rider" ? ".donut-toggle .trip-unread-badge" : ".driver-menu-toggle .trip-unread-badge")).toHaveText("1");
}
