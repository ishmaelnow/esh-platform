import { expect, test } from "@playwright/test";

const tenant = { tenantId: "11111111-1111-4111-8111-111111111111", tenantSlug: "rider-preview", displayName: "Preview rides" };
const profile = { riderProfileId: "preview-rider", displayName: "Preview Rider", email: "rider-preview@example.invalid", phone: null, accessibilityNotes: null, status: "active" };

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
  await page.route("https://api.mapbox.com/**", (route) => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#f7f7f2" } }] } }));
  await page.route("**/rest/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const name = path.split("/").pop();
    const responses: Record<string, unknown> = {
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

test("search, session Home, and recent shortcuts select real coordinate destinations", async ({ page }) => {
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
  await page.getByRole("button", { name: "Save as Home for this session" }).click();
  await page.getByLabel("Destination address", { exact: true }).fill("Different text");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByLabel("Destination address", { exact: true })).toHaveValue("Chosen destination");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Previous destination", exact: true }).click();
  await expect(page.getByLabel("Destination address", { exact: true })).toHaveValue("Previous destination");
  await expect(page.locator(".mapboxgl-marker")).toHaveCount(2);
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
