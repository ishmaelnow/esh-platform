import { expect, type Page } from "@playwright/test";
export async function verifyRatingReview(page: Page, role: "rider" | "driver") {
  const bookingId = "90000000-0000-4000-8000-000000000001";
  const trip = { bookingId, completedAt: new Date().toISOString(), pickupAddress: "TEST rating review pickup", destinationAddress: "TEST review destination", subjectName: "TEST participant",
    canSubmit: false, submittedRating: { overall: 4 }, receivedRating: { overall: 2, comment: "TEST disclosed comment" } as { overall: number; comment: string } | null };
  const rows: Array<Record<string, unknown>> = [];
  let failLoad = true, failSubmit = true;
  await page.route(`**/rest/v1/rpc/my_${role}_reputation`, (route) => route.fulfill({ json: [trip] }));
  if (role === "rider") await page.route("**/rest/v1/rpc/my_rider_portal", (route) => route.fulfill({ json: {
    tenant: { tenantId: "11111111-1111-4111-8111-111111111111", tenantSlug: "rider-preview", displayName: "TEST provider" },
    profile: { riderProfileId: "preview-rider", displayName: "TEST Rider", email: "rider-preview@example.invalid", status: "active", phone: null, accessibilityNotes: null }, serviceAreas: [],
    bookings: [{ bookingId, pickupAddress: trip.pickupAddress, destinationAddress: trip.destinationAddress, status: "completed", createdAt: trip.completedAt, driver: null, vehicle: null }],
  } }));
  else await page.route("**/rest/v1/rpc/my_driver_support_trips", (route) => route.fulfill({ json: [{ bookingId, pickupAddress: trip.pickupAddress, destinationAddress: trip.destinationAddress, status: "completed", finishedAt: trip.completedAt }] }));
  await page.route(`**/rest/v1/rpc/my_${role}_rating_appeals`, (route) => failLoad ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: rows }));
  await page.route(`**/rest/v1/rpc/submit_my_${role}_rating_appeal`, (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ target_booking_id: bookingId, reason_value: "TEST please review this received rating" });
    if (failSubmit) { failSubmit = false; return route.fulfill({ status: 503, json: {} }); }
    rows.push({ appealId: "a0000000-0000-4000-8000-000000000001", bookingId, status: "submitted", reason: "TEST please review this received rating", resolutionNotes: null, submittedAt: new Date().toISOString(), resolvedAt: null });
    return route.fulfill({ json: rows[0]!.appealId });
  });
  await page.goto(role === "rider" ? `/?view=ratings&tenant=rider-preview&booking=${bookingId}` : "/?view=recent");
  await expect(page.locator(role === "rider" ? ".trip-history" : ".documents").getByText(role === "rider" ? "Driver rated you: 2/5" : "Passenger rated you: 2/5", { exact: false })).toBeVisible();
  if (role === "rider") await expect(page.locator(".reputation-history")).toHaveCount(0);
  await page.getByText("Request rating review", { exact: true }).click();
  await page.getByLabel("Reason for review").fill("TEST please review this received rating");
  await expect(page.getByRole("button", { name: "Submit review request" })).toBeDisabled();
  failLoad = false;
  await page.getByRole("button", { name: "Refresh rating reviews" }).click();
  await expect(page.getByRole("button", { name: "Submit review request" })).toBeEnabled();
  await page.getByRole("button", { name: "Submit review request" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "could not be confirmed" })).toBeVisible();
  await expect(page.getByLabel("Reason for review")).toHaveValue("TEST please review this received rating");
  await page.getByRole("button", { name: "Submit review request" }).click();
  await expect(page.getByText("Under review", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit review request" })).toHaveCount(0);
  rows[0]!.status = "removed"; rows[0]!.resolutionNotes = "TEST this rating was removed after review"; rows[0]!.resolvedAt = new Date().toISOString(); trip.receivedRating = null;
  await page.getByRole("button", { name: "Refresh rating reviews" }).click();
  await expect(page.getByText("Rating removed", { exact: true })).toBeVisible();
  await expect(page.getByText("No received rating available yet.", { exact: false })).toHaveCount(0);
  await expect(page.getByText("TEST this rating was removed after review", { exact: true })).toBeVisible();
  await expect(page.getByText("TEST disclosed comment", { exact: false })).toHaveCount(0);
  await page.screenshot({ path: `test-results/${role}-rating-review-414.png`, fullPage: true });
  await page.reload();
  await expect(page.getByText("Rating removed", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
