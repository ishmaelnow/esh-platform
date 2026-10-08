import { expect, test } from "@playwright/test";

const tenant = { tenantId: "11111111-1111-4111-8111-111111111111", tenantSlug: "rider-preview", displayName: "Preview rides" };
const profile = { riderProfileId: "preview-rider", displayName: "Preview Rider", email: "rider-preview@example.invalid", phone: null as string | null, accessibilityNotes: null as string | null, status: "active" };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 414, height: 896 });
  // All identity and business data are local fixtures; no production writes or emails.
  await page.addInitScript(() => {
    localStorage.setItem("esh-rider-portal-auth", JSON.stringify({
      access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcmV2aWV3In0.preview",
      refresh_token: "preview-only", token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "preview", email: "rider-preview@example.invalid", aud: "authenticated", role: "authenticated" },
    }));
  });
  await page.route("**/auth/v1/**", (route) => route.fulfill({ json: { user: { id: "preview", email: profile.email } } }));
  await page.route("**/api/profile/photo?*", (route) => route.fulfill({ json: { url: null } }));
  await page.route("https://api.mapbox.com/**", (route) => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#f7f7f2" } }] } }));
  await page.route("**/rest/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const name = path.split("/").pop();
    const responses: Record<string, unknown> = {
      my_rider_has_active_booking: false,
      list_rider_booking_tenants: [{ tenant_slug: tenant.tenantSlug, display_name: tenant.displayName }],
      my_rider_portal: { tenant, profile, serviceAreas: [{ serviceAreaId: "preview-area", name: "City", description: null }], bookings: [{ bookingId: "past", serviceAreaId: "preview-area", pickupAddress: "Previous pickup", destinationAddress: "Previous destination", status: "completed", createdAt: "2026-09-01T12:00:00Z", driver: null, vehicle: null, pickupLatitude: 32.78, pickupLongitude: -96.8, destinationLatitude: 32.79, destinationLongitude: -96.81 }] },
      my_rider_notification_preferences: { tripUpdatesEnabled: true, paymentUpdatesEnabled: true },
      my_rider_scheduling: { timeZone: "America/Chicago", settings: { minimumNoticeMinutes: 60 }, bookings: [] },
      my_rider_wallet: { currencyCode: "USD", fractionDigits: 2, balanceMinor: 0, availableMinor: 0, entries: [] },
      my_rider_booking_series: { series: [], occurrences: [], savedPaymentMethod: null },
      my_rider_service_area_context: { latitude: 32.78, longitude: -96.8, radiusKm: 20 },
      dispatch_bookings: [{ booking_id: "past", pickup_latitude: 32.78, pickup_longitude: -96.8, destination_latitude: 32.79, destination_longitude: -96.81 }],
    };
    return route.fulfill({ json: responses[name ?? ""] ?? [] });
  });
  await page.goto("/?tenant=rider-preview");
  await expect(page.getByRole("button", { name: "Request ride" })).toBeVisible();
});

