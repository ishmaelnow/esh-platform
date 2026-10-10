import { expect, type Page } from "@playwright/test";

export async function photoFixture(page: Page) {
  let mode: "image" | "missing" | "broken" = "image";
  let requests = 0;
  await page.route("**/api/trips/photo?*", (route) => {
    requests++;
    expect(route.request().headers().authorization).toContain("Bearer ");
    return route.fulfill({ json: { url: mode === "missing" ? null : `https://photo-fixture.invalid/${mode}` } });
  });
  await page.route("https://photo-fixture.invalid/**", (route) => route.request().url().endsWith("broken")
    ? route.fulfill({ status: 404 }) : route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="160"><rect width="80" height="160" fill="#eef2f7"/><ellipse cx="40" cy="39" rx="21" ry="25" fill="#d6a479"/><path d="M19 34Q18 8 40 10Q63 8 61 34Q48 20 19 34" fill="#153258"/><circle cx="32" cy="38" r="2"/><circle cx="48" cy="38" r="2"/><path d="M32 49Q40 55 48 49" fill="none" stroke="#153258" stroke-width="2"/><path d="M6 160V92Q8 70 40 70Q72 70 74 92V160" fill="#153258"/></svg>' }));
  return {
    mode: (value: typeof mode) => { mode = value; }, requests: () => requests,
    verify: async (name: string, screenshot: string, size = 36) => {
      const avatar = page.locator(".trip-participant").filter({ hasText: name });
      await expect(avatar).toBeVisible();
      await expect(avatar.locator("img")).toBeVisible();
      await expect.poll(() => avatar.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      expect(await avatar.locator(".trip-participant-avatar").evaluate((el) => el.getBoundingClientRect().width)).toBe(size);
      expect(await avatar.locator("img").evaluate((el) => el.getBoundingClientRect().height)).toBe(size);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/${screenshot}`, fullPage: true });
    },
  };
}
