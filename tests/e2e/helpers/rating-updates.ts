import { expect, type Page } from "@playwright/test";

export async function verifyRatingUpdates(page: Page, product: "rider" | "driver") {
  const bookingId = "90000000-0000-4000-8000-000000000001";
  const otherId = "90000000-0000-4000-8000-000000000002";
  const tenant = `${product}-preview`;
  const trips = [otherId, bookingId].map((id) => ({ bookingId: id, completedAt: new Date().toISOString(),
    pickupAddress: id === bookingId ? "TEST notified trip pickup" : "TEST other trip pickup", destinationAddress: "TEST destination",
    subjectName: "TEST participant", canSubmit: false, submittedRating: { overall: 4 },
    receivedRating: { overall: 3, comment: "TEST disclosed received rating" } as { overall: number; comment: string } | null }));
  let rows: Array<Record<string, unknown>> = [];
  await page.route(`**/rest/v1/rpc/my_${product}_reputation`, (route) => route.fulfill({ json: trips }));
  await page.route(`**/rest/v1/rpc/my_${product}_rating_appeals`, (route) => route.fulfill({ json: rows }));
  await page.goto(`/?view=ratings&tenant=${tenant}&booking=${bookingId}&rating=received`);
  const card = page.locator(`#rating-details-${bookingId}`);
  await expect(card).toBeFocused();
  await expect(card).toContainText("TEST notified trip pickup");
  await expect(card).toContainText("TEST disclosed received rating");
  await expect(page.getByText("You already rated this trip. Thank you.")).toHaveCount(0);
  await expect(page.locator(`#rating-details-${otherId}`)).not.toBeFocused();
  await page.screenshot({ path: `test-results/${product}-rating-received-414.png`, fullPage: true });
  rows = [{ appealId: "a0000000-0000-4000-8000-000000000001", bookingId, status: "removed",
    reason: "TEST review this rating", resolutionNotes: "TEST company decision for this trip",
    submittedAt: new Date().toISOString(), resolvedAt: new Date().toISOString() }];
  trips[1]!.receivedRating = null;
  await page.goto(`/?view=ratings&tenant=${tenant}&booking=${bookingId}&rating=review`);
  await expect(card).toBeFocused();
  await expect(card).toContainText("Rating removed");
  await expect(card).toContainText("TEST company decision for this trip");
  await expect(card).not.toContainText("TEST disclosed received rating");
  await expect(page.getByText("You already rated this trip. Thank you.")).toHaveCount(0);
  await page.screenshot({ path: `test-results/${product}-rating-decision-414.png`, fullPage: true });
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto(`/?view=ratings&tenant=${tenant}&booking=90000000-0000-4000-8000-000000000099&rating=review`);
  await expect(page.getByText("This rating is unavailable for this account. Refresh your trips to check again.")).toBeVisible();
  await expect(card).not.toBeFocused();
}
