import { expect, test, type Page } from "@playwright/test";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { setupDriverPreview } = require("../fixtures/driver-preview.cjs") as { setupDriverPreview: (page: Page, options?: { online?: boolean }) => Promise<void> };
const geographicResponses = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 414, height: 896 });
  await setupDriverPreview(page);
  const responses: string[] = [];
  geographicResponses.set(page, responses);
  page.on("response", (response) => { if (response.ok() && response.url().includes("tiles.openfreemap.org")) responses.push(response.url()); });
  await page.goto("/");
  await expect(page.getByRole("switch", { name: "Driver availability" })).toBeEnabled();
  await expect(page.locator(".driver-shell")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".rider-map-canvas")).toHaveAttribute("data-map-ready", "true", { timeout: 25000 });
  await expect(page.locator(".rider-map-canvas")).toHaveAttribute("data-map-idle", "true", { timeout: 25000 });
});

test("Android recovers native session after WebView clearing, refreshes expired tokens and signs out", async ({ page }) => {
  await page.evaluate(async () => {
    const url = "com.esh.driver://auth/callback#access_token=expired-fixture&refresh_token=consumed-fixture";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
    const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("esh-driver-consumed-auth-callbacks", JSON.stringify([fingerprint]));
  });
  await page.addInitScript(() => {
    const key = "esh-driver-portal-auth";
    if (!sessionStorage.getItem("native-vault-initialized")) {
      sessionStorage.setItem("native-vault", localStorage.getItem(key)!);
      sessionStorage.setItem("native-vault-initialized", "true");
    }
    localStorage.removeItem(key);
    const callbacks: Array<(event: { isActive: boolean }) => void> = [];
    Object.assign(window, { CapacitorCustomPlatform: { name: "android" },
      driverTestForeground: () => callbacks.forEach((callback) => callback({ isActive: true })),
      Capacitor: {
        PluginHeaders: [
          { name: "DriverSessionStorage", methods: ["get", "set", "remove"].map((name) => ({ name, rtype: "promise" })) },
          { name: "App", methods: [{ name: "addListener", rtype: "callback" }, { name: "removeListener", rtype: "promise" }, { name: "getLaunchUrl", rtype: "promise" }] },
          { name: "Geolocation", methods: [{ name: "checkPermissions", rtype: "promise" }] },
        ],
        nativePromise: async (plugin: string, method: string, options: { key?: string; value?: string }) => {
          await Promise.resolve();
          if (plugin === "App" && method === "getLaunchUrl") return { url: "com.esh.driver://auth/callback#access_token=expired-fixture&refresh_token=consumed-fixture" };
          if (plugin !== "DriverSessionStorage") return {};
          if (method === "get") return { value: options.key === key ? sessionStorage.getItem("native-vault") : null };
          if (method === "set") sessionStorage.setItem("native-vault", options.value!);
          if (method === "remove") sessionStorage.removeItem("native-vault");
          return {};
        },
        nativeCallback: (_plugin: string, _method: string, _options: object, callback: (event: { isActive: boolean }) => void) => {
          callbacks.push(callback); return "fixture-listener";
        },
      },
    });
  });
  await page.reload();
  await expect(page.getByRole("switch", { name: "Driver availability" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("esh-driver-portal-auth"))).toBeNull();
  let refreshes = 0;
  await page.route("**/auth/v1/token?grant_type=refresh_token", (route) => {
    expect(route.request().postDataJSON().refresh_token).not.toBe("consumed-fixture");
    refreshes++;
    return route.fulfill({ json: {
      access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcmV2aWV3In0.rotated",
      refresh_token: "rotated-fixture", token_type: "bearer", expires_in: 3600,
      user: { id: "preview-driver", email: "driver-preview@example.invalid", aud: "authenticated", role: "authenticated" },
    } });
  });
  await page.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem("native-vault")!) as { expires_at: number };
    saved.expires_at = 1; sessionStorage.setItem("native-vault", JSON.stringify(saved));
  });
  await page.reload();
  await expect(page.getByRole("switch", { name: "Driver availability" })).toBeVisible();
  await expect.poll(() => refreshes).toBeGreaterThan(0);
  expect(await page.evaluate(() => (JSON.parse(sessionStorage.getItem("native-vault")!) as { refresh_token: string }).refresh_token)).toBe("rotated-fixture");
  await page.evaluate(() => (window as unknown as { driverTestForeground: () => void }).driverTestForeground());
  await page.getByRole("button", { name: "Open driver menu" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
  await expect.poll(async () => {
    try { return await page.evaluate(() => sessionStorage.getItem("native-vault")); }
    catch { return "Navigation in progress"; }
  }).toBeNull();
});

