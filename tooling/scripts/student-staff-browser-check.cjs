// Disposable intercepted TEST fixtures only. No production accounts, emails or database calls.
const { chromium } = require("@playwright/test");
const { spawn } = require("node:child_process");
const path = require("node:path"),
  fs = require("node:fs/promises"),
  assert = require("node:assert/strict");
async function main() {
  const origin = "http://127.0.0.1:3012",
    authOrigin = "http://127.0.0.1:54321";
  const actor = "00000000-0000-0000-0000-000000000013",
    tenant = "00000000-0000-0000-0000-000000000001",
    other = "00000000-0000-0000-0000-000000000002";
  const child = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3012"],
    {
      cwd: path.resolve(__dirname, "../../apps/student-transportation"),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.resume();
  child.stderr.resume();
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        ready = (await fetch(origin)).ok;
      } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready);
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let releaseConfigure;
    let otpTarget,
      failed = false,
      admitted = true,
      tableCalls = 0;
    const user = {
      id: actor,
      aud: "authenticated",
      email: "TEST-reviewer@example.invalid",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    };
    await context.route(authOrigin + "/**", (route) => {
      const url = new URL(route.request().url()),
        name = url.pathname.split("/").pop();
      if (name === "otp") {
        otpTarget = url.searchParams.get("redirect_to");
        assert.equal(route.request().postDataJSON().create_user, false);
        return route.fulfill({ json: {} });
      }
      if (name === "user") return route.fulfill({ json: user });
      if (name === "logout") return route.fulfill({ status: 204 });
      if (name === "configure_student_enrollment_program")
        return new Promise((resolve) => {
          releaseConfigure = () => resolve(route.fulfill({ json: true }));
        });
      if (name === "my_student_enrollment_context")
        return failed
          ? route.fulfill({
              status: 401,
              json: { code: "PGRST301", message: "TEST PRIVATE TOKEN DETAIL" },
            })
          : route.fulfill({
              json: {
                personId: actor,
                programs: admitted
                  ? [
                      {
                        tenantId: other,
                        name: "TEST OTHER BUSINESS",
                        canConfigure: true,
                        canReview: false,
                        canEnroll: false,
                        enrollmentEnabled: false,
                      },
                      {
                        tenantId: tenant,
                        name: "TEST EDUCATION",
                        canConfigure: true,
                        canReview: true,
                        canEnroll: true,
                        enrollmentEnabled: true,
                      },
                    ]
                  : [],
              },
            });
      if (name === "student_transportation_requests") {
        tableCalls++;
        return route.fulfill({
          json:
            url.searchParams.get("tenant_id") === "eq." + tenant
              ? [
                  {
                    request_id: "00000000-0000-0000-0000-000000000070",
                    tenant_id: tenant,
                    customer_id: "00000000-0000-0000-0000-000000000050",
                    destination_address: "TEST PRIVATE DESTINATION",
                    scheduled_at: "2027-01-12T12:00:00Z",
                    status: "submitted",
                    geography_status: "unverified",
                    students: [{ name: "TEST PRIVATE STUDENT", pickupAddress: "TEST HOME" }],
                  },
                ]
              : [],
        });
      }
      if (
        [
          "student_transportation_customers",
          "student_transportation_customer_invitations",
          "student_transportation_students",
          "student_transportation_contacts",
        ].includes(name)
      )
        return route.fulfill({ json: [] });
      throw Error("Unexpected fixture request: " + url.pathname);
    });
    await page.goto(origin + "/clients");
    await page.getByRole("heading", { name: "Staff portal", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/admin");
    await page.getByLabel("Email address", { exact: true }).fill(user.email);
    await page.getByRole("button", { name: "Email me a secure link", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Check your email" }).waitFor();
    assert.equal(otpTarget, origin + "/admin");
    const now = Math.floor(Date.now() / 1000);
    const token = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(
        JSON.stringify({ sub: actor, aud: "authenticated", exp: now + 3600, iat: now }),
      ).toString("base64url"),
      "TEST-SIGNATURE",
    ].join(".");
    await page.goto("about:blank"); // Email verification returns in a new document, not a hash-only navigation.
    await page.goto(
      origin +
        "/admin#" +
        new URLSearchParams({
          access_token: token,
          refresh_token: "TEST-REFRESH",
          token_type: "bearer",
          expires_in: "3600",
          type: "magiclink",
        }),
    );
    await page.getByText("Signed in as " + user.email, { exact: true }).waitFor();
    await page.getByText("TEST PRIVATE DESTINATION", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Operating business", { exact: true }).inputValue(), tenant);
    assert.equal(await page.getByRole("button", { name: "Sign out", exact: true }).count(), 1);
    assert.equal(await page.getByLabel("Operating business", { exact: true }).count(), 1);
    const reads = tableCalls;
    await page.getByRole("button", { name: "Administration", exact: true }).click();
    await page.getByRole("heading", { name: "Enrollment access setup", exact: true }).waitFor();
    assert.equal(tableCalls, reads, "Administration must not mount request queries");
    assert.equal(await page.getByText("TEST PRIVATE DESTINATION", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Pause enrollment pilot", exact: true }).click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll(".staff-navigation button")).every(
        (button) => button.disabled,
      ),
    );
    assert.equal(await page.getByLabel("Operating business", { exact: true }).isDisabled(), true);
    assert.equal(
      await page.getByRole("button", { name: "Sign out", exact: true }).isDisabled(),
      true,
    );
    assert.equal(typeof releaseConfigure, "function");
    releaseConfigure();
    await page.getByRole("button", { name: "Enrollment", exact: true }).click();
    await page.getByRole("button", { name: "Manage enrollments", exact: true }).click();
    await page.getByRole("button", { name: "Add a student", exact: true }).waitFor();
    await page.getByRole("button", { name: "Requests and planning", exact: true }).click();
    await page.getByText("TEST PRIVATE DESTINATION", { exact: true }).waitFor();
    await page.getByLabel("Operating business", { exact: true }).selectOption(other);
    await page.getByText("No requests yet.", { exact: true }).waitFor();
    assert.equal(await page.getByText("TEST PRIVATE DESTINATION", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Enrollment", exact: true }).count(), 0);
    await page.getByLabel("Operating business", { exact: true }).selectOption(tenant);
    await page.getByText("TEST PRIVATE DESTINATION", { exact: true }).waitFor();
    const evidence = path.resolve(__dirname, "../../tmp/student-staff-evidence");
    await fs.mkdir(evidence, { recursive: true });
    for (const width of [320, 414, 1280]) {
      await page.setViewportSize({ width, height: 896 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(evidence, `${width}-staff.png`), fullPage: true });
    }
    failed = true;
    await page.getByRole("button", { name: "Refresh workspace", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Load staff access: Authentication was rejected. (HTTP 401 / PGRST301)" })
      .waitFor();
    assert.equal(await page.getByText("TEST PRIVATE DESTINATION", { exact: true }).count(), 0);
    assert.equal(await page.getByText("No account access", { exact: false }).count(), 0);
    assert.ok(!(await page.locator("body").innerText()).includes("TEST PRIVATE TOKEN DETAIL"));
    failed = false;
    admitted = false;
    await page.getByRole("button", { name: "Refresh workspace", exact: true }).click();
    await page.getByText("No staff access is available", { exact: false }).waitFor();
    assert.equal(
      await page.getByRole("navigation", { name: "Staff sections", exact: true }).count(),
      0,
    );
    admitted = true;
    await page.getByRole("button", { name: "Refresh workspace", exact: true }).click();
    await page.getByText("TEST PRIVATE DESTINATION", { exact: true }).waitFor();
    await page.goto(origin + "/enrollment");
    await page.getByRole("button", { name: "Manage enrollments", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/admin");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("heading", { name: "Secure sign-in", exact: true }).waitFor();
    assert.equal(await page.getByLabel("Operating business", { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "PASS unified staff sign-in/callback, legacy redirects, single identity/tenant controls, section/tenant isolation, visible sanitized 401, revoked clearing, sign-out and 320/414/desktop layout. Mock provider/API only.",
    );
  } finally {
    await browser?.close();
    child.kill();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
