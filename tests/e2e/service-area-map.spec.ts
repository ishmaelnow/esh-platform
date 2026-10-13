import { expect, test } from "@playwright/test";

test("saved service-area boundaries display on an interactive map without modifying coverage", async ({ page }) => {
  await page.setViewportSize({ width: 414, height: 896 });
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const person = { person_id: "preview-person", auth_user_id: "preview", display_name: "TEST Admin", primary_email: "coverage@example.invalid", status: "active" };
  const tenant = { tenant_id: tenantId, status: "active" }, configuration = { tenant_id: tenantId, display_name: "TEST Coverage", legal_name: "TEST company", default_time_zone: "America/Chicago" };
  const membership = { membership_id: "preview-membership", tenant_id: tenantId, person_id: person.person_id, status: "active" };
  const areas = [
    { service_area_id: "test-dallas", tenant_id: tenantId, name: "TEST Dallas", description: "TEST area", center_latitude: 32.7767, center_longitude: -96.797, radius_km: 25, status: "active", coverage_mode: "all_drivers" },
    { service_area_id: "test-phl", tenant_id: tenantId, name: "TEST Philadelphia", description: null, center_latitude: 39.9526, center_longitude: -75.1652, radius_km: 40, status: "inactive", coverage_mode: "selected_drivers" },
  ];
  const writes: string[] = [];
  let failMap = false;
  await page.addInitScript(() => localStorage.setItem("esh-transportation-admin-auth", JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcmV2aWV3In0.preview", refresh_token: "preview-only", token_type: "bearer", expires_at: Math.floor(Date.now()/1000)+3600, user: { id: "preview", email: "coverage@example.invalid", aud: "authenticated", role: "authenticated" } })));
  await page.route("https://api.mapbox.com/**", (route) => failMap ? route.fulfill({ status: 503, json: {} })
    : route.fulfill({ json: { version: 8, sources: { attribution: { type: "geojson", attribution: "TEST map attribution", data: { type: "FeatureCollection", features: [] } } }, layers: [{ id: "background", type: "background", paint: { "background-color": "#f7f7f2" } }, { id: "attribution", type: "circle", source: "attribution" }] } }));
  // Only the basemap provider is isolated; real geographic circle math is tested independently.
  await page.route("https://support-preview.invalid/**", (route) => {
    const url = new URL(route.request().url()), name = url.pathname.split("/").pop();
    if (url.pathname.startsWith("/auth/")) return route.fulfill({ json: { user: { id: "preview", email: person.primary_email } } });
    const values: Record<string, unknown> = {
      person_profiles: person, tenants: url.searchParams.get("tenant_id")?.startsWith("eq.") ? tenant : [tenant],
      tenant_configurations: url.searchParams.get("tenant_id")?.startsWith("eq.") ? configuration : [configuration], tenant_memberships: [membership], active_tenant_preferences: null,
      tenant_role_assignments: [{ ...membership, role_key: "tenant_owner" }], has_workspace_role: true, has_active_product_session: true, tenant_member_directory: [],
      tenant_capabilities: [{ tenant_id: tenantId, capability_key: "driver.management", enabled: true }], service_areas: areas,
    };
    return route.fulfill({ json: values[name ?? ""] ?? [] });
  });
  await page.route("**/api/tenant-admin/settings**", (route) => { writes.push(route.request().method()); return route.fulfill({ status: 500 }); });
  await page.goto("/transportation");
  await page.getByRole("button", { name: "Service Areas", exact: true }).click();
  const region = page.getByRole("region", { name: "Coverage map", exact: true });
  const map = region.getByLabel("Service area coverage map");
  await expect(map).toHaveAttribute("data-map-ready", "true", { timeout: 25000 });
  await region.getByLabel("Coverage area", { exact: true }).selectOption("test-dallas");
  await expect(map).toHaveAttribute("data-map-ready", "true");
  await expect(region.getByRole("combobox")).toHaveValue("test-dallas");
  const initial = await map.getAttribute("data-camera");
  await region.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(() => map.getAttribute("data-camera")).not.toBe(initial);
  const beforeDrag = await map.getAttribute("data-camera");
  await map.scrollIntoViewIfNeeded(); const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + 130, box.y + 160); await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 190, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => map.getAttribute("data-camera")).not.toBe(beforeDrag);
  await expect(region.locator(".mapboxgl-ctrl-attrib")).toBeVisible();
  await region.getByLabel("Coverage area", { exact: true }).selectOption("test-phl");
  await expect(map).toHaveAttribute("data-map-ready", "true");
  await region.getByLabel("Coverage area", { exact: true }).selectOption("test-dallas");
  await expect(map).toHaveAttribute("data-camera", /^-96\.79700,/);
  await page.screenshot({ path: "test-results/admin-coverage-map-414.png", fullPage: true });
  await region.getByLabel("Coverage area", { exact: true }).selectOption("test-phl");
  await expect(map).toHaveAttribute("data-map-ready", "true");
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll("body *")).filter((el) => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map((el) => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right }))))).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "test-results/admin-coverage-map-desktop.png", fullPage: true });
  expect(writes).toEqual([]);
  failMap = true; await region.getByLabel("Coverage area", { exact: true }).selectOption("");
  await expect(region.getByText("Coverage map unavailable.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "TEST Dallas", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true }).first()).toBeEnabled();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await expect(page.getByRole("spinbutton", { name: "Radius (km)", exact: true })).toHaveValue("25");
  await expect(page.getByRole("spinbutton", { name: "Radius (km)", exact: true })).toBeFocused();
  await expect(page.getByRole("spinbutton", { name: "Radius (km)", exact: true })).toBeInViewport();
  await expect(page.getByRole("heading", { name: "Edit service area: TEST Dallas", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel edit", exact: true }).click();
  await page.setViewportSize({ width: 414, height: 896 });
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  const radius = page.getByRole("spinbutton", { name: "Radius (km)", exact: true });
  await expect(radius).toBeFocused(); await expect(radius).toBeInViewport();
  await expect(page.getByRole("button", { name: "Save service area", exact: true })).toBeInViewport();
  await radius.fill("35");
  await page.screenshot({ path: "test-results/admin-coverage-edit-414.png", fullPage: true });
  await page.getByRole("button", { name: "Cancel edit", exact: true }).click();
  expect(writes).toEqual([]);
  failMap = false; await region.getByRole("button", { name: "Retry coverage map", exact: true }).click();
  await expect(map).toHaveAttribute("data-map-ready", "true");
});