test("home uses live geographic tiles, full-width map, totals and unobscured bottom controls", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Today’s total" })).toBeVisible();
  await expect(page.locator(".driver-total-money strong")).toHaveText(/0\.00/);
  await expect(page.getByText("0 completed trips")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Driver availability" })).toHaveAttribute("aria-checked", "false");
  await page.waitForFunction(() => Boolean(document.querySelector(".mapboxgl-canvas")));
  const map = await page.locator(".driver-map").boundingBox();
  const bottom = await page.locator(".driver-home-bottom").boundingBox();
  expect(map!.width).toBe(414); expect(map!.y + map!.height).toBe(bottom!.y);
  expect(bottom!.y + bottom!.height).toBe(896);
  const location = await page.getByRole("button", { name: "Center on my location" }).boundingBox();
  expect(location!.y + location!.height).toBeLessThan(bottom!.y - 40);
  await expect(page.locator(".driver-tabs")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "SOS" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show traffic" })).toBeVisible();
  await expect(page.getByText("Traffic is temporarily unavailable.")).toBeVisible();
  await page.getByRole("button", { name: "Show traffic" }).click();
  await expect(page.getByText("Traffic is temporarily unavailable.")).toHaveCount(0);
  // Real remote street data only; no fabricated grid or static map in preview/production.
  await expect.poll(() => geographicResponses.get(page)?.some((url) => /planet.*\/1[3-6]\/\d+\/\d+/.test(url)), { timeout: 20000 }).toBe(true);
  await expect(page.locator(".map-fallback")).toHaveCount(0);
  await expect(page.locator(".rider-map-canvas")).toHaveAttribute("data-map-idle", "true");
  await page.screenshot({ path: "test-results/driver-home-offline-414.png" });
});

test("availability uses confirmed responses and preserves offline on pending or failure", async ({ page }) => {
  const control = page.getByRole("switch", { name: "Driver availability" });
  await page.route("**/rest/v1/rpc/set_my_driver_availability", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ status: 400, json: { message: "Preview eligibility rejected" } });
  });
  await control.click(); await expect(control).toBeDisabled();
  await expect(control).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Preview eligibility rejected")).toBeVisible();
  await expect(control).toBeEnabled(); await expect(control).toHaveAttribute("aria-checked", "false");
  await page.unroute("**/rest/v1/rpc/set_my_driver_availability");
  await control.click(); await expect(control).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".driver-availability")).toHaveClass(/is-online/);
  await page.getByRole("button", { name: "Show traffic" }).click();
  await page.screenshot({ path: "test-results/driver-home-online-414.png" });
  await control.click(); await expect(control).toHaveAttribute("aria-checked", "false");
});

