// TEST ONLY: built app with nonsecret localhost config and intercepted Supabase responses.
const { chromium } = require("@playwright/test");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
async function main() {
  const origin = "http://127.0.0.1:3007";
  const child = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3007"],
    {
      cwd: path.resolve(__dirname, "../../apps/student-transportation"),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.resume();
  child.stderr.resume();
  let browser;
  const evidence = path.resolve(__dirname, "../../tmp/student-enrollment-evidence");
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      if (child.exitCode !== null) throw new Error("Local test app failed to start");
      try {
        ready = (await fetch(origin)).ok;
      } catch {
        /* startup */
      }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready);
    browser = await chromium.launch();
    await fs.mkdir(evidence, { recursive: true });
    const signedOut = await browser.newPage({ viewport: { width: 414, height: 896 } });
    let otpRequest;
    await signedOut.route("http://127.0.0.1:54321/**", (route) => {
      otpRequest = { url: route.request().url(), body: route.request().postDataJSON() };
      return route.fulfill({ json: {} });
    });
    await signedOut.goto(origin + "/guardian");
    await signedOut
      .getByLabel("Email address", { exact: true })
      .fill("test-guardian@example.invalid");
    await signedOut.getByRole("button", { name: "Email me a secure link", exact: true }).click();
    await signedOut.getByRole("status").filter({ hasText: "Check your email" }).waitFor();
    assert.equal(otpRequest.body.create_user, false);
    assert.ok(decodeURIComponent(otpRequest.url).includes(origin + "/guardian"));
    await signedOut.screenshot({ path: path.join(evidence, "414-sign-in.png"), fullPage: true });
    await signedOut.close();
    console.log("PASS sign-in redirect and existing-account restriction");
    const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
    const identity = "00000000-0000-0000-0000-000000000011";
    const tenant = "00000000-0000-0000-0000-000000000001";
    await context.addInitScript(
      ({ identity }) => {
        localStorage.setItem(
          "esh-student-transportation-auth",
          JSON.stringify({
            access_token: "test-access-token",
            refresh_token: "test-refresh-token",
            token_type: "bearer",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: identity,
              aud: "authenticated",
              email: "test-guardian@example.invalid",
              app_metadata: {},
              user_metadata: {},
              created_at: new Date().toISOString(),
            },
          }),
        );
      },
      { identity },
    );
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    let rows = [],
      contacts = [],
      reviewer = false,
      failSave = true,
      allowed = true,
      owner = false,
      enrollmentEnabled = true;
    const saveIds = [];
    const failures = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await context.route("http://127.0.0.1:54321/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const body = request.method() === "POST" ? request.postDataJSON() : {};
      if (url.pathname.endsWith("my_student_enrollment_context"))
        return route.fulfill({
          json: {
            personId: identity,
            programs: [
              {
                tenantId: tenant,
                name: "TEST enrollment program",
                canEnroll: allowed && !reviewer,
                canReview: allowed && reviewer,
                canConfigure: owner,
                enrollmentEnabled,
              },
            ],
          },
        });
      if (url.pathname.endsWith("/logout")) {
        assert.equal(url.searchParams.get("scope"), "local");
        return route.fulfill({ json: {} });
      }
      if (url.pathname.endsWith("configure_student_enrollment_program")) {
        assert.equal(body.target_tenant_id, tenant);
        assert.equal(owner, true);
        enrollmentEnabled = body.enabled_value;
        return route.fulfill({ json: true });
      }
      if (url.pathname.endsWith("set_student_enrollment_access")) {
        assert.equal(body.target_tenant_id, tenant);
        assert.equal(owner, true);
        assert.equal(body.role_value, "reviewer");
        reviewer = body.enabled_value;
        allowed = body.enabled_value;
        return route.fulfill({ json: true });
      }
      if (url.pathname.endsWith("save_my_student_enrollment")) {
        saveIds.push(body.request_id_value);
        if (failSave) {
          failSave = false;
          return route.abort("failed");
        }
        assert.equal(body.target_tenant_id, tenant);
        const id = body.student_id_value ?? "00000000-0000-0000-0000-000000000099";
        const existing = rows.find((row) => row.student_id === id);
        if (body.action_value === "withdraw") existing.status = "withdrawn";
        else {
          const value = body.payload_value;
          const row = {
            student_id: id,
            tenant_id: tenant,
            guardian_person_id: identity,
            full_name: value.fullName,
            grade: value.grade,
            school_name: value.schoolName,
            guardian_phone: value.guardianPhone,
            guardian_relationship: value.relationship,
            authority_attested: value.authorityAttested,
            status: body.action_value === "submit" ? "submitted" : "draft",
            review_notes: null,
            submitted_at: null,
            reviewed_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          rows = rows.filter((row) => row.student_id !== id).concat(row);
          contacts = value.contacts.map((item, i) => ({
            contact_id: String(i),
            tenant_id: tenant,
            student_id: id,
            full_name: item.fullName,
            phone: item.phone,
            relationship: item.relationship,
            proposed_pickup: item.pickup,
            proposed_dropoff: item.dropoff,
          }));
        }
        return route.fulfill({ json: id });
      }
      if (url.pathname.endsWith("review_student_enrollment")) {
        const row = rows.find((row) => row.student_id === body.student_id_value);
        row.status = body.decision_value;
        row.review_notes = body.notes_value;
        return route.fulfill({ json: row.student_id });
      }
      if (url.pathname.endsWith("student_transportation_students")) {
        assert.equal(url.searchParams.get("tenant_id"), "eq." + tenant);
        if (!reviewer) assert.equal(url.searchParams.get("guardian_person_id"), "eq." + identity);
        return route.fulfill({ json: rows });
      }
      if (url.pathname.endsWith("student_transportation_contacts"))
        return route.fulfill({ json: contacts });
      throw new Error("Unexpected test request: " + url.pathname);
    });
    await page.goto(origin + "/guardian");
    await page.getByRole("button", { name: "Add a child", exact: true }).click();
    await page.getByLabel("Student full name", { exact: true }).fill("TEST Child");
    await page.getByLabel("Grade", { exact: true }).selectOption("3");
    await page.getByLabel("School name", { exact: true }).fill("TEST School");
    await page.getByLabel("Your contact phone", { exact: true }).fill("2025550101");
    await page.getByLabel("Your relationship to the student", { exact: true }).fill("Guardian");
    await page.getByRole("button", { name: "Add contact", exact: true }).click();
    await page.getByLabel("Contact name", { exact: true }).fill("TEST Contact");
    await page.getByLabel("Contact phone", { exact: true }).fill("2025550102");
    await page.getByLabel("Contact relationship", { exact: true }).fill("Guardian");
    await page.getByLabel("I confirm I am authorized", { exact: false }).check();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(evidence, "414-enrollment-form.png"), fullPage: true });
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "We could not save" }).waitFor();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Draft saved" }).waitFor();
    assert.equal(saveIds[0], saveIds[1]);
    assert.equal(rows.length, 1);
    await page.reload();
    await page.getByRole("heading", { name: "TEST Child", exact: true }).waitFor();
    await page.getByRole("button", { name: "Edit enrollment", exact: true }).click();
    assert.equal(
      await page.getByLabel("Contact name", { exact: true }).inputValue(),
      "TEST Contact",
    );
    await page.getByRole("button", { name: "Submit enrollment", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Enrollment submitted" }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Edit enrollment", exact: true }).count(),
      0,
    );
    await page.screenshot({ path: path.join(evidence, "414-submitted.png"), fullPage: true });
    reviewer = true;
    await page.goto(origin + "/admin");
    await page.getByRole("button", { name: "Reject enrollment", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Reject enrollment", exact: true }).isEnabled(),
      false,
    );
    await page.getByLabel("Review notes", { exact: true }).fill("TEST: Please correct enrollment");
    await page.getByRole("button", { name: "Reject enrollment", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Enrollment review saved" }).waitFor();
    await page.screenshot({ path: path.join(evidence, "414-review.png"), fullPage: true });
    reviewer = false;
    await page.goto(origin + "/guardian");
    await page
      .getByText("Reviewer response: TEST: Please correct enrollment", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Edit enrollment", exact: true }).click();
    await page.getByRole("button", { name: "Submit enrollment", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Enrollment submitted" }).waitFor();
    await page.getByRole("button", { name: "Withdraw enrollment", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Enrollment withdrawn" }).waitFor();
    for (const viewport of [
      { width: 320, height: 740 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({
        path: path.join(evidence, `${viewport.width}-guardian.png`),
        fullPage: true,
      });
    }
    allowed = false;
    await page.getByRole("button", { name: "Refresh enrollment", exact: true }).click();
    await page
      .getByText("You have not been admitted to this enrollment role.", { exact: true })
      .waitFor();
    assert.equal(await page.getByRole("heading", { name: "TEST Child", exact: true }).count(), 0);
    await page.setViewportSize({ width: 414, height: 896 });
    owner = true;
    reviewer = false;
    enrollmentEnabled = false;
    await page.goto(origin + "/admin");
    await page.getByRole("heading", { name: "Enrollment access setup", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "TEST Child", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Enable enrollment pilot", exact: true }).click();
    await page.getByRole("button", { name: "Pause enrollment pilot", exact: true }).waitFor();
    await page.locator('input[name="email"]').fill("test-guardian@example.invalid");
    await page.getByLabel("Enrollment role", { exact: true }).selectOption("reviewer");
    await page.getByRole("button", { name: "Update access", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Enrollment access updated" }).waitFor();
    await page.getByRole("heading", { name: "TEST Child", exact: true }).waitFor();
    await page.screenshot({
      path: path.join(evidence, "owner-enrollment-controls.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("heading", { name: "Secure sign-in", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "TEST Child", exact: true }).count(), 0);
    assert.deepEqual(failures, []);
    console.log(
      "PASS isolated sign-in redirect, guardian form/contacts, same-ID retry, saved draft reload, submission, rejection/resubmission/withdrawal, revoked-access clearing, local sign-out and compact/mobile/desktop layout. Mock browser backend only; SQL tests verify permissions separately.",
    );
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
