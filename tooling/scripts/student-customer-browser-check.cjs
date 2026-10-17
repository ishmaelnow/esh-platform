// TEST ONLY: isolated nonsecret configuration and mocked API; no production accounts or email.
const { chromium } = require("@playwright/test");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs/promises");
const assert = require("node:assert/strict");
async function main() {
  const origin = "http://127.0.0.1:3008";
  const child = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3008"],
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
    for (let i = 0; i < 50; i++) {
      try {
        ready = (await fetch(origin)).ok;
      } catch {}
      if (ready) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(ready);
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
    const evidence = path.resolve(__dirname, "../../tmp/student-customer-evidence");
    await fs.mkdir(evidence, { recursive: true });
    const page = await context.newPage();
    let otp;
    await context.route("http://127.0.0.1:54321/**", (route) => {
      otp = { url: route.request().url(), body: route.request().postDataJSON() };
      return route.fulfill({ json: {} });
    });
    await page.goto(origin + "/school");
    await page.getByLabel("Email address", { exact: true }).fill("TEST-school@example.invalid");
    await page.getByRole("button", { name: "Email me a secure link", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Check your email" }).waitFor();
    assert.equal(otp.body.create_user, false);
    assert.ok(decodeURIComponent(otp.url).includes(origin + "/school"));
    await context.unroute("http://127.0.0.1:54321/**");
    const tenant = "00000000-0000-0000-0000-000000000001",
      customer = "00000000-0000-0000-0000-000000000050";
    await context.addInitScript(() =>
      localStorage.setItem(
        "esh-student-transportation-auth",
        JSON.stringify({
          access_token: "test-token",
          refresh_token: "test-refresh",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: "00000000-0000-0000-0000-000000000021",
            aud: "authenticated",
            email: "TEST-school@example.invalid",
            app_metadata: {},
            user_metadata: {},
            created_at: new Date().toISOString(),
          },
        }),
      ),
    );
    let invitations = [];
    let accounts = [],
      requests = [],
      allowed = true,
      fail = true;
    const keys = [];
    let geographicInput;
    let previewFailure = true;
    const stop = (choice) => ({
      ...choice,
      addressLatitude: choice.latitude,
      addressLongitude: choice.longitude,
      accuracy: "rooftop",
      pointSource: "routable",
      safetyStatus: "unreviewed",
    });
    const road = {
      geometry: {
        type: "LineString",
        coordinates: [
          [-75, 40],
          [-75.01, 40.01],
          [-75.02, 40.02],
          [-75.03, 40.03],
        ],
      },
      distanceMeters: 5000,
      durationSeconds: 900,
    };
    let mapFailure = false;
    await context.route("https://api.mapbox.com/**", (route) =>
      mapFailure
        ? route.fulfill({ status: 503, json: {} })
        : route.fulfill({ json: { version: 8, sources: {}, layers: [] } }),
    );
    await context.route("https://events.mapbox.com/**", (route) => route.fulfill({ json: {} }));
    await context.route(origin + "/api/geography", (route) => {
      const body = route.request().postDataJSON();
      if (body.action === "search") {
        const offset = body.query.includes("DESTINATION")
          ? 0.03
          : Number(body.query.slice(-1)) / 100;
        return route.fulfill({
          json: {
            suggestions: [
              {
                address: body.query,
                latitude: 40 + offset,
                longitude: -75 - offset,
                loadingInstructions: "",
              },
            ],
          },
        });
      }
      if (body.action === "preview") {
        if (previewFailure) {
          previewFailure = false;
          return route.fulfill({
            status: 503,
            json: { message: "TEST provider unavailable. Try again." },
          });
        }
        geographicInput = body;
        return route.fulfill({
          json: {
            receiptId: "00000000-0000-0000-0000-000000000080",
            stops: [...body.students.map((s) => stop(s.pickup)), stop(body.destination)],
            route: road,
          },
        });
      }
      if (body.action === "saved")
        return route.fulfill({
          json: {
            stops: [
              ...geographicInput.students.map((s) => stop(s.pickup)),
              stop(geographicInput.destination),
            ],
            route: road,
          },
        });
      throw Error("Unexpected geography action");
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let emailFailed = true;
    await context.route(origin + "/api/customers/invite", async (route) => {
      const body = route.request().postDataJSON();
      assert.ok(route.request().headers().authorization.startsWith("Bearer "));
      assert.equal(body.target_tenant_id, tenant);
      if (!body.target_customer_id) {
        assert.equal(body.email_value, "TEST-school@example.invalid");
        accounts = [
          {
            customer_id: customer,
            tenant_id: tenant,
            display_name: body.name_value,
            customer_kind: "school",
            status: "active",
          },
        ];
        invitations = [
          {
            invitation_id: "TEST-INVITE",
            customer_id: customer,
            tenant_id: tenant,
            normalized_email: body.email_value,
            status: "pending",
            expires_at: "2027-01-01",
          },
        ];
      }
      if (emailFailed) {
        emailFailed = false;
        return route.fulfill({
          status: 502,
          json: {
            message:
              "The account is saved, but the invitation email could not be sent. Use Resend invitation after one minute.",
          },
        });
      }
      return route.fulfill({ json: { message: "Invitation email requested." } });
    });
    await context.route("http://127.0.0.1:54321/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      const body = req.method() === "POST" ? req.postDataJSON() : {};
      if (url.pathname.endsWith("my_student_enrollment_context"))
        return route.fulfill({
          json: {
            personId: "test",
            programs: [
              {
                tenantId: tenant,
                name: "TEST BUSINESS",
                canEnroll: false,
                canReview: false,
                canConfigure: true,
                enrollmentEnabled: true,
              },
            ],
          },
        });
      if (url.pathname.endsWith("accept_my_student_customer_invitations")) {
        if (allowed) invitations.forEach((i) => (i.status = "accepted"));
        return route.fulfill({ json: allowed ? 1 : 0 });
      }
      if (url.pathname.endsWith("student_transportation_customer_invitations"))
        return route.fulfill({ json: invitations });
      if (url.pathname.endsWith("my_student_customer_context"))
        return route.fulfill({
          json: {
            customers: allowed
              ? [{ customerId: customer, tenantId: tenant, name: "TEST SCHOOL" }]
              : [],
          },
        });
      if (url.pathname.endsWith("student_transportation_customers"))
        return route.fulfill({ json: accounts });
      if (url.pathname.endsWith("student_transportation_requests")) {
        assert.equal(url.searchParams.get("tenant_id"), "eq." + tenant);
        if (new URL(page.url()).pathname === "/school")
          assert.equal(url.searchParams.get("customer_id"), "eq." + customer);
        return route.fulfill({ json: requests });
      }
      if (url.pathname.endsWith("create_student_customer")) {
        assert.equal(body.target_tenant_id, tenant);
        assert.equal(body.kind_value, "school");
        accounts = [
          {
            customer_id: customer,
            tenant_id: tenant,
            display_name: body.name_value,
            customer_kind: "school",
            status: "active",
          },
        ];
        return route.fulfill({ json: customer });
      }
      if (url.pathname.endsWith("submit_geographic_student_request")) {
        keys.push(body.idempotency_key_value);
        if (fail) {
          fail = false;
          return route.abort("failed");
        }
        assert.equal(geographicInput.students.length, 3);
        assert.equal(body.target_customer_id, customer);
        assert.equal(body.target_tenant_id, tenant);
        assert.ok(geographicInput.scheduledAt.endsWith("Z"));
        assert.deepEqual(geographicInput.students[1].accommodations, ["wheelchair_lift"]);
        requests = [
          {
            request_id: "TEST-REQUEST",
            tenant_id: tenant,
            customer_id: customer,
            scheduled_at: geographicInput.scheduledAt,
            destination_address: geographicInput.destination.address,
            students: geographicInput.students.map((s) => ({
              name: s.name,
              pickupAddress: s.pickup.address,
              accommodations: s.accommodations,
            })),
            geography_status: "geocoded",
            status: "submitted",
          },
        ];
        return route.fulfill({ json: "TEST-REQUEST" });
      }
      if (url.pathname.endsWith("withdraw_student_transport_request")) {
        requests[0].status = "withdrawn";
        return route.fulfill({ json: true });
      }
      if (url.pathname.endsWith("/logout")) return route.fulfill({ json: {} });
      throw Error("Unexpected fixture request " + url.pathname);
    });
    await page.goto(origin + "/clients");
    await page.getByLabel("School or organization name", { exact: true }).fill("TEST SCHOOL");
    await page
      .getByLabel("School contact email", { exact: true })
      .fill("TEST-school@example.invalid");
    await page
      .getByRole("button", { name: "Create account and send invitation", exact: true })
      .click();
    await page.getByRole("status").filter({ hasText: "account is saved" }).waitFor();
    await page.getByRole("button", { name: "Resend invitation", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Invitation email requested" }).waitFor();
    assert.equal(accounts.length, 1);
    await page.screenshot({
      path: path.join(evidence, "414-internal-customers.png"),
      fullPage: true,
    });
    await page.goto(origin + "/school");
    await page.getByRole("heading", { name: "Schedule a shared journey", exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Create account and send invitation", exact: true })
        .count(),
      0,
    );
    await page.getByLabel("Requested pickup time", { exact: true }).fill("2027-01-12T07:00");
    await page.getByLabel("Destination address", { exact: true }).fill("TEST SCHOOL DESTINATION");
    await page.getByRole("button", { name: "Search destination address", exact: true }).click();
    await page.getByRole("button", { name: "TEST SCHOOL DESTINATION", exact: true }).click();
    await page
      .getByLabel("Gate or entrance instructions (optional)", {
        exact: true,
      })
      .fill("TEST NORTH GATE");
    await page.getByRole("button", { name: "Add student", exact: true }).click();
    await page.getByRole("button", { name: "Add student", exact: true }).click();
    await page.getByRole("button", { name: "Add student", exact: true }).click();
    for (let i = 0; i < 4; i++) {
      await page
        .getByLabel("Student name", { exact: true })
        .nth(i)
        .fill("TEST STUDENT " + i);
      await page
        .getByLabel("Pickup address " + (i + 1), { exact: true })
        .fill("TEST PICKUP ADDRESS " + i);
      await page
        .getByRole("button", { name: "Search pickup address " + (i + 1), exact: true })
        .click();
      await page.getByRole("button", { name: "TEST PICKUP ADDRESS " + i, exact: true }).click();
    }
    await page.getByRole("button", { name: "Remove student 2", exact: true }).click();
    assert.equal(
      await page.getByLabel("Pickup address 2", { exact: true }).inputValue(),
      "TEST PICKUP ADDRESS 2",
    );
    await page.getByLabel("Wheelchair lift", { exact: true }).nth(1).check();
    assert.equal(
      await page
        .getByRole("button", { name: "Submit transportation request", exact: true })
        .isEnabled(),
      false,
    );
    await page.getByRole("button", { name: "Verify stops and preview route", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "TEST provider unavailable" }).waitFor();
    await page.getByRole("button", { name: "Verify stops and preview route", exact: true }).click();
    await page.getByText("Proposed road route:", { exact: false }).waitFor();
    await page.locator('.student-route-preview[data-map-state="ready"]').waitFor();
    assert.ok(await page.locator(".mapboxgl-ctrl-attrib").count());
    for (const width of [320, 1280, 414]) {
      await page.setViewportSize({ width, height: 896 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    // A changed loading instruction invalidates trusted preview and requires fresh verification.
    await page
      .getByLabel("Gate or entrance instructions (optional)", {
        exact: true,
      })
      .fill("TEST NORTH GATE UPDATED");
    assert.equal(
      await page
        .getByRole("button", { name: "Submit transportation request", exact: true })
        .isEnabled(),
      false,
    );
    assert.equal(await page.locator(".student-route-preview").count(), 0);
    await page.getByRole("button", { name: "Verify stops and preview route", exact: true }).click();
    await page.locator('.student-route-preview[data-map-state="ready"]').waitFor();
    await page.screenshot({
      path: path.join(evidence, "414-three-student-request.png"),
      fullPage: true,
    });
    mapFailure = true;
    await page
      .getByLabel("Gate or entrance instructions (optional)", {
        exact: true,
      })
      .fill("TEST NORTH GATE FINAL");
    await page.getByRole("button", { name: "Verify stops and preview route", exact: true }).click();
    await page.getByRole("button", { name: "Retry map", exact: true }).waitFor();
    mapFailure = false;
    await page.getByRole("button", { name: "Retry map", exact: true }).click();
    await page.locator('.student-route-preview[data-map-state="ready"]').waitFor();
    await page.getByRole("button", { name: "Submit transportation request", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Submission status is uncertain" }).waitFor();
    await page.getByRole("button", { name: "Submit transportation request", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Transportation request submitted" })
      .waitFor();
    assert.equal(keys[0], keys[1]);
    assert.equal(requests.length, 1);
    await page.reload();
    await page
      .getByRole("listitem")
      .filter({ hasText: "TEST STUDENT 2 · TEST PICKUP ADDRESS 2" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("listitem")
        .filter({ hasText: "TEST STUDENT 2 · TEST PICKUP ADDRESS 2" })
        .filter({ hasText: "Wheelchair lift" })
        .count(),
      1,
    );
    await page.screenshot({
      path: path.join(evidence, "414-submitted-request.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Withdraw request", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Request withdrawn" }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Withdraw request", exact: true }).count(),
      0,
    );
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 896 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    allowed = false;
    await page.getByRole("button", { name: "Refresh requests", exact: true }).click();
    await page.getByText("No account access is available.", { exact: false }).waitFor();
    assert.equal(
      await page
        .getByRole("listitem")
        .filter({ hasText: "TEST STUDENT 2 · TEST PICKUP ADDRESS 2" })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Submit transportation request", exact: true })
        .count(),
      0,
    );
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("heading", { name: "Secure sign-in", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "PASS invitation regressions; selected addresses and three-student road geometry; per-student requirements; middle-row removal; provider/map failure and retry; changed-loading-point preview invalidation; same-key submit retry; reload/withdrawal/revoked clearing; compact/mobile/desktop layout. Mock backend/provider only; no email sent.",
    );
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
