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
    ? route.fulfill({ status: 404 }) : route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#153258"/></svg>' }));
  return {
    mode: (value: typeof mode) => { mode = value; }, requests: () => requests,
    verify: async (name: string, screenshot: string) => {
      const avatar = page.locator(".trip-participant").filter({ hasText: name });
      await expect(avatar).toBeVisible();
      await expect(avatar.locator("img")).toBeVisible();
      await expect.poll(() => avatar.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      expect(await avatar.locator(".trip-participant-avatar").evaluate((el) => el.getBoundingClientRect().width)).toBe(36);
      expect(await avatar.locator("img").evaluate((el) => el.getBoundingClientRect().height)).toBe(36);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/${screenshot}`, fullPage: true });
    },
  };
}
