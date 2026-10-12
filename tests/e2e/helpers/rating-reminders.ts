import { expect, type Page } from "@playwright/test";
export async function verifyRatingReminder(page: Page, product: "rider" | "driver") {
  const bookingId = "90000000-0000-4000-8000-000000000001";
  const otherId = "90000000-0000-4000-8000-000000000002";
  const trips = [otherId, bookingId].map((id) => ({ bookingId: id, completedAt: new Date().toISOString(),
    pickupAddress: `TEST pickup ${id}`, destinationAddress: "TEST destination", subjectName: "TEST participant",
    canSubmit: true, submittedRating: null as { overall: number } | null, receivedRating: null }));
  let submitted: Record<string, unknown> | null = null;
  let fail = true;
  await page.route(`**/rest/v1/rpc/my_${product}_reputation`, (route) => route.fulfill({ json: trips }));
  await page.route(`**/rest/v1/rpc/submit_my_${product}_trip_rating`, (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    if (fail) { fail = false; return route.fulfill({ status: 503, json: { message: "TEST rating unavailable" } }); }
    trips[1]!.submittedRating = { overall: 4 }; trips[1]!.canSubmit = false;
    return route.fulfill({ json: "TEST rating ID" });
  });
  const tenant = product === "rider" ? "rider-preview" : "driver-preview";
  await page.goto(`/?view=ratings&tenant=${tenant}&booking=${bookingId}`);
  const card = page.locator(`#rating-${bookingId}`);
  await expect(card).toBeVisible();
  await expect(card).toBeFocused();
  await card.getByRole("radio", { name: "4 stars", exact: true }).check();
  await card.getByLabel("Optional comment").fill("TEST optional feedback");
  await card.getByRole("button", { name: "Submit private rating" }).click();
  await expect(card.getByLabel("Optional comment")).toHaveValue("TEST optional feedback");
  await expect(card.getByRole("button", { name: "Submit private rating" })).toBeEnabled();
  await card.getByRole("button", { name: "Submit private rating" }).click();
  await expect(page.getByText("You already rated this trip. Thank you.")).toBeVisible();
  expect(submitted).toMatchObject({ target_booking_id: bookingId, overall_rating_value: 4, comment_value: "TEST optional feedback" });
  await page.screenshot({ path: `test-results/${product}-rating-reminder-414.png`, fullPage: true });
  await page.goto(`/?view=ratings&tenant=${tenant}&booking=90000000-0000-4000-8000-000000000099`);
  await expect(page.getByText("This rating is unavailable for this account. Refresh your trips to check again.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  trips[0]!.canSubmit = false;
  await page.goto(`/?view=ratings&tenant=${tenant}&booking=${otherId}`);
  await expect(page.getByText("The rating window for this trip has closed.").first()).toBeVisible();
  await expect(page.locator(`#rating-${otherId}`).getByRole("button", { name: "Submit private rating" })).toHaveCount(0);
}
