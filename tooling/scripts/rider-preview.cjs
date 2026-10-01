// Local manual UI preview. No environment files or application auth settings are changed.
const { spawn } = require("node:child_process");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const root = path.resolve(__dirname, "../..");
const port = Number(process.env.RIDER_PREVIEW_PORT || "3001");
const origin = `http://localhost:${port}`;
const verify = process.argv.includes("--verify") || process.argv.includes("--tests");
const liveVerify = process.argv.includes("--live-verify");
const headless = verify || liveVerify;
const tenant = { tenantId: "11111111-1111-4111-8111-111111111111", tenantSlug: "rider-preview", displayName: "Design preview · sample rides" };
const profile = { riderProfileId: "preview-rider", displayName: "Sample Rider", email: "preview@example.invalid", phone: null, accessibilityNotes: null, status: "active" };

// A clearly simulated, pannable street grid; no Mapbox account or real location is used.
const streets = [];
for (let offset = -40; offset <= 40; offset++) {
  streets.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[-96.7714, 32.832 + offset * .00065], [-96.76, 32.832 + offset * .00065]] } });
  streets.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[-96.771 + offset * .00065, 32.75], [-96.771 + offset * .00065, 32.81]] } });
}
const buildings = [];
for (let x = -25; x <= 25; x++) for (let y = -25; y <= 25; y++) {
  const lng = -96.771 + x * .00065 + .00012, lat = 32.832 + y * .00065 + .00012;
  for (const side of [0, .00026]) buildings.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[lng + side, lat], [lng + side + .00017, lat], [lng + side + .00017, lat + .00022], [lng + side, lat + .00022], [lng + side, lat]]] } });
}
const mapStyle = { version: 8, sources: { streets: { type: "geojson", data: { type: "FeatureCollection", features: streets } }, buildings: { type: "geojson", data: { type: "FeatureCollection", features: buildings } } }, layers: [
  { id: "background", type: "background", paint: { "background-color": "#fafaf7" } },
  { id: "streets", type: "line", source: "streets", paint: { "line-color": "#d8e2e8", "line-width": 14 } },
  { id: "building", type: "fill", source: "buildings", paint: { "fill-color": "#f0f1ef", "fill-outline-color": "#d1d5d5" } },
  { id: "building-sides", type: "fill-extrusion", source: "buildings", paint: { "fill-extrusion-color": "#eef0ee", "fill-extrusion-height": 3, "fill-extrusion-opacity": .85 } },
] };

