import { expect, test, type Page } from "@playwright/test";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { setupDriverPreview } = require("../fixtures/driver-preview.cjs") as { setupDriverPreview: (page: Page, options?: { applicant?: boolean }) => Promise<void> };

const files = ["personalPhoto", "vehiclePhoto", "document", "insurance"];
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCFAB//2Q==", "base64");
const application = (status = "submitted", missing = false) => ({
  applicationId: "fixture-application", tenantSlug: "fixture-company", companyName: "Fixture transport company",
  fullName: "Fixture applicant", phone: null, status, submittedAt: "2026-10-02T12:00:00Z",
  documents: missing ? [] : ["personal_photo", "vehicle_photo", "reference_document", "insurance"].map((type) => ({ type, status: type === "insurance" ? "awaiting_vehicle" : "pending", fileName: `${type}.jpg`, reviewNotes: null })),
});

async function setupApplicant(page: Page, records: ReturnType<typeof application>[] = []) {
  await page.setViewportSize({ width: 414, height: 896 });
  await setupDriverPreview(page);
  await page.route("**/rest/v1/rpc/activate_my_driver_account", (route) => route.fulfill({ status: 400, json: { message: "An approved application is required" } }));
  await page.route("**/rest/v1/rpc/list_transport_application_tenants", (route) => route.fulfill({ json: [{ tenant_slug: "fixture-company", display_name: "Fixture transport company" }] }));
  await page.route("**/api/applications/driver", (route) => route.fulfill({ json: { applications: records } }));
  await page.goto("/");
  await expect(page.getByLabel("Transportation company")).toBeVisible();
}

test("new applicant verifies email within Driver with the existing Driver return URL", async ({ page }) => {
  await setupDriverPreview(page);
  await page.addInitScript(() => localStorage.removeItem("esh-driver-portal-auth"));
  await page.goto("/");
  const submissions: Array<{ create_user: boolean; url: string }> = [];
  await page.route("**/auth/v1/otp**", (route) => {
    submissions.push({ create_user: (route.request().postDataJSON() as { create_user: boolean }).create_user, url: route.request().url() });
    return route.fulfill({ json: {} });
  });
  await page.getByLabel("Application email").fill("fixture-new@example.invalid");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect.poll(() => submissions.length).toBe(1); expect(submissions[0]!.create_user).toBe(false);
  await page.getByRole("button", { name: "New driver? Apply to drive" }).click();
  await page.getByRole("button", { name: "Verify email to apply" }).click();
  await expect.poll(() => submissions.length).toBe(2); expect(submissions[1]!.create_user).toBe(true);
  const redirect = new URL(submissions[1]!.url).searchParams.get("redirect_to");
  expect(new URL(redirect!).origin).toBe(new URL(page.url()).origin);
  expect(redirect).not.toContain("admin.eshapp.com"); expect(redirect).not.toContain("rider.eshapp.com");
  await page.screenshot({ path: "test-results/driver-apply-verify-414.png" });
});

