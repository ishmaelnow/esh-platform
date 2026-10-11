import { expect, test } from "@playwright/test";

for (const reporter of ["rider", "driver"] as const) {
test(`Transportation ${reporter} support queue safely reviews reports and preserves failed responses`, async ({ page }) => {
  await page.setViewportSize({ width: 414, height: 896 });
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const person = { person_id: "preview-person", auth_user_id: "preview", display_name: "Test Admin", primary_email: "support-preview@example.invalid", status: "active" };
  const tenant = { tenant_id: tenantId, status: "active" };
  const configuration = { tenant_id: tenantId, display_name: "Support preview", legal_name: "Test company", default_time_zone: "America/Chicago" };
  const membership = { membership_id: "preview-membership", tenant_id: tenantId, person_id: person.person_id, status: "active" };
  const report = { caseId: "preview-case", bookingId: "preview-booking", category: "lost_item", description: "TEST lost blue bag <script>no execution</script>",
    status: "open", response: "", version: 1, riderName: "Test Rider", driverName: "Test Driver", pickupAddress: "Test pickup", destinationAddress: "Test destination",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updates: [] as { status: string; response: string; createdAt: string }[] };
  let fail = true;
  const reviews: Record<string, unknown>[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("esh-transportation-admin-auth", JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcmV2aWV3In0.preview",
      refresh_token: "preview-only", token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "preview", email: "support-preview@example.invalid", aud: "authenticated", role: "authenticated" } }));
  });
  await page.route("https://support-preview.invalid/**", (route) => {
    const url = new URL(route.request().url());
    const name = url.pathname.split("/").pop();
    if (url.pathname.startsWith("/auth/")) return route.fulfill({ json: { user: { id: "preview", email: person.primary_email } } });
    if (name === (reporter === "driver" ? "admin_driver_trip_support" : "admin_trip_support")) {
      const body = route.request().postDataJSON() as { status_value: string };
      const rows = body.status_value === "all" || body.status_value === report.status ? [report] : [];
      return route.fulfill({ json: { cases: rows, total: rows.length } });
    }
    if (name === (reporter === "driver" ? "review_driver_trip_support" : "review_trip_support")) {
      const body = route.request().postDataJSON() as Record<string, unknown>; reviews.push(body);
      if (fail) { fail = false; return route.abort("failed"); }
      report.status = String(body.status_value); report.response = String(body.response_value); report.version++;
      report.updates.push({ status: report.status, response: report.response, createdAt: new Date().toISOString() });
      return route.fulfill({ json: true });
    }
    const values: Record<string, unknown> = {
      person_profiles: person, tenants: url.searchParams.has("tenant_id") && url.searchParams.get("tenant_id")?.startsWith("eq.") ? tenant : [tenant],
      tenant_configurations: url.searchParams.get("tenant_id")?.startsWith("eq.") ? configuration : [configuration],
      tenant_memberships: [membership], active_tenant_preferences: null,
      tenant_role_assignments: [{ ...membership, role_key: "tenant_owner" }],
      has_workspace_role: true, has_active_product_session: true, tenant_member_directory: [],
      tenant_capabilities: [{ tenant_id: tenantId, capability_key: "driver.management", enabled: true }],
    };
    return route.fulfill({ json: values[name ?? ""] ?? [] });
  });
  await page.goto("/transportation");
  await page.getByRole("button", { name: "Trip support", exact: true }).click();
  if (reporter === "driver") await page.getByLabel("Reports from").selectOption("driver");
  const replyLabel = reporter === "driver" ? "Reply to Driver" : "Reply to Rider";
  await expect(page.getByRole("heading", { name: "Lost item · Received" })).toBeVisible();
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("in_review");
  await page.getByLabel(replyLabel).fill("TEST checking with your Driver");
  await page.getByRole("button", { name: "Save response" }).click();
  await expect(page.locator(".support-review").getByRole("alert")).toContainText("could not be confirmed");
  await expect(page.getByLabel(replyLabel)).toHaveValue("TEST checking with your Driver");
  await page.getByRole("button", { name: "Save response" }).click();
  await expect(page.getByRole("heading", { name: "Lost item · Under review" })).toBeVisible();
  expect(reviews[0]).toEqual(reviews[1]);
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("resolved");
  await page.getByLabel(replyLabel).fill("TEST bag returned to Rider");
  await page.getByRole("button", { name: "Save response" }).click();
  await expect(page.getByRole("heading", { name: "Lost item · Resolved" })).toBeVisible();
  await page.locator(".support-review").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/admin-${reporter}-trip-support-414.png`, fullPage: true });
  await page.getByLabel("Report status").selectOption("open");
  await expect(page.getByText("No reports in this view.")).toBeVisible();
  await page.setViewportSize({ width: 414, height: 520 });
  await page.getByLabel("Report status").selectOption("resolved");
  await page.getByLabel(replyLabel).focus();
  await page.getByRole("button", { name: "Save response" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Save response" })).toBeInViewport();
});
}