async function main() {
  try {
    await fetch(origin, { signal: AbortSignal.timeout(1000) });
    throw new Error(`Port ${port} is already in use. Stop the existing Rider dev server first.`);
  } catch (error) {
    if (error.message.startsWith("Port ")) throw error;
  }
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--port", String(port)], {
    cwd: path.join(root, "apps/rider"), stdio: "ignore",
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "https://rider-preview.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "preview-only", NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: process.env.RIDER_PREVIEW_MAPBOX_TOKEN || "pk.preview-only", NEXT_TELEMETRY_DISABLED: "1", RIDER_PREVIEW_DIST_DIR: `.next/rider-preview-${port}` },
  });
  let browser;
  const cleanup = () => { server.kill(); };
  process.once("SIGINT", () => { cleanup(); process.exit(0); });
  process.once("SIGTERM", () => { cleanup(); process.exit(0); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      if (server.exitCode !== null) throw new Error("Rider preview server exited before startup.");
      try { ready = (await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Still starting. */ }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error("Rider preview server did not start.");
    browser = await chromium.launch({ headless, args: headless ? [] : ["--window-size=450,760"] });
    const context = await browser.newContext({ viewport: headless ? { width: 414, height: 896 } : null, serviceWorkers: "block",
      geolocation: { latitude: 32.832, longitude: -96.771, accuracy: 12 }, permissions: ["geolocation"] });
    await context.addInitScript(() => localStorage.setItem("esh-rider-portal-auth", JSON.stringify({
      access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcmV2aWV3In0.preview", refresh_token: "preview-only",
      token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "preview", email: "preview@example.invalid", aud: "authenticated", role: "authenticated" },
    })));
    // Interception exists only in this isolated preview browser, not in Rider source code.
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "rider-preview.invalid") {
        if (url.pathname.startsWith("/auth/")) return route.fulfill({ json: { user: { id: "preview", email: profile.email } } });
        const responses = {
          list_rider_booking_tenants: [{ tenant_slug: tenant.tenantSlug, display_name: tenant.displayName }],
          my_rider_portal: { tenant, profile, serviceAreas: [{ serviceAreaId: "preview-area", name: "Preview service area", description: null }], bookings: [{ bookingId: "preview-past-trip", status: "completed", serviceAreaId: "preview-area", serviceAreaName: "Preview service area", pickupAddress: "Sample pickup", destinationAddress: "Islamic Association of North Texas", createdAt: "2026-09-01T12:00:00Z", scheduledPickupAt: null, dispatchReadyAt: null, bookingNotes: null, driver: null, vehicle: null }] },
          my_rider_notification_preferences: { tripUpdatesEnabled: true, paymentUpdatesEnabled: true },
          my_rider_scheduling: { timeZone: "America/Chicago", settings: { minimumNoticeMinutes: 60 }, bookings: [] },
          my_rider_wallet: { currencyCode: "USD", fractionDigits: 2, balanceMinor: 0, availableMinor: 0, entries: [] },
          my_rider_booking_series: { series: [], occurrences: [], savedPaymentMethod: null },
          my_rider_service_area_context: { latitude: 32.832, longitude: -96.771, radiusKm: 20 },
        };
        return route.fulfill({ json: responses[url.pathname.split("/").pop()] ?? [] });
      }
      if (url.hostname === "api.mapbox.com") {
        if (process.env.RIDER_PREVIEW_MAPBOX_TOKEN) return route.continue();
        if (url.pathname.includes("/styles/")) {
          if (verify) return route.fulfill({ json: mapStyle });
          try {
            const response = await route.fetch({ url: "https://tiles.openfreemap.org/styles/liberty" });
            return route.fulfill({ response });
          } catch {
            return route.abort();
          }
        }
        if (url.pathname.endsWith("/reverse")) return route.fulfill({ status: 503, json: { message: "Actual pickup address lookup is unavailable in the sample-data preview." } });
        if (url.pathname.endsWith("/suggest")) return route.fulfill({ json: { suggestions: [{ mapbox_id: url.searchParams.get("q"), name: url.searchParams.get("q"), full_address: url.searchParams.get("q") + " · sample address" }] } });
        if (url.pathname.includes("/retrieve/")) return route.fulfill({ json: { features: [{ geometry: { coordinates: [-96.771, 32.832] }, properties: { full_address: decodeURIComponent(url.pathname.split("/").pop()) + " · sample address" } }] } });
        return route.fulfill({ json: {} });
      }
      if (url.hostname === "tiles.openfreemap.org") return route.continue();
      if (url.origin === origin && url.pathname.startsWith("/api/")) {
        if (url.pathname === "/api/pricing/quote") {
          const request = route.request().postDataJSON();
          return route.fulfill({ json: { quoteId: "preview-quote", fareAmountMinor: 1800, currencyCode: "USD", fractionDigits: 2,
            expiresAt: new Date(Date.now() + 900000).toISOString(), pickupAddress: request.pickupAddress, destinationAddress: request.destinationAddress,
            routeDistanceMeters: 6400, routeDurationSeconds: 900, farePolicy: "guaranteed_upfront", maximumFareMinor: null } });
        }
        return route.fulfill({ status: 400, json: { message: "Design preview only: bookings, payments, and messages are not submitted." } });
      }
      if (url.origin === origin || url.protocol === "data:" || url.protocol === "blob:") return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    await page.goto(origin + "/?tenant=rider-preview");
    await page.getByRole("button", { name: "Request ride" }).waitFor();
    await page.waitForFunction(() => Boolean(document.querySelector(".mapboxgl-canvas")));
    // Only this isolated browser has a pre-approved, fictional GPS position.
    // Center the map without choosing a service area or filling a booking address.
    await page.getByRole("button", { name: "Center on my location" }).click();
    await page.locator(".rider-current-position").waitFor();
    if (headless) {
      await page.getByRole("button", { name: "Request ride" }).click();
      const pickupInput = page.getByLabel("Pickup address", { exact: true });
      if (await pickupInput.inputValue() !== "" || await pickupInput.getAttribute("placeholder") !== "Pickup address")
        throw new Error("Preview must leave pickup empty with the requested placeholder.");
      await page.getByRole("button", { name: "Home", exact: true }).click();
      await page.getByRole("button", { name: "Open rider menu" }).click();
      await page.getByRole("button", { name: "Account", exact: true }).click();
      await page.getByRole("heading", { name: "Account", exact: true }).waitFor();
      await page.getByRole("button", { name: "Back to request" }).click();
      await page.waitForFunction(() => document.querySelector(".rider-map-canvas")?.querySelector("canvas")?.width > 0);
      await page.waitForTimeout(1500);
      if (liveVerify) {
        await page.waitForFunction(() => !document.querySelector(".map-fallback"));
        await page.waitForTimeout(4000);
      }
      const panel = await page.locator(".rider-landing").boundingBox();
      if (Math.abs(panel.y - 714) > 1) throw new Error("Bottom-panel geometry does not match the 414 × 896 reference.");
      const shortcuts = await page.locator(".destination-shortcuts").boundingBox();
      const canvas = await page.locator(".mapboxgl-canvas").boundingBox();
      if (shortcuts.y + shortcuts.height > 896 || shortcuts.y < 794 || canvas.width !== 414 || panel.width !== 414)
        throw new Error("The full shortcut row and map must fill the 414 × 896 viewport.");
      console.log("Verified 414 × 896 Rider home, y=714 bottom panel, location marker, and donut navigation.");
      if (process.argv.includes("--tests")) {
        const testRun = spawn(process.execPath, [require.resolve("@playwright/test/cli"), "test", "tests/e2e/rider-home.spec.ts", "--workers=1"],
          { cwd: root, stdio: "inherit", env: { ...process.env, PLAYWRIGHT_BASE_URL: origin } });
        const code = await new Promise((resolve) => testRun.once("exit", resolve));
        if (code !== 0) throw new Error("Rider viewport browser tests failed.");
      }
      await page.screenshot({ path: path.join(root, liveVerify ? "test-results/rider-live-preview.png" : "test-results/rider-manual-preview.png"), fullPage: false });
    } else {
      await page.evaluate(() => { document.title = "Rider UI preview · sample data"; });
      console.log("Rider design preview is open with live map tiles and sample Rider data. Close that browser to stop.");
      await new Promise((resolve) => browser.once("disconnected", resolve));
    }
  } finally {
    if (browser?.isConnected()) await browser.close();
    cleanup();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
