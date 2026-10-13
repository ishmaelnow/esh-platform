import { expect, test } from "@playwright/test";
const token = "A".repeat(43);
test.use({ viewport: { width: 414, height: 896 } });
test("recipient needs no login, clears stale location and recovers network errors without exposing a secret URL", async ({ page }) => {
  let status = 200;
  const value = { status: "accepted", expiresAt: new Date(Date.now()+3600_000).toISOString(),
    location: { latitude: 40, longitude: -75, recordedAt: new Date().toISOString() } as { latitude: number; longitude: number; recordedAt: string } | null };
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.route("https://api.mapbox.com/**", (route) => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#f7f7f2" } }] } }));
  await page.route("**/api/trips/shared", (route) => {
    expect(route.request().method()).toBe("POST"); expect(route.request().postDataJSON()).toEqual({ token });
    return route.fulfill({ status, json: status === 200 ? value : { message: "TEST unavailable" } });
  });
  await page.goto(`/share-trip#token=${token}`);
  await expect(page.getByRole("heading", { name: "Driver heading to pickup" })).toBeVisible();
  await expect(page.getByText("Live shared driver location", { exact: true })).toBeVisible();
  await expect(page.locator(".rider-map-canvas")).toHaveAttribute("data-map-ready", "true");
  const map = await page.locator(".shared-trip-map").boundingBox();
  const heading = await page.getByRole("heading", { name: "ESH shared trip" }).boundingBox();
  expect(map!.y).toBeGreaterThan(heading!.y + heading!.height);
  await expect(page.getByRole("heading", { name: "ESH shared trip" })).toBeInViewport();
  await page.screenshot({ path: "test-results/rider-shared-trip-414.png", fullPage: true });
  expect(requests.every((url) => !url.includes(token))).toBe(true);
  value.location!.recordedAt = new Date(Date.now()-61_000).toISOString();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText("Driver location is unavailable. Trip status will continue to update.")).toBeVisible();
  await expect(page.locator(".shared-trip-map")).toHaveCount(0);
  status = 503; await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText("Trip updates are temporarily unavailable. Check your connection and retry.")).toBeVisible();
  status = 200; value.status = "in_progress"; value.location = null;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("heading", { name: "Trip underway" })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  status = 404; await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText("This trip link has ended, expired or been stopped.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trip underway" })).toHaveCount(0);
});
test("invalid link does not call the private lookup", async ({ page }) => {
  let calls = 0; await page.route("**/api/trips/shared", (route) => { calls++; return route.fulfill({ status: 404 }); });
  await page.goto("/share-trip#token=invalid");
  await expect(page.getByText("This trip link is unavailable.")).toBeVisible(); expect(calls).toBe(0);
});