test("drawer matches ordered navigation, traps focus and dismisses on Escape, backdrop and back", async ({ page }) => {
  const toggle = page.getByRole("button", { name: "Open driver menu" });
  await toggle.click();
  const drawer = page.getByRole("dialog", { name: "Driver menu" });
  await expect(drawer).toBeVisible();
  expect((await drawer.boundingBox())!.width).toBeCloseTo(414 * .87, 0);
  await expect(drawer.locator("nav strong")).toHaveText(["Profile", "Notifications", "Wallet", "Recent orders", "Settings"]);
  await page.screenshot({ path: "test-results/driver-drawer-414.png" });
  await page.keyboard.press("Shift+Tab"); await expect(drawer.getByRole("button", { name: "Settings" })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(drawer.getByRole("button", { name: "Close driver menu" })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(drawer).toHaveCount(0); await expect(toggle).toBeFocused();
  await toggle.click(); await page.mouse.click(405, 350); await expect(drawer).toHaveCount(0);
  await toggle.click(); await page.goBack(); await expect(drawer).toHaveCount(0);
});

test("drawer entries preserve profile, notifications, wallet, recent orders and availability settings", async ({ page }) => {
  for (const label of ["Profile", "Notifications", "Wallet", "Recent orders", "Settings"]) {
    await page.getByRole("button", { name: "Open driver menu" }).click();
    await page.getByRole("dialog", { name: "Driver menu" }).getByRole("button", { name: label }).click();
    await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
    if (label === "Settings") await expect(page.getByLabel("Active operating area")).toBeVisible();
    if (label === "Notifications") await expect(page.getByText("Transactional SMS", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back to home" }).click();
  }
});

test("trip email preference persists independently and a failed update preserves its confirmed state", async ({ page }) => {
  await page.getByRole("button", { name: "Open driver menu" }).click();
  await page.getByRole("dialog", { name: "Driver menu" }).getByRole("button", { name: "Notifications" }).click();
  const email = page.getByRole("checkbox", { name: "Email me about new trip offers" });
  await expect(email).toBeChecked();
  await email.click();
  await expect(email).not.toBeChecked();
  await expect(page.locator(".notification-preferences").first().getByText("Trip offer emails disabled. Device alerts are unchanged.", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open driver menu" }).click();
  await page.getByRole("dialog", { name: "Driver menu" }).getByRole("button", { name: "Notifications" }).click();
  await expect(email).not.toBeChecked();
  await page.route("**/rest/v1/rpc/set_my_driver_trip_email_preferences", (route) =>
    route.fulfill({ status: 503, json: { message: "Preference service unavailable" } }));
  await email.click();
  await expect(page.locator(".notification-preferences").first().getByText("Trip email preference could not be saved. Try again.", { exact: true })).toBeVisible();
  await expect(email).not.toBeChecked();
  await expect(email).toBeEnabled();
  await page.screenshot({ path: "test-results/driver-notification-channels-414.png", fullPage: true });
});

test("drivers can view pending, approved and rejected documents without exposing a missing upload", async ({ page }) => {
  const documents = [
    { evidenceType: "personal_photo", reviewStatus: "approved", originalFileName: "profile.jpg" },
    { evidenceType: "driver_id_photo", reviewStatus: "pending", originalFileName: "ID.jpg" },
    { evidenceType: "reference_document", reviewStatus: "rejected", originalFileName: "registration.pdf" },
    { evidenceType: "insurance", reviewStatus: "missing", originalFileName: null },
  ];
  await page.route("**/rest/v1/rpc/my_driver_portal_summary", (route) => route.fulfill({ json: {
    driverProfileId: "preview-driver", driverNumber: "PREVIEW", displayName: "Design preview driver",
    status: "active", onboardingStatus: "approved", documentCompliance: false,
    documents, notificationPreferences: { expirationRemindersEnabled: true }, vehicle: null,
  } }));
  await page.reload();
  await page.getByRole("button", { name: "Open driver menu" }).click();
  await page.getByRole("dialog", { name: "Driver menu" }).getByRole("button", { name: /^Profile/ }).click();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await expect(page.getByRole("button", { name: "View Vehicle insurance document", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Take photo for Vehicle registration document", exact: true })).toBeVisible();
  for (const label of ["Profile photo", "Driver ID photo", "Vehicle registration document"]) {
    await page.route("**/api/documents", (route) => {
      expect(route.request().postDataJSON()).not.toHaveProperty("applicationId");
      return route.fulfill({ json: { url: "data:application/pdf;base64,JVBERi0xLjQKJSVFT0Y=", fileName: "fixture.pdf", mimeType: "application/pdf" } });
    });
    await page.getByRole("button", { name: `View ${label}`, exact: true }).click();
    await expect(page.getByRole("dialog", { name: label, exact: true })).toBeVisible();
    await expect(page.locator(".driver-document-dialog iframe")).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(414);
  await page.screenshot({ path: "test-results/driver-documents-414.png", fullPage: true });
});

test("document review refresh unlocks rejected ID replacement and reports refresh failures", async ({ page }) => {
  let status = "pending";
  let unavailable = false;
  await page.route("**/rest/v1/rpc/my_driver_portal_summary", (route) => route.fulfill(unavailable
    ? { status: 503, json: { message: "Unavailable" } }
    : { json: { driverProfileId: "preview-driver", driverNumber: "PREVIEW", displayName: "Design preview driver",
      status: "active", onboardingStatus: "approved", documentCompliance: false, vehicle: null,
      documents: [{ evidenceType: "driver_id_photo", reviewStatus: status, originalFileName: "ID.jpg", reviewNotes: status === "rejected" ? "Not clear" : null }],
      notificationPreferences: { expirationRemindersEnabled: true } } }));
  await page.reload();
  await page.getByRole("button", { name: "Open driver menu" }).click();
  await page.getByRole("dialog", { name: "Driver menu" }).getByRole("button", { name: /^Profile/ }).click();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  const refresh = page.getByRole("button", { name: "Refresh document status", exact: true });
  await expect(refresh).toBeEnabled();
  await expect(page.getByRole("button", { name: "Take photo for Driver ID photo", exact: true })).toHaveCount(0);
  status = "rejected";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Not clear", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Choose replacement for Driver ID photo", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Take photo for Driver ID photo", exact: true })).toBeVisible();
  unavailable = true;
  await refresh.click();
  await expect(page.getByRole("alert").filter({ hasText: "Document status could not be refreshed" })).toBeVisible();
  unavailable = false; status = "pending";
  await refresh.click();
  await expect(page.getByRole("alert").filter({ hasText: "Document status could not be refreshed" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Take photo for Driver ID photo", exact: true })).toHaveCount(0);
});

test("preorders distinguish real empty data from errors, with usable tabs and return", async ({ page }) => {
  await page.getByRole("button", { name: /Preorders/ }).click();
  await expect(page.getByRole("heading", { name: "Preorders", exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Receive while offline" })).toBeEnabled();
  await expect(page.getByRole("tab", { name: /Assigned to me/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /New/ }).click();
  await expect(page.getByRole("tab", { name: /New/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No available preorders", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/driver-preorders-414.png" });
  await page.route("**/rest/v1/rpc/my_driver_preorders", (route) => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.getByRole("button", { name: "Refresh preorders" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Preorders could not be refreshed" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Receive while offline" })).toBeDisabled();
  await page.goBack(); await expect(page.getByRole("heading", { name: "Today’s total" })).toBeVisible();
});

test("map-only GPS displays actual supplied coordinates without enabling live sharing", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 32.833, longitude: -96.772, accuracy: 12 });
  const writes: string[] = [];
  page.on("request", (request) => { if (/set_my_driver_location_sharing|update_my_driver_location/.test(request.url())) writes.push(request.url()); });
  await page.getByRole("button", { name: "Center on my location" }).click();
  await expect(page.locator(".rider-current-position")).toHaveAttribute("data-latitude", "32.833");
  await context.setGeolocation({ latitude: 32.834, longitude: -96.773, accuracy: 10 });
  await expect(page.locator(".rider-current-position")).toHaveAttribute("data-latitude", "32.834");
  await expect(page.locator(".rider-map-canvas")).toHaveAttribute("data-map-idle", "true");
  await page.screenshot({ path: "test-results/driver-home-location-414.png" });
  const canvas = page.locator(".mapboxgl-canvas"); const bounds = await canvas.boundingBox();
  await page.mouse.move(bounds!.width / 2, 400); await page.mouse.down(); await page.mouse.move(bounds!.width / 2 + 35, 450, { steps: 5 }); await page.mouse.up(); await page.mouse.wheel(0, -100);
  expect(writes).toEqual([]);
});

test("denied location explains fallback and leaves availability usable", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
    getCurrentPosition: (_success: unknown, error: (value: { code: number; message: string }) => void) => error({ code: 1, message: "Denied" }),
    watchPosition: () => 0, clearWatch: () => {},
  } }); });
  await page.reload(); await page.getByRole("button", { name: "Center on my location" }).click();
  await expect(page.locator(".driver-home-notice")).toContainText(/operating area/);
  await expect(page.locator(".rider-current-position")).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Driver availability" })).toBeEnabled();
});

test("compact 320 phone and desktop keep map and fixed actions inside the viewport", async ({ page }) => {
  for (const size of [{ width: 320, height: 600 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(size.width);
    const bottom = await page.locator(".driver-home-bottom").boundingBox();
    const totals = await page.locator(".driver-total").boundingBox();
    expect(bottom!.y + bottom!.height).toBe(size.height); expect(totals!.x + totals!.width).toBeLessThanOrEqual(size.width);
    await page.screenshot({ path: `test-results/driver-home-${size.width}.png` });
  }
});

test("unavailable account data does not fabricate earnings or confirmed online status", async ({ page }) => {
  await page.route("**/rest/v1/rpc/my_driver_wallet", (route) => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.route("**/rest/v1/rpc/my_driver_availability", (route) => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.reload();
  await expect(page.locator(".driver-shell")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".driver-total-money strong")).toHaveText("—");
  await expect(page.getByRole("switch", { name: "Driver availability" })).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Driver availability" })).toHaveAttribute("aria-checked", "false");
});

test("active dispatch stays reachable with existing trip lifecycle and navigation controls", async ({ page }) => {
  let fresh = true;
  await page.route("**/rest/v1/rpc/my_driver_rider_pickup_location", (route) => route.fulfill({ json: {
    latitude: 32.831, longitude: -96.77, accuracyMeters: 12,
    recordedAt: new Date(Date.now() - (fresh ? 0 : 90000)).toISOString(),
  } }));
  await page.route("**/rest/v1/rpc/my_driver_dispatch", (route) => route.fulfill({ json: { offers: [], trips: [{
    bookingId: "preview-active", customerName: "Fixture passenger", customerPhone: null, pickupAddress: "Fixture pickup", destinationAddress: "Fixture destination", notes: null,
    serviceAreaName: "Preview area", status: "accepted", pickupLatitude: 32.832, pickupLongitude: -96.771,
    destinationLatitude: 32.834, destinationLongitude: -96.773, fareCurrencyCode: "USD", fareAmountMinor: 1200,
  }] } }));
  await page.reload();
  await page.getByRole("button", { name: "Active trip · Open controls" }).click();
  await expect(page.getByRole("button", { name: "Mark arrived" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Navigate to pickup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View shared passenger location" })).toBeVisible();
  await expect(page.getByText("This is separate from the booked pickup address.")).toBeVisible();
  await page.screenshot({ path: "test-results/driver-passenger-sharing-414.png", fullPage: true });
  fresh = false;
  await page.reload();
  await page.getByRole("button", { name: "Active trip · Open controls" }).click();
  await expect(page.getByText("No current passenger location shared. Use the booked pickup address.")).toBeVisible();
  await expect(page.getByRole("button", { name: "View shared passenger location" })).toHaveCount(0);
  await expect(page.getByText("Rider trip fare (not Driver earnings):", { exact: false })).toBeVisible();
  // Do not initiate navigation, a trip lifecycle mutation, an emergency or any production action.
});
