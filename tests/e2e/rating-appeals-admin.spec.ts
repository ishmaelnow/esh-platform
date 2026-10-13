import { expect, test } from "@playwright/test";
for (const reporter of ["rider", "driver"] as const) {
test(`Transportation reviews ${reporter} rating appeals with failure recovery and confirmed decisions`, async ({ page }) => {
  await page.setViewportSize({ width: 414, height: 896 });
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const person = { person_id: "preview-person", auth_user_id: "preview", display_name: "Test Admin", primary_email: "support-preview@example.invalid", status: "active" };
  const tenant = { tenant_id: tenantId, status: "active" }, configuration = { tenant_id: tenantId, display_name: "Review preview", legal_name: "Test company", default_time_zone: "America/Chicago" };
  const membership = { membership_id: "preview-membership", tenant_id: tenantId, person_id: person.person_id, status: "active" };
  const row = { appealId: "TEST appeal", bookingId: "TEST booking", status: "submitted", reason: "TEST this rating needs review <script>no execution</script>",
    resolutionNotes: null as string | null, submittedAt: new Date().toISOString(), resolvedAt: null as string | null, appellantType: reporter, overall: 2, comment: "TEST received rating comment" };
  let fail = true;
  const decisions: unknown[] = [];
  await page.addInitScript(() => localStorage.setItem("esh-transportation-admin-auth", JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcmV2aWV3In0.preview", refresh_token: "preview-only", token_type: "bearer", expires_at: Math.floor(Date.now()/1000)+3600, user: { id: "preview", email: "support-preview@example.invalid", aud: "authenticated", role: "authenticated" } })));
  await page.route("https://support-preview.invalid/**", (route) => {
    const url = new URL(route.request().url()), name = url.pathname.split("/").pop();
    if (url.pathname.startsWith("/auth/")) return route.fulfill({ json: { user: { id: "preview", email: person.primary_email } } });
    if (name === "admin_rating_appeals") {
      const body = route.request().postDataJSON() as { tenant_value: string; status_value: string };
      expect(body.tenant_value).toBe(tenantId);
      const rows = body.status_value === "all" || body.status_value === row.status ? [row] : [];
      return route.fulfill({ json: { total: rows.length, appeals: rows } });
    }
    if (name === "resolve_trip_rating_appeal") {
      const body = route.request().postDataJSON() as Record<string, unknown>; decisions.push(body);
      if (fail) { fail = false; return route.fulfill({ status: 503, json: {} }); }
      row.status = String(body.resolution_value); row.resolutionNotes = String(body.resolution_notes_value); row.resolvedAt = new Date().toISOString();
      return route.fulfill({ json: true });
    }
    const values: Record<string, unknown> = {
      person_profiles: person, tenants: url.searchParams.get("tenant_id")?.startsWith("eq.") ? tenant : [tenant],
      tenant_configurations: url.searchParams.get("tenant_id")?.startsWith("eq.") ? configuration : [configuration], tenant_memberships: [membership], active_tenant_preferences: null,
      tenant_role_assignments: [{ ...membership, role_key: "tenant_owner" }], has_workspace_role: true, has_active_product_session: true, tenant_member_directory: [],
      tenant_capabilities: [{ tenant_id: tenantId, capability_key: "driver.management", enabled: true }],
    };
    return route.fulfill({ json: values[name ?? ""] ?? [] });
  });
  await page.goto("/transportation");
  await page.getByRole("button", { name: "Reputation", exact: true }).click();
  const queue = page.getByRole("region", { name: "Rating review queue" });
  await expect(queue.getByText(row.reason, { exact: true })).toBeVisible();
  await expect(queue.getByRole("button", { name: "Save rating decision" })).toBeDisabled();
  await queue.getByRole("combobox", { name: "Decision", exact: true }).selectOption(reporter === "rider" ? "removed" : "upheld");
  await queue.getByLabel("Explanation to requester").fill("TEST the company reviewed this rating");
  await queue.getByRole("button", { name: "Save rating decision" }).click();
  await expect(queue.getByRole("alert")).toContainText("could not be confirmed");
  await expect(queue.getByLabel("Explanation to requester")).toHaveValue("TEST the company reviewed this rating");
  await queue.getByRole("button", { name: "Save rating decision" }).click();
  await expect(queue.getByText("No rating reviews in this view.")).toBeVisible();
  expect(decisions[0]).toEqual(decisions[1]);
  await queue.getByLabel("Review status").selectOption("all");
  await expect(queue.getByText("TEST the company reviewed this rating", { exact: false })).toBeVisible();
  await expect(queue.getByRole("button", { name: "Save rating decision" })).toHaveCount(0);
  await page.screenshot({ path: `test-results/admin-${reporter}-rating-review-414.png`, fullPage: true });
  await page.setViewportSize({ width: 320, height: 520 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
}