test("application entry uploads files, shows confirmed status and survives reload", async ({ page }) => {
  await setupApplicant(page);
  let submitted = false;
  await page.route("**/api/applications/driver", (route) => {
    if (route.request().method() === "POST") { submitted = true; return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ json: { applications: submitted ? [application()] : [] } });
  });
  await page.getByLabel("Full name").fill("Fixture applicant");
  await expect(page.getByLabel("Vehicle registration document")).toBeVisible();
  await expect(page.getByLabel("Reference document", { exact: true })).toHaveCount(0);
  for (const field of files) await page.locator(`input[name="${field}"]`).setInputFiles({ name: `${field}.jpg`, mimeType: "image/jpeg", buffer: jpeg });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(414);
  await page.screenshot({ path: "test-results/driver-apply-form-414.png", fullPage: true });
  await page.getByRole("button", { name: "Submit application", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Application received" })).toBeVisible();
  await expect(page.getByText(/Received; awaiting vehicle assignment and review/)).toBeVisible();
  expect(submitted).toBe(true);
  await expect(page.getByRole("switch", { name: "Driver availability" })).toHaveCount(0);
  await expect(page.getByLabel("Full name")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Application received" })).toBeVisible();
  await page.screenshot({ path: "test-results/driver-apply-status-414.png", fullPage: true });
});

test("switching tabs and same-user auth recovery preserve all application inputs", async ({ page, context }) => {
  await setupApplicant(page);
  await page.getByLabel("Full name").fill("Tab return applicant");
  await page.getByLabel("Phone (optional)").fill("2025550123");
  for (const field of files) await page.locator(`input[name="${field}"]`).setInputFiles({ name: `${field}.jpg`, mimeType: "image/jpeg", buffer: jpeg });
  const otherTab = await context.newPage();
  await otherTab.goto("about:blank");
  await otherTab.bringToFront();
  await page.bringToFront();
  // Supabase recovers the existing session on visibility return and emits SIGNED_IN.
  // Wait for a delayed activation if the page mistakenly re-runs that check.
  let repeatedActivations = 0;
  await page.route("**/rest/v1/rpc/activate_my_driver_account", async (route) => {
    repeatedActivations++;
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({ status: 400, json: { message: "An approved application is required" } });
  });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByLabel("Full name")).toHaveValue("Tab return applicant");
  await expect.poll(async () => {
    // Allow auth recovery and React's resulting effects to finish before checking file inputs.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
    return page.locator('input[name="insurance"]').evaluate((input: HTMLInputElement) => input.files?.[0]?.name);
  }).toBe("insurance.jpg");
  await expect(page.getByLabel("Phone (optional)")).toHaveValue("2025550123");
  await expect(page.getByLabel("Transportation company")).toHaveValue("fixture-company");
  for (const field of files) expect(await page.locator(`input[name="${field}"]`).evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe(`${field}.jpg`);
  expect(repeatedActivations).toBe(0);
  await otherTab.close();
});

test("insurance is required and a legacy three-file application requests only the missing insurance", async ({ page }) => {
  const legacy = application(); legacy.documents = legacy.documents.filter((item) => item.type !== "insurance");
  await setupApplicant(page, [legacy]);
  await expect(page.getByRole("heading", { name: "Finish your application" })).toBeVisible();
  await expect(page.getByLabel("Vehicle insurance document")).toHaveAttribute("required", "");
  await expect(page.locator("input[type=file]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Complete application" })).toBeVisible();
});

test("review and declined states do not grant Driver access or invite duplicate submission", async ({ page }) => {
  await setupApplicant(page, [application("under_review")]);
  await expect(page.getByRole("heading", { name: "Under review" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit application", exact: true })).toHaveCount(0);
  await page.route("**/api/applications/driver", (route) => route.fulfill({ json: { applications: [application("rejected")] } }));
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByRole("heading", { name: "Application declined" })).toBeVisible();
  await expect(page.getByText("Contact the company about its decision and your next steps.")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Driver availability" })).toHaveCount(0);
});

test("status failure fails closed and retry restores the application form", async ({ page }) => {
  await setupApplicant(page);
  await page.route("**/api/applications/driver", (route) => route.fulfill({ status: 503, json: { message: "Fixture status unavailable" } }));
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.locator(".driver-application").getByRole("alert")).toContainText("Fixture status unavailable");
  await expect(page.getByRole("button", { name: "Submit application", exact: true })).toHaveCount(0);
  await page.route("**/api/applications/driver", (route) => route.fulfill({ json: { applications: [] } }));
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByLabel("Full name")).toBeVisible();
});

test("legacy incomplete submission exposes missing files without duplicating the application", async ({ page }) => {
  await setupApplicant(page, [application("submitted", true)]);
  await expect(page.getByRole("heading", { name: "Finish your application" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete application" })).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveCount(0);
  for (const field of files) await expect(page.locator(`input[name="${field}"]`)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 600 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole("button", { name: "Complete application" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Complete application" })).toBeInViewport();
  await page.screenshot({ path: "test-results/driver-apply-incomplete-320.png", fullPage: true });
});

test("approval uses the existing server activation and portal lifecycle", async ({ page }) => {
  await setupApplicant(page, [application("under_review")]);
  await page.route("**/api/applications/driver", (route) => route.fulfill({ json: { applications: [application("approved")] } }));
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByRole("heading", { name: "Application approved" })).toBeVisible();
  await page.unroute("**/rest/v1/rpc/activate_my_driver_account");
  await page.getByRole("button", { name: "Continue to Driver account" }).click();
  await expect(page.getByRole("switch", { name: "Driver availability" })).toBeEnabled();
});

test("manual applicant preview supports local upload receipt and reduced keyboard viewport", async ({ page }) => {
  await page.setViewportSize({ width: 414, height: 896 });
  await setupDriverPreview(page, { applicant: true });
  await page.goto("/");
  await page.getByLabel("Full name").fill("Manual preview applicant");
  // Reduced viewport approximates keyboard occlusion; physical keyboard/safe-area behavior is manual.
  await page.setViewportSize({ width: 414, height: 480 });
  await page.getByLabel("Phone (optional)").focus();
  for (const field of files) await page.locator(`input[name="${field}"]`).setInputFiles({ name: `${field}.jpg`, mimeType: "image/jpeg", buffer: jpeg });
  await page.getByRole("button", { name: "Submit application", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Submit application", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(414);
  await page.screenshot({ path: "test-results/driver-apply-short-414.png", fullPage: true });
  await page.getByRole("button", { name: "Submit application", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Application received" })).toBeVisible();
  await expect(page.getByText("Manual preview applicant · Application preview company")).toBeVisible();
});
