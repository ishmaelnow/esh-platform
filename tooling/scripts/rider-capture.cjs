// Capture the normal, locally configured Rider app. No auth, GPS, map or fare fixtures.
const { chromium } = require("@playwright/test");
const { createInterface } = require("node:readline/promises");
const { mkdir } = require("node:fs/promises");
const path = require("node:path");

async function main() {
  const origin = process.env.RIDER_CAPTURE_URL || "http://localhost:3001";
  const url = new URL(origin);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Use the local Rider server with the new changes.");
  const output = path.resolve(__dirname, "../../test-results");
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const context = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(origin);
    console.log("Sign in inside this browser using your own Rider account. Navigate to the map home.");
    console.log("Location remains your actual browser location if you grant permission. No trip or payment will be submitted.");
    await prompt.question("Press Enter here when the real Rider home and live map are ready. ");
    await page.getByRole("button", { name: "Request ride", exact: true }).waitFor();
    await page.getByRole("region", { name: "Ride map" }).waitFor();
    if (await page.locator(".map-fallback").count()) throw new Error("Map unavailable; restore actual map access before capturing.");
    await page.screenshot({ path: path.join(output, "rider-real-home-414.png"), fullPage: false });
    await page.getByRole("button", { name: "Request ride", exact: true }).click();
    await page.getByRole("dialog", { name: "Request a ride" }).waitFor();
    await prompt.question("Review booking and wait for the live map to settle. Press Enter to capture; do not submit a booking. ");
    await page.screenshot({ path: path.join(output, "rider-real-booking-414.png"), fullPage: false });
    const options = page.locator(".booking-notes");
    if (await options.getAttribute("open") === null) await options.locator("summary").click();
    await page.getByLabel("Notes for your driver").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, "rider-real-expanded-414.png"), fullPage: false });
    console.log("Saved complete 414 × 896 home, booking and expanded screenshots under test-results/rider-real-*.png.");
  } finally {
    prompt.close();
    await browser.close();
  }
}
main().catch(() => { console.error("Capture incomplete. Check the local Rider server, configuration, sign-in and live map."); process.exitCode = 1; });
