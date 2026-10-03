// Isolated local Driver design preview: fixture identity/business responses; real map tiles.
// Never changes environment files, hosted auth settings or production Driver availability.
const { spawn } = require("node:child_process");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const root = path.resolve(__dirname, "../..");
const port = Number(process.env.DRIVER_PREVIEW_PORT || "3002");
const origin = `http://localhost:${port}`;
const testMode = process.argv.includes("--tests");
async function main() {
  try {
    await fetch(origin, { signal: AbortSignal.timeout(1000) });
    throw new Error(`Port ${port} is already in use. Stop that local server first.`);
  } catch (error) { if (error.message.startsWith("Port ")) throw error; }
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--port", String(port)], {
    cwd: path.join(root, "apps/driver"), stdio: "ignore",
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "https://driver-preview.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "preview-only",
      NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: "pk.preview-only", NEXT_TELEMETRY_DISABLED: "1", DRIVER_PREVIEW_DIST_DIR: `.next/driver-preview-${port}` },
  });
  let browser;
  process.once("SIGINT", () => { server.kill(); process.exit(0); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      if (server.exitCode !== null) throw new Error("Driver preview exited before startup.");
      try { ready = (await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* starting */ }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error("Driver preview did not start.");
    if (testMode) {
      const tests = spawn(process.execPath, [require.resolve("@playwright/test/cli"), "test", "tests/e2e/driver-home.spec.ts", "tests/e2e/driver-application.spec.ts", "--workers=1"], {
        cwd: root, stdio: "inherit", env: { ...process.env, PLAYWRIGHT_BASE_URL: origin },
      });
      const code = await new Promise((resolve) => tests.once("exit", resolve));
      if (code !== 0) throw new Error("Driver browser checks failed.");
    } else {
      browser = await chromium.launch({ headless: false, args: ["--window-size=450,800"] });
      const context = await browser.newContext({ viewport: null, serviceWorkers: "block" });
      const { setupDriverPreview } = require("../../tests/fixtures/driver-preview.cjs");
      const page = await context.newPage();
      await setupDriverPreview(page, { applicant: process.argv.includes("--applicant") });
      await page.goto(origin);
      console.log("Driver preview: sample account/activity, real OpenFreeMap tiles. No production writes. Close this browser to stop.");
      if (process.argv.includes("--applicant")) console.log("Application preview: already verified fixture identity; uploads and review status are simulated locally.");
      await new Promise((resolve) => browser.once("disconnected", resolve));
    }
  } finally { if (browser?.isConnected()) await browser.close(); server.kill(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
