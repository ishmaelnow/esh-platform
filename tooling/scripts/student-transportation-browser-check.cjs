// Checks the built, closed product shell only; no user data or production services.
const { chromium } = require("@playwright/test");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
async function main() {
  const origin = "http://127.0.0.1:3006";
  const child = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3006"],
    {
      cwd: path.resolve(__dirname, "../../apps/student-transportation"),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let failure = "";
  child.stderr.on("data", (data) => {
    failure += data.toString();
  });
  child.stdout.resume();
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (child.exitCode !== null) throw new Error(`Shell server exited: ${failure}`);
      try {
        ready = (await fetch(origin)).ok;
      } catch {
        /* server starting */
      }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, "Local shell did not start");
    browser = await chromium.launch();
    const page = await browser.newPage();
    const external = [];
    page.on("request", (request) => {
      if (!request.url().startsWith(origin)) external.push(request.url());
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const evidence = path.resolve(__dirname, "../../tmp/student-transportation-evidence");
    await fs.mkdir(evidence, { recursive: true });
    for (const viewport of [
      { width: 414, height: 896 },
      { width: 320, height: 740 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      for (const route of ["/", "/guardian", "/school", "/operator", "/admin"]) {
        const response = await page.goto(origin + route);
        assert.equal(response.status(), 200);
        await page.getByRole("heading", { name: "Not open for bookings yet" }).waitFor();
        assert.equal(await page.locator("input, textarea, select, form").count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({
          path: path.join(
            evidence,
            `${viewport.width}-${route === "/" ? "home" : route.slice(1)}.png`,
          ),
          fullPage: true,
        });
      }
    }
    await page.goto(origin);
    await page.getByRole("link", { name: "Schools" }).click();
    await page.getByRole("heading", { name: "For schools" }).waitFor();
    await page.getByRole("link", { name: "← Home", exact: true }).click();
    await page.getByRole("heading", { name: "School journeys, thoughtfully planned" }).waitFor();
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    console.log(
      "PASS 15 rendered screen/viewport combinations, entry/home navigation, no overflow, no data forms, no external requests or browser errors.",
    );
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