test("current ride tracking uses fresh coordinates, ages offline readings and switches to destination ETA", async ({ page }) => {
  let status = "accepted";
  let recordedAt = new Date().toISOString();
  let sharing = false;
  let revokeOnUpdate = false;
  const publications: Record<string, unknown>[] = [];
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 32.76, longitude: -96.78 });
  await page.addInitScript(() => {
    // Isolated actual-GPS contract fixture, including capture time; no production location.
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", { configurable: true, value: (success: PositionCallback) => {
      success({ timestamp: Date.now(), coords: { latitude: 32.76, longitude: -96.78, accuracy: 10,
        altitude: null, altitudeAccuracy: null, heading: null, speed: null } } as GeolocationPosition);
    } });
  });
  await page.route("**/rest/v1/rpc/my_rider_pickup_sharing", (route) => route.fulfill({ json: sharing }));
  await page.route("**/rest/v1/rpc/set_my_rider_pickup_sharing", (route) => {
    sharing = route.request().postDataJSON().enabled_value as boolean;
    return route.fulfill({ json: sharing });
  });
  await page.route("**/rest/v1/rpc/update_my_rider_pickup_location", (route) => {
    if (revokeOnUpdate) {
      sharing = false;
      return route.fulfill({ status: 400, json: { message: "Fixture assignment changed" } });
    }
    publications.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ json: null });
  });
  const directions: string[] = [];
  await page.route("**/rest/v1/rpc/my_rider_portal", (route) => route.fulfill({ json: {
    tenant, profile, serviceAreas: [{ serviceAreaId: "preview-area", name: "City", description: null }],
    bookings: [{ bookingId: "tracking-test", status, pickupAddress: "Test pickup", destinationAddress: "Test destination",
      createdAt: recordedAt, driver: { displayName: "Test Driver", driverNumber: "TEST" }, vehicle: null }],
  } }));
  await page.route("**/rest/v1/dispatch_bookings?*", (route) => route.fulfill({ json: [{
    booking_id: "tracking-test", pickup_latitude: 32.78, pickup_longitude: -96.8,
    destination_latitude: 32.79, destination_longitude: -96.81,
  }] }));
  await page.route("**/rest/v1/rpc/my_rider_trip_locations", (route) => route.fulfill({ json: [{
    bookingId: "tracking-test", latitude: 32.77, longitude: -96.79, accuracyMeters: 10, recordedAt, fresh: true,
  }] }));
  await page.route("https://api.mapbox.com/directions/**", (route) => {
    directions.push(route.request().url());
    return route.fulfill({ json: { routes: [{ duration: 300, distance: 1200,
      legs: [{ duration: 300 }], geometry: { type: "LineString", coordinates: [[-96.79, 32.77], [-96.8, 32.78]] } }] } });
  });
  await page.reload();
  const tracking = page.getByRole("region", { name: "Current ride tracking" });
  await expect(tracking).toContainText("Your driver is on the way");
  await expect(tracking).toContainText("Pickup ETA: about 5 min");
  await expect(tracking.getByRole("button", { name: "Track ride" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Request ride", exact: true })).toBeInViewport();
  await page.screenshot({ path: "test-results/rider-tracking-home-414.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(tracking.getByRole("button", { name: "Track ride" })).toBeInViewport();
  await page.setViewportSize({ width: 414, height: 896 });
  await tracking.getByRole("button", { name: "Track ride" }).click();
  await expect(page.getByRole("heading", { name: "Your active ride" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share my location with my driver", exact: true })).toBeVisible();
  expect(publications).toHaveLength(0);
  await page.getByRole("button", { name: "Share my location with my driver", exact: true }).click();
  await expect.poll(() => publications.length, { timeout: 15000 }).toBeGreaterThan(0);
  expect(publications[0]?.latitude_value).toBe(32.76);
  expect(publications[0]?.target_booking_id).toBe("tracking-test");
  await page.screenshot({ path: "test-results/rider-pickup-sharing-414.png", fullPage: true });
  await page.getByRole("button", { name: "Stop sharing my location", exact: true }).click();
  await expect(page.getByRole("button", { name: "Share my location with my driver", exact: true })).toBeVisible();
  expect(sharing).toBe(false);
  revokeOnUpdate = true;
  await page.getByRole("button", { name: "Share my location with my driver", exact: true }).click();
  await expect(page.getByRole("button", { name: "Share my location with my driver", exact: true })).toBeVisible();
  expect(sharing).toBe(false);
  await page.screenshot({ path: "test-results/rider-tracking-trip-414.png", fullPage: true });
  recordedAt = new Date(Date.now() - 90_000).toISOString();
  await page.reload();
  await expect(page.getByRole("region", { name: "Current ride tracking" })).toContainText("Last known driver location");
  await expect(page.getByRole("region", { name: "Current ride tracking" })).toContainText("ETA unavailable");
  status = "in_progress"; recordedAt = new Date().toISOString(); directions.length = 0;
  await page.reload();
  await expect(page.getByRole("region", { name: "Current ride tracking" })).toContainText("Destination ETA: about 5 min");
  await expect(page.getByRole("button", { name: "Share my location with my driver", exact: true })).toHaveCount(0);
  expect(directions.some((url) => url.includes("-96.79,32.77;-96.81,32.79"))).toBe(true);
  status = "arrived";
  await page.reload();
  await expect(page.getByRole("region", { name: "Current ride tracking" })).toContainText("Your driver has arrived");
  await expect(page.getByRole("region", { name: "Current ride tracking" })).not.toContainText("ETA:");
});

test("a current ride blocks immediate booking while future timing stays available", async ({ page }) => {
  await page.route("**/rest/v1/rpc/my_rider_portal", (route) => route.fulfill({ json: {
    tenant, profile, serviceAreas: [{ serviceAreaId: "preview-area", name: "City", description: null }],
    bookings: [{ bookingId: "active-preview", status: "accepted", pickupAddress: "Test pickup",
      destinationAddress: "Test destination", createdAt: "2026-10-07T12:00:00Z", driver: null, vehicle: null }],
  } }));
  await page.reload();
  await page.getByRole("button", { name: "Request ride", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review fare", exact: true })).toBeDisabled();
  await expect(page.getByText("Finish or cancel your current trip before requesting another ride.")).toBeVisible();
  await page.locator(".booking-time summary").click();
  await page.locator("select").filter({ has: page.locator('option[value="scheduled"]') }).selectOption("scheduled");
  await expect(page.getByRole("button", { name: "Review fare", exact: true })).toBeEnabled();
  await expect(page.getByText("Finish or cancel your current trip before requesting another ride.")).toHaveCount(0);
});

test("Android recovers native session after WebView clearing, refreshes expired tokens and signs out", async ({ page }) => {
  await page.addInitScript(() => {
    const key = "esh-rider-portal-auth";
    if (!sessionStorage.getItem("native-vault-initialized")) {
      sessionStorage.setItem("native-vault", localStorage.getItem(key)!);
      sessionStorage.setItem("native-vault-initialized", "true");
    }
    localStorage.removeItem(key);
    const callbacks: Array<(event: { isActive: boolean }) => void> = [];
    Object.assign(window, { CapacitorCustomPlatform: { name: "android" },
      riderTestForeground: () => callbacks.forEach((callback) => callback({ isActive: true })),
      Capacitor: {
        PluginHeaders: [
          { name: "RiderSessionStorage", methods: ["get", "set", "remove"].map((name) => ({ name, rtype: "promise" })) },
          { name: "App", methods: [{ name: "addListener", rtype: "callback" }, { name: "removeListener", rtype: "promise" }, { name: "getLaunchUrl", rtype: "promise" }] },
          { name: "Geolocation", methods: [{ name: "checkPermissions", rtype: "promise" }] },
        ],
        nativePromise: async (plugin: string, method: string, options: { key?: string; value?: string }) => {
          await Promise.resolve();
          if (plugin !== "RiderSessionStorage") return {};
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
  await expect(page.getByRole("button", { name: "Request ride" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("esh-rider-portal-auth"))).toBeNull();
  let refreshes = 0;
  await page.route("**/auth/v1/token?grant_type=refresh_token", (route) => {
    refreshes++;
    return route.fulfill({ json: {
      access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcmV2aWV3In0.rotated",
      refresh_token: "rotated-fixture", token_type: "bearer", expires_in: 3600,
      user: { id: "preview", email: profile.email, aud: "authenticated", role: "authenticated" },
    } });
  });
  await page.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem("native-vault")!) as { expires_at: number };
    saved.expires_at = 1; sessionStorage.setItem("native-vault", JSON.stringify(saved));
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Request ride" })).toBeVisible();
  await expect.poll(() => refreshes).toBeGreaterThan(0);
  expect(await page.evaluate(() => (JSON.parse(sessionStorage.getItem("native-vault")!) as { refresh_token: string }).refresh_token)).toBe("rotated-fixture");
  await page.evaluate(() => (window as unknown as { riderTestForeground: () => void }).riderTestForeground());
  await page.getByRole("button", { name: "Open rider menu" }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.getByLabel("Verified email")).toHaveValue(profile.email);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Email me a secure link" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("native-vault"))).toBeNull();
});

test("app checkout automatically attempts the fixed Rider scheme and retains fallback links", async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send("Page.enable");
  const navigations: string[] = [];
  client.on("Page.frameRequestedNavigation", (event: { url: string }) => navigations.push(event.url));
  const query = "tenant=rider-preview&payment=success&quote=11111111-1111-4111-8111-111111111111";
  await page.goto(`/payments/return?${query}&returnTo=app`);
  await expect.poll(() => navigations.filter((url) => url === `com.esh.rider://auth/callback?${query}`).length).toBe(1);
  await expect(page.getByRole("link", { name: "Continue in browser" })).toHaveAttribute("href", `/?${query}`);
  await expect(page.getByRole("link", { name: "Return to ESH Rider", exact: true })).toBeVisible();
  await client.detach();
});

test("native payment handoff page offers the correct Rider link without claiming payment", async ({ page }) => {
  const quote = "11111111-1111-4111-8111-111111111111";
  await page.goto(`/payments/return?tenant=rider-preview&payment=success&quote=${quote}`);
  await expect(page.getByRole("link", { name: "Return to ESH Rider", exact: true })).toHaveAttribute("href", `com.esh.rider://auth/callback?tenant=rider-preview&payment=success&quote=${quote}`);
  await expect(page.getByRole("link", { name: "Continue in browser" })).toHaveAttribute("href", `/?tenant=rider-preview&payment=success&quote=${quote}`);
  await expect(page.getByText("This page does not confirm payment.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/rider-payment-return-414.png", fullPage: true });
  await page.goto("/payments/return?tenant=rider-preview&payment=success&quote=invalid");
  await expect(page.locator("main").getByRole("alert")).toContainText("incomplete");
  await expect(page.getByRole("link", { name: "Return to ESH Rider", exact: true })).toHaveCount(0);
});

test("iOS payment callback closes Browser, recovers an existing booking once, and rejects other apps", async ({ page }) => {
  await page.addInitScript(() => {
    let closeCalls = 0;
    const callbacks: Array<(event: { url: string }) => void> = [];
    Object.assign(window, { CapacitorCustomPlatform: { name: "ios" },
      riderPaymentFixture: { return: (url: string) => callbacks.forEach((callback) => callback({ url })), closes: () => closeCalls },
      Capacitor: {
        PluginHeaders: [
          { name: "App", methods: [{ name: "addListener", rtype: "callback" }, { name: "removeListener", rtype: "promise" }, { name: "getLaunchUrl", rtype: "promise" }] },
          { name: "Browser", methods: [{ name: "close", rtype: "promise" }] },
          { name: "Geolocation", methods: [{ name: "checkPermissions", rtype: "promise" }] },
        ],
        nativePromise: async (plugin: string, method: string) => {
          await Promise.resolve(); if (plugin === "Browser" && method === "close") closeCalls++;
          return plugin === "Geolocation" ? { location: "denied" } : {};
        },
        nativeCallback: (_plugin: string, _method: string, options: { eventName?: string }, callback: (event: { url: string }) => void) => {
          if (options.eventName === "appUrlOpen") callbacks.push(callback); return "payment-listener";
        },
      },
    });
  });
  const quote = "11111111-1111-4111-8111-111111111111";
  let reads = 0, bookings = 0;
  await page.route("**/api/payments/checkout?*", (route) => {
    reads++;
    expect(new URL(route.request().url()).searchParams.get("tenantSlug")).toBe(tenant.tenantSlug);
    return route.fulfill({ json: { paymentStatus: "paid", quote: { quoteId: quote, bookingId: "already-booked", serviceAreaId: "preview-area" } } });
  });
  await page.route("**/rest/v1/rpc/create_my_rider_priced_booking*", (route) => { bookings++; return route.fulfill({ status: 400 }); });
  await page.reload();
  await expect(page.getByRole("button", { name: "Request ride" })).toBeVisible();
  const valid = `com.esh.rider://auth/callback?tenant=rider-preview&payment=success&quote=${quote}`;
  await page.evaluate((url) => (window as unknown as { riderPaymentFixture: { return: (url: string) => void } }).riderPaymentFixture.return(url), valid.replace("com.esh.rider", "com.esh.driver"));
  await expect(page.locator("main").getByRole("alert")).toContainText("payment-return link is invalid");
  expect(reads).toBe(0);
  await page.evaluate((url) => (window as unknown as { riderPaymentFixture: { return: (url: string) => void } }).riderPaymentFixture.return(url), valid);
  await expect(page.getByText("Payment received and trip requested. Dispatch can now find an eligible driver.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { riderPaymentFixture: { closes: () => number } }).riderPaymentFixture.closes())).toBe(1);
  expect(new URL(page.url()).searchParams.has("payment")).toBe(false);
  expect(new URL(page.url()).protocol).toBe("http:");
  const completedReads = reads;
  await page.evaluate(async (url) => {
    (window as unknown as { riderPaymentFixture: { return: (url: string) => void } }).riderPaymentFixture.return(url);
    await new Promise(requestAnimationFrame);
  }, valid);
  expect(reads).toBe(completedReads); expect(bookings).toBe(0);
  await page.evaluate((url) => (window as unknown as { riderPaymentFixture: { return: (url: string) => void } }).riderPaymentFixture.return(url), valid.replace("success", "cancelled"));
  await expect(page.getByText("Checkout cancelled. You can review your trip and try again.", { exact: true })).toBeVisible();
  expect(reads).toBe(completedReads);
});

test("mobile home shows only the request panel, with secondary sections in the donut", async ({ page }) => {
  await expect(page.getByRole("region", { name: "Ride map" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Rider sections" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Account", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Payment and refund history" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Request a ride" })).toHaveCount(0);
  const bottomPanel = await page.locator(".rider-landing").boundingBox();
  expect(bottomPanel?.y).toBeCloseTo(714, 0);
  expect(bottomPanel?.height).toBeCloseTo(182, 0);
  expect(bottomPanel?.width).toBeCloseTo(414, 0);
  const map = await page.getByRole("region", { name: "Ride map" }).boundingBox();
  expect(map?.width).toBeCloseTo(414, 0);
  expect(map?.height).toBeCloseTo(714, 0);
  const shortcuts = await page.locator(".destination-shortcuts").boundingBox();
  expect(shortcuts!.y).toBeCloseTo(794, 0);
  expect(shortcuts!.y + shortcuts!.height).toBeLessThan(896);
  await expect(page.getByRole("button", { name: "Choose a destination" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Home", exact: true })).toBeVisible();
  const menu = await page.getByRole("button", { name: "Open rider menu" }).boundingBox();
  expect(menu?.x).toBeCloseTo(24, 0);
  expect(menu?.y).toBeCloseTo(64, 0);
  expect(menu?.width).toBeCloseTo(46, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Open rider menu" }).click();
  await expect(page.getByRole("navigation", { name: "Rider sections" })).toBeVisible();
  await page.screenshot({ path: "test-results/rider-donut-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where are you going?" })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to request" }).click();
  await expect(page.getByRole("button", { name: "Request ride" })).toBeVisible();
  await page.screenshot({ path: "test-results/rider-home-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 414, height: 600 });
  const compactPanel = await page.locator(".rider-landing").boundingBox();
  const compactShortcuts = await page.locator(".destination-shortcuts").boundingBox();
  expect(compactPanel!.y + compactPanel!.height).toBeCloseTo(600, 0);
  expect(compactShortcuts!.y + compactShortcuts!.height).toBeLessThanOrEqual(600);
  await expect(page.getByRole("button", { name: "Home", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  await toggleMenuAndCheckBounds();

  async function toggleMenuAndCheckBounds() {
    await page.getByRole("button", { name: "Open rider menu" }).click();
    const ring = await page.getByRole("navigation", { name: "Rider sections" }).boundingBox();
    expect(ring).not.toBeNull();
    expect(ring!.x).toBeGreaterThanOrEqual(0);
    expect(ring!.x + ring!.width).toBeLessThanOrEqual(320);
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("Account edits owned profile, persists reload and keeps mobile controls and booking usable", async ({ page }) => {
  let savedProfile = { ...profile };
  await page.route("**/rest/v1/rpc/my_rider_portal", (route) => route.fulfill({ json: {
    tenant, profile: savedProfile, serviceAreas: [{ serviceAreaId: "preview-area", name: "City", description: null }], bookings: [],
  } }));
  const updates: Record<string, string>[] = [];
  await page.route("**/rest/v1/rpc/update_my_rider_profile", (route) => {
    const body = route.request().postDataJSON() as Record<string, string>;
    updates.push(body);
    savedProfile = { ...savedProfile, displayName: body.display_name_value!, phone: body.phone_value ?? null,
      accessibilityNotes: body.accessibility_notes_value ?? null };
    return route.fulfill({ json: "preview-rider" });
  });
  await page.getByRole("button", { name: "Open rider menu" }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  const editor = page.locator(".rider-profile-card");
  await expect(editor.getByLabel("Verified email")).toHaveAttribute("readonly", "");
  await editor.getByLabel("Full name", { exact: true }).fill("Updated Rider");
  await editor.getByLabel("Contact phone", { exact: false }).fill("+1 215 555 0123");
  await editor.getByLabel("Accessibility or pickup notes").fill("Please wait by the entrance.");
  await editor.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(editor.getByText("Profile saved.", { exact: true })).toBeVisible();
  expect(updates).toEqual([{ target_tenant_slug: tenant.tenantSlug, display_name_value: "Updated Rider",
    phone_value: "+1 215 555 0123", accessibility_notes_value: "Please wait by the entrance." }]);
  await page.reload();
  await page.getByRole("button", { name: "Open rider menu" }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(editor.getByLabel("Full name", { exact: true })).toHaveValue("Updated Rider");
  await expect(editor.getByLabel("Contact phone", { exact: false })).toHaveValue("+1 215 555 0123");
  await page.screenshot({ path: "test-results/rider-profile-account-414.png", fullPage: true });
  for (const viewport of [{ width: 414, height: 480 }, { width: 320, height: 600 }]) {
    await page.setViewportSize(viewport);
    await editor.getByLabel("Accessibility or pickup notes").focus();
    await editor.getByRole("button", { name: "Save profile", exact: true }).scrollIntoViewIfNeeded();
    await expect(editor.getByRole("button", { name: "Save profile", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "Back to request" }).click();
  await expect(page.getByRole("button", { name: "Request ride" })).toBeVisible();
});

test("optional profile photo uploads, survives reload, removes and reports failure without blocking edits", async ({ page }) => {
  // Older iOS WebViews lack bitmap decoding. Exercise the image-element fallback end to end.
  await page.evaluate(() => Object.defineProperty(window, "createImageBitmap", { value: undefined, configurable: true }));
  const pixel = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    canvas.getContext("2d")!.fillRect(0, 0, 16, 16);
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  let hasPhoto = false, failUpload = false;
  const methods: string[] = [];
  await page.route("**/api/profile/photo?*", (route) => {
    const method = route.request().method(); methods.push(method);
    expect(new URL(route.request().url()).searchParams.get("tenantSlug")).toBe(tenant.tenantSlug);
    if (method === "POST") {
      if (failUpload) return route.fulfill({ status: 503, json: { message: "Photo upload unavailable. Try again." } });
      expect(route.request().postDataBuffer()?.toString()).toContain("image/jpeg");
      hasPhoto = true; return route.fulfill({ json: { saved: true } });
    }
    if (method === "DELETE") { hasPhoto = false; return route.fulfill({ json: { removed: true } }); }
    return route.fulfill({ json: { url: hasPhoto ? `data:image/png;base64,${pixel}` : null } });
  });
  await page.getByRole("button", { name: "Open rider menu" }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  const editor = page.locator(".rider-profile-card"), input = editor.getByLabel("Choose profile photo", { exact: true });
  await expect(input).toBeEnabled();
  await input.setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: Buffer.from(pixel, "base64") });
  await expect(editor.getByText("Profile photo updated.")).toBeVisible();
  await expect(editor.getByRole("img", { name: "Your rider profile" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open rider menu" }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(editor.getByRole("img", { name: "Your rider profile" })).toBeVisible();
  await editor.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect(editor.getByText("Profile photo removed.")).toBeVisible();
  await expect(editor.getByRole("img", { name: "Your rider profile" })).toHaveCount(0);
  failUpload = true;
  await expect(input).toBeEnabled();
  await input.setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: Buffer.from(pixel, "base64") });
  await expect(editor.getByRole("alert")).toHaveText("Photo upload unavailable. Try again.");
  await expect(editor.getByRole("button", { name: "Save profile", exact: true })).toBeEnabled();
  expect(methods).toContain("DELETE");
  await page.getByRole("button", { name: "Back to request" }).click();
  await expect(page.getByRole("button", { name: "Request ride" })).toBeVisible();
});

test("onboarding remains scrollable in a short mobile viewport", async ({ page }) => {
  await page.route("**/rest/v1/rpc/my_rider_portal", (route) => route.fulfill({ json: {
    tenant, profile: null, serviceAreas: [], bookings: [],
  } }));
  await page.setViewportSize({ width: 320, height: 480 });
  await page.reload();
  await expect(page.locator('input[name="displayName"]')).toBeVisible();
  await expect(page.locator("main")).not.toHaveClass(/rider-home/);
  expect(await page.locator("main").evaluate((element) => getComputedStyle(element).overflowY)).not.toBe("hidden");
  await page.locator('textarea[name="accessibilityNotes"]').scrollIntoViewIfNeeded();
  await expect(page.locator('textarea[name="accessibilityNotes"]')).toBeInViewport();
});

test("donut supports Escape, focus return, outside dismissal and all destinations", async ({ page }) => {
  const toggle = page.getByRole("button", { name: "Open rider menu" });
  await toggle.click();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.getByRole("button", { name: "Request ride" }).click();
  await expect(toggle).toHaveCount(0);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  for (const [label, heading] of [["Trips", "Upcoming and past trips"], ["Payments", "Payment and refund history"], ["Wallet", "ESH trip credit"]]) {
    await toggle.click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(toggle).toBeFocused();
  }
});

test("booking options expand without hiding required scheduling inputs", async ({ page }) => {
  await page.getByRole("button", { name: "Request ride" }).click();
  await page.locator("summary").filter({ hasText: "Change time" }).click();
  await page.getByLabel("When do you need the ride?").selectOption("scheduled");
  await expect(page.getByLabel("Pickup date and time")).toBeVisible();
  await page.getByLabel("When do you need the ride?").selectOption("recurring");
  await expect(page.getByLabel("Start date")).toBeVisible();
  await page.locator("summary").filter({ hasText: "Add a note for your driver" }).click();
  await expect(page.getByLabel("Notes for your driver")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "test-results/rider-home-desktop.png", fullPage: true });
});

test("booking stays at the bottom with an interactive unobscured map", async ({ page }) => {
  await page.getByRole("button", { name: "Request ride" }).click();
  const sheet = page.getByRole("dialog", { name: "Request a ride" });
  await expect(sheet).not.toHaveAttribute("aria-modal", "true");
  const address = await page.locator(".booking-pickup").boundingBox();
  const dropoff = await page.locator(".booking-destination").boundingBox();
  expect(address!.height + dropoff!.height).toBeLessThanOrEqual(150);
  expect(address!.y).toBeGreaterThan(450);
  await expect(page.getByRole("button", { name: "Use my current location" })).toBeInViewport();
  await expect(page.locator('select[name="serviceAreaId"]')).toHaveCount(0);
  expect(await page.locator(".booking-pickup").evaluate((element) => getComputedStyle(element, "::before").content)).toBe('"A"');
  expect(await page.locator(".booking-destination").evaluate((element) => getComputedStyle(element, "::before").content)).toBe('"B"');
  const vehicle = await page.locator(".booking-vehicle").first().boundingBox();
  expect(vehicle!.width).toBeGreaterThanOrEqual(200);
  expect(vehicle!.height).toBeLessThanOrEqual(80);
  await expect(page.getByRole("button", { name: "Review fare", exact: true })).toBeInViewport();
  expect(await sheet.evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe("none");
  await expect(page.getByRole("group", { name: "Vehicle type" })).toBeVisible();
  await page.getByRole("button", { name: "XL", exact: false }).click();
  await expect(page.getByRole("button", { name: "XL", exact: false })).toHaveAttribute("aria-pressed", "true");
  for (const viewport of [{ width: 414, height: 896 }, { width: 1440, height: 900 }, { width: 320, height: 600 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => {
      const box = await sheet.boundingBox();
      return Math.round(box!.y + box!.height);
    }).toBe(viewport.height);
    const bounds = await sheet.boundingBox();
    expect(bounds!.y).toBeGreaterThan(viewport.height * .3);
    expect(bounds!.y + bounds!.height).toBeCloseTo(viewport.height, 0);
    expect(await page.locator(".ride-sheet-backdrop").evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");
    expect(await page.evaluate(() => document.elementFromPoint(200, 200)?.closest('.ride-sheet-backdrop') === null)).toBe(true);
    await page.getByRole("button", { name: "Review fare", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Review fare", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/rider-booking-${viewport.width}.png` });
  }
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

test("expanded options and keyboard viewport keep fields clear of the reserved action", async ({ page }) => {
  await page.getByRole("button", { name: "Request ride" }).click();
  await expect(page.getByPlaceholder("Where are you going?")).toBeInViewport();
  await expect(page.getByLabel("Pickup address", { exact: true })).toBeInViewport();
  await expect(page.locator(".booking-payment summary")).toContainText("Payment");
  await page.screenshot({ path: "test-results/rider-booking-collapsed-414.png" });
  await page.locator("summary").filter({ hasText: "Add a note for your driver" }).click();
  const notes = page.getByLabel("Notes for your driver");
  const action = page.getByRole("button", { name: "Review fare", exact: true });
  async function checkNotes() {
    await notes.scrollIntoViewIfNeeded();
    await expect(notes).toBeInViewport();
    await expect(action).toBeInViewport();
    const fieldBounds = await notes.boundingBox();
    const actionBounds = await action.boundingBox();
    expect(fieldBounds!.y + fieldBounds!.height).toBeLessThanOrEqual(actionBounds!.y - 8);
  }
  await checkNotes();
  await page.locator("summary").filter({ hasText: "Change time" }).click();
  await page.getByLabel("When do you need the ride?").selectOption("scheduled");
  const schedule = page.getByLabel("Pickup date and time");
  await schedule.scrollIntoViewIfNeeded();
  await expect(schedule).toBeInViewport();
  const scheduleBounds = await schedule.boundingBox();
  const reservedAction = await action.boundingBox();
  expect(scheduleBounds!.y + scheduleBounds!.height).toBeLessThan(reservedAction!.y);
  await checkNotes();
  await page.screenshot({ path: "test-results/rider-booking-expanded-414.png" });
  await notes.focus();
  // Emulate the browser visual viewport reduction; no fabricated OS keyboard image.
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, "height", { configurable: true, get: () => 460 });
    viewport.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator(".ride-sheet-backdrop")).toHaveClass(/keyboard-open/);
  await checkNotes();
  const actionBounds = await action.boundingBox();
  expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(460);
  const exitBounds = await page.getByRole("button", { name: "Home", exact: true }).boundingBox();
  const scrollBounds = await page.locator(".booking-scroll").boundingBox();
  expect(exitBounds!.y + exitBounds!.height).toBeLessThan(scrollBounds!.y);
  await notes.fill("Notes remain editable above the action");
  await page.screenshot({ path: "test-results/rider-booking-keyboard-viewport-414.png" });
});

test("destination row tap focuses search and shows the chosen address", async ({ page }) => {
  await page.route("https://api.mapbox.com/search/searchbox/v1/**", (route) => route.fulfill({ json:
    new URL(route.request().url()).pathname.endsWith("/suggest")
      ? { suggestions: [{ mapbox_id: "tap-address", name: "Selected destination", full_address: "Selected destination" }] }
      : { features: [{ geometry: { coordinates: [-96.81, 32.79] }, properties: { full_address: "Selected destination" } }] }
  }));
  await page.getByRole("button", { name: "Request ride" }).click();
  await page.locator(".booking-destination").click({ position: { x: 14, y: 24 } });
  const input = page.getByPlaceholder("Where are you going?");
  await expect(input).toBeFocused();
  await input.fill("Selected destination");
  await page.getByRole("option", { name: "Selected destination" }).click();
  await expect(input).toHaveValue("Selected destination");
  await expect(input).toBeInViewport();
});

test("granted GPS updates the real-coordinate marker without locking map gestures", async ({ page, context }) => {
  await context.setGeolocation({ latitude: 32.78, longitude: -96.8, accuracy: 12 });
  await context.grantPermissions(["geolocation"]);
  await page.reload();
  await expect(page.getByRole("button", { name: "Request ride" })).toBeVisible();
  const marker = page.locator(".rider-current-position");
  await expect(marker).toBeVisible();
  const transform = () => marker.evaluate((element) => element.style.transform);
  await context.setGeolocation({ latitude: 32.7805, longitude: -96.8005, accuracy: 10 });
  await expect(marker).toHaveAttribute("data-latitude", "32.7805");
  await expect(marker).toHaveAttribute("data-longitude", "-96.8005");
  const beforePan = await transform();
  await page.mouse.move(180, 300); await page.mouse.down();
  await page.mouse.move(260, 360, { steps: 10 }); await page.mouse.up();
  await expect.poll(transform).not.toBe(beforePan);
  const beforeZoom = await transform();
  await page.mouse.move(180, 300); await page.mouse.wheel(0, -300);
  await expect.poll(transform).not.toBe(beforeZoom);
  const beforeRotate = await transform();
  await page.mouse.move(180, 300); await page.mouse.down({ button: "right" });
  await page.mouse.move(260, 340, { steps: 10 }); await page.mouse.up({ button: "right" });
  await expect.poll(transform).not.toBe(beforeRotate);
  await page.getByRole("button", { name: "Request ride" }).click();
  await expect.poll(async () => {
    const position = await marker.boundingBox();
    const controls = await page.locator(".booking-pickup").boundingBox();
    return position!.y + position!.height < controls!.y;
  }).toBe(true);
  const attribution = await page.locator(".mapboxgl-ctrl-bottom-left").boundingBox();
  const controls = await page.locator(".booking-pickup").boundingBox();
  expect(attribution!.y + attribution!.height).toBeLessThan(controls!.y);
});

test("denied GPS leaves a service-area map and manual booking available", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, failure) => {
      failure?.({ code: 1, message: "Permission denied" } as GeolocationPositionError);
    };
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Request ride" })).toBeVisible();
  await page.getByRole("button", { name: "Center on my location" }).click();
  await expect(page.getByText("Location unavailable or permission denied.", { exact: false })).toBeVisible();
  await expect(page.locator(".rider-current-position")).toHaveCount(0);
  await page.getByRole("button", { name: "Request ride" }).click();
  await expect(page.getByRole("dialog", { name: "Request a ride" })).toBeVisible();
});

test("pickup location is directly accessible and resolves real supplied GPS coordinates", async ({ page, context }) => {
  await context.setGeolocation({ latitude: 32.78, longitude: -96.8, accuracy: 10 });
  await context.grantPermissions(["geolocation"]);
  await page.route("https://api.mapbox.com/search/geocode/v6/reverse*", (route) => route.fulfill({ json: {
    features: [{ properties: { full_address: "Resolved GPS pickup" } }],
  } }));
  await page.reload();
  await page.getByRole("button", { name: "Request ride" }).click();
  await expect(page.locator(".booking-notes")).not.toHaveAttribute("open", "");
  await page.locator(".booking-pickup").getByRole("button", { name: "Use my current location" }).click();
  await expect(page.getByLabel("Pickup address", { exact: true })).toHaveValue("Resolved GPS pickup");
  await expect(page.locator(".rider-current-position")).toHaveAttribute("data-latitude", "32.78");
  await expect(page.locator('select[name="serviceAreaId"]')).toHaveCount(0);
});

test("saved Home and Work persist, select coordinates, edit and remove without changing recent shortcuts", async ({ page }) => {
  let places: { key: string; label: string; latitude: number; longitude: number }[] = [];
  await page.route("**/rest/v1/rpc/my_rider_saved_places", (route) => route.fulfill({ json: places }));
  await page.route("**/api/places", (route) => {
    const body = route.request().postDataJSON() as { key: string; label: string; latitude: number; longitude: number; riderProfileId: string; tenantSlug: string };
    expect(body.riderProfileId).toBe(profile.riderProfileId);
    expect(body.tenantSlug).toBe(tenant.tenantSlug);
    places = places.filter((place) => place.key !== body.key);
    places.push({ key: body.key, label: body.label, latitude: body.latitude, longitude: body.longitude });
    return route.fulfill({ json: { saved: true } });
  });
  await page.route("**/rest/v1/rpc/remove_my_rider_place", (route) => {
    const body = route.request().postDataJSON() as { place_key_value: string; expected_rider_profile_id: string };
    expect(body.expected_rider_profile_id).toBe(profile.riderProfileId);
    places = places.filter((place) => place.key !== body.place_key_value);
    return route.fulfill({ status: 204 });
  });
  await page.route("https://api.mapbox.com/search/searchbox/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith("/suggest")
      ? { suggestions: [{ mapbox_id: "chosen", name: "Chosen destination", full_address: "Chosen destination" }] }
      : { features: [{ geometry: { coordinates: [-96.81, 32.79] }, properties: { full_address: "Chosen destination" } }] } });
  });
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByLabel("Destination address", { exact: true }).fill("Chosen destination");
  await page.getByRole("option", { name: "Chosen destination" }).click();
  await expect(page.locator(".mapboxgl-marker")).toHaveCount(1);
  await page.getByRole("button", { name: "Save as Home", exact: true }).click();
  await expect(page.getByText("Home saved.", { exact: true })).toBeVisible();
  await page.locator(".saved-place-actions summary").click();
  await page.getByRole("button", { name: "Save as Work", exact: true }).click();
  await expect(page.getByText("Work saved.", { exact: true })).toBeVisible();
  expect(places).toEqual(["home", "work"].map((key) => ({ key, label: "Chosen destination", latitude: 32.79, longitude: -96.81 })));
  await page.getByLabel("Destination address", { exact: true }).fill("Different text");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByLabel("Destination address", { exact: true })).toHaveValue("Chosen destination");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Previous destination", exact: true }).click();
  await expect(page.getByLabel("Destination address", { exact: true })).toHaveValue("Previous destination");
  await expect(page.locator(".mapboxgl-marker")).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole("button", { name: "Work", exact: true })).toHaveAttribute("title", "Chosen destination");
  await page.getByRole("button", { name: "Work", exact: true }).click();
  await expect(page.getByLabel("Destination address", { exact: true })).toHaveValue("Chosen destination");
  await expect(page.locator(".mapboxgl-marker")).toHaveCount(1);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Open rider menu" }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  const savedCard = page.locator(".saved-places-card");
  await expect(savedCard.getByText("Chosen destination", { exact: true })).toHaveCount(2);
  await page.screenshot({ path: "test-results/rider-saved-addresses-414.png", fullPage: true });
  await savedCard.getByRole("button", { name: "Edit Home", exact: true }).click();
  await expect(savedCard.getByLabel("Home address", { exact: true })).toHaveValue("Chosen destination");
  await expect(savedCard.getByRole("button", { name: "Save Home", exact: true })).toBeDisabled();
  await savedCard.getByLabel("Home address", { exact: true }).fill("Changed destination");
  await savedCard.getByRole("option", { name: "Chosen destination" }).click();
  await page.screenshot({ path: "test-results/rider-saved-address-editor-414.png", fullPage: true });
  await savedCard.getByRole("button", { name: "Save Home", exact: true }).click();
  await expect(savedCard.getByText("Home saved.", { exact: true })).toBeVisible();
  await savedCard.getByRole("button", { name: "Remove Home", exact: true }).click();
  await expect(savedCard.getByRole("button", { name: "Add Home", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Home", exact: true })).toHaveAttribute("title", "Save your home destination");
});

test("saved address network failures remain recoverable without false success", async ({ page }) => {
  await page.route("**/rest/v1/rpc/my_rider_saved_places", (route) => route.fulfill({ status: 503, json: { message: "Fixture unavailable" } }));
  await page.reload();
  await page.getByRole("button", { name: "Open rider menu" }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  const savedCard = page.locator(".saved-places-card");
  await expect(savedCard.getByRole("alert")).toContainText("could not be loaded");
  await page.route("**/rest/v1/rpc/my_rider_saved_places", (route) => route.fulfill({ json: [{ key: "home", label: "Fixture address", latitude: 32.79, longitude: -96.81 }] }));
  await savedCard.getByRole("button", { name: "Refresh saved addresses" }).click();
  await expect(savedCard.getByText("Fixture address", { exact: true })).toBeVisible();
  await page.route("**/rest/v1/rpc/remove_my_rider_place", (route) => route.fulfill({ status: 503, json: { message: "Fixture unavailable" } }));
  await savedCard.getByRole("button", { name: "Remove Home", exact: true }).click();
  await expect(savedCard.getByRole("alert")).toContainText("could not be updated");
  await expect(savedCard.getByText("Fixture address", { exact: true })).toBeVisible();
  await expect(savedCard.getByText("Home removed.", { exact: true })).toHaveCount(0);
});

test("saved addresses ignore a late response after switching providers", async ({ page }) => {
  const otherTenant = { ...tenant, tenantSlug: "other-provider", displayName: "Other provider" };
  const otherProfile = { ...profile, riderProfileId: "other-rider" };
  await page.route("**/rest/v1/rpc/list_rider_booking_tenants", (route) => route.fulfill({ json: [
    { tenant_slug: tenant.tenantSlug, display_name: tenant.displayName },
    { tenant_slug: otherTenant.tenantSlug, display_name: otherTenant.displayName },
  ] }));
  await page.route("**/rest/v1/rpc/my_rider_portal", (route) => {
    const body = route.request().postDataJSON() as { target_tenant_slug: string };
    return route.fulfill({ json: { tenant: body.target_tenant_slug === otherTenant.tenantSlug ? otherTenant : tenant,
      profile: body.target_tenant_slug === otherTenant.tenantSlug ? otherProfile : profile, serviceAreas: [], bookings: [] } });
  });
  let releaseOld = () => {};
  const oldResponse = new Promise<void>((resolve) => { releaseOld = resolve; });
  let oldRequested = false, oldFinished = false;
  await page.route("**/rest/v1/rpc/my_rider_saved_places", async (route) => {
    const body = route.request().postDataJSON() as { target_tenant_slug: string };
    if (body.target_tenant_slug === tenant.tenantSlug) {
      oldRequested = true; await oldResponse;
      await route.fulfill({ json: [{ key: "home", label: "Previous provider private address", latitude: 32.79, longitude: -96.81 }] });
      oldFinished = true;
    } else await route.fulfill({ json: [{ key: "work", label: "Current provider address", latitude: 32.80, longitude: -96.82 }] });
  });
  await page.reload();
  await expect.poll(() => oldRequested).toBe(true);
  await page.getByRole("button", { name: "Open rider menu" }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByLabel("Transportation provider", { exact: true }).selectOption(otherTenant.tenantSlug);
  const savedCard = page.locator(".saved-places-card");
  await expect(savedCard.getByText("Current provider address", { exact: true })).toBeVisible();
  releaseOld(); await expect.poll(() => oldFinished).toBe(true);
  await expect(savedCard.getByText("Previous provider private address", { exact: true })).toHaveCount(0);
  await expect(savedCard.getByText("Current provider address", { exact: true })).toBeVisible();
});

test("trip options, verified addresses and quoted fare retain the checkout contract", async ({ page }) => {
  // Isolated contract fixtures only; this test never charges or creates a real trip.
  await page.route("https://api.mapbox.com/search/searchbox/v1/**", (route) => route.fulfill({ json:
    new URL(route.request().url()).pathname.endsWith("/suggest")
      ? { suggestions: [{ mapbox_id: "contract-address", name: "Contract address", full_address: "Contract address" }] }
      : { features: [{ geometry: { coordinates: [-96.81, 32.79] }, properties: { full_address: "Contract address" } }] }
  }));
  let quoteRequest: Record<string, unknown> | undefined;
  let checkoutRequest: Record<string, unknown> | undefined;
  await page.route("**/api/pricing/quote", (route) => {
    quoteRequest = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ json: { quoteId: "contract-quote", fareAmountMinor: 2500, currencyCode: "USD", fractionDigits: 2,
      expiresAt: new Date(Date.now() + 900000).toISOString(), pickupAddress: "Contract address", destinationAddress: "Contract address",
      routeDistanceMeters: 6400, routeDurationSeconds: 900, farePolicy: "guaranteed_upfront", maximumFareMinor: null } });
  });
  await page.route("**/api/payments/checkout", (route) => {
    checkoutRequest = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ status: 400, json: { message: "Checkout contract verified; no payment submitted." } });
  });
  await page.getByRole("button", { name: "Request ride" }).click();
  await page.locator("summary").filter({ hasText: "Add a note for your driver" }).click();
  await page.getByLabel("Notes for your driver").fill("Contract test notes");
  await page.locator("summary").filter({ hasText: "Add a note for your driver" }).click();
  for (const label of ["Pickup address", "Destination address"]) {
    await page.getByLabel(label, { exact: true }).fill("Contract address");
    const field = page.locator(label === "Pickup address" ? ".booking-pickup" : ".booking-destination");
    await field.getByRole("option", { name: "Contract address" }).click();
    await expect(field.locator(".address-selected")).toHaveCount(1);
  }
  await page.getByRole("button", { name: "XL", exact: false }).click();
  await page.getByRole("button", { name: "Review fare", exact: true }).click();
  await expect(page.getByRole("button", { name: "Apply wallet and continue" })).toBeVisible();
  expect(quoteRequest?.serviceType).toBe("larger");
  await expect(page.getByRole("button", { name: "XL", exact: false })).toContainText("$25.00");
  await page.locator(".booking-payment summary").click();
  await expect(page.getByText("Choose your payment method securely", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Apply wallet and continue" }).click();
  await expect.poll(() => checkoutRequest?.quoteId).toBe("contract-quote");
  expect(checkoutRequest?.bookingNotes).toBe("Contract test notes");
  expect(checkoutRequest?.serviceType).toBe("larger");
});
