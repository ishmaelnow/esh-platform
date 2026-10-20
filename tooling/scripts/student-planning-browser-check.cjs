// Disposable intercepted TEST fixtures only. No real accounts, routes, email or database calls.
const { chromium } = require("@playwright/test");
const { spawn } = require("node:child_process");
const path = require("node:path"),
  fs = require("node:fs/promises"),
  assert = require("node:assert/strict");
async function main() {
  const origin = "http://127.0.0.1:3011",
    tenant = "00000000-0000-0000-0000-000000000001",
    customer = "00000000-0000-0000-0000-000000000050",
    requestId = "00000000-0000-0000-0000-000000000070",
    actor = "00000000-0000-0000-0000-000000000013";
  const child = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3011"],
    {
      cwd: path.resolve(__dirname, "../../apps/student-transportation"),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.resume();
  child.stderr.resume();
  let browser, page;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        ready = (await fetch(origin)).ok;
      } catch {}
      if (ready) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(ready);
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
    await context.addInitScript(
      (actor) =>
        localStorage.setItem(
          "esh-student-transportation-auth",
          JSON.stringify({
            access_token: "TEST-TOKEN",
            refresh_token: "TEST-REFRESH",
            token_type: "bearer",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: actor,
              aud: "authenticated",
              email: "TEST-reviewer@example.invalid",
              app_metadata: {},
              user_metadata: {},
              created_at: new Date().toISOString(),
            },
          }),
        ),
      actor,
    );
    const point = (i) => ({
      address: i ? "TEST SCHOOL ADDRESS" : "TEST HOME ADDRESS",
      latitude: 40 + i / 100,
      longitude: -75 - i / 100,
      addressLatitude: 40 + i / 100,
      addressLongitude: -75 - i / 100,
      accuracy: "rooftop",
      pointSource: "routable",
      loadingInstructions: "TEST NORTH GATE",
      safetyStatus: "unreviewed",
    });
    const source = {
      request_id: requestId,
      tenant_id: tenant,
      customer_id: customer,
      submitted_by: "TEST-CUSTOMER",
      scheduled_at: "2027-01-12T12:00:00Z",
      destination_address: "TEST SCHOOL ADDRESS",
      status: "submitted",
      geography_status: "geocoded",
      students: [
        {
          name: "TEST REQUEST CHILD",
          pickupAddress: "TEST HOME ADDRESS",
          accommodations: ["wheelchair_lift", "attendant"],
        },
      ],
      geography: { safetyStatus: "unreviewed", stops: [point(0), point(1)] },
    };
    const records = [],
      manifests = [],
      keys = [];
    let serial = 100,
      allowed = true,
      failSave = true,
      failPreview = true,
      failApproval = true;
    const nextId = () => `00000000-0000-0000-0000-${String(serial++).padStart(12, "0")}`;
    const reviewed = (plan) => {
      const find = (ref) => {
        const r = records.find((r) => r.id === ref.id);
        return { ...r, reviewedBy: actor, reviewedAt: r.recordedAt };
      };
      return {
        students: plan.data.students.map(find),
        points: plan.data.points.map(find),
        policy: find(plan.data.policy),
        vehicle: find(plan.data.vehicle),
        driver: find(plan.data.driver),
        attendants: plan.data.attendants.map(find),
        segments: [
          {
            fromStop: 0,
            toStop: 1,
            studentSeats: 0,
            wheelchairPositions: 1,
            attendantSeats: 1,
            boosterSeats: 0,
            carSeats: 0,
          },
        ],
      };
    };
    await context.route("https://api.mapbox.com/**", (r) =>
      r.fulfill({ json: { version: 8, sources: {}, layers: [] } }),
    );
    await context.route("https://events.mapbox.com/**", (r) => r.fulfill({ json: {} }));
    await context.route(origin + "/api/planning/preview", (r) => {
      if (failPreview) {
        failPreview = false;
        return r.fulfill({
          status: 503,
          json: { message: "Road preview unavailable; refresh planning if needed." },
        });
      }
      const body = r.request().postDataJSON();
      const plan = records.find((p) => p.id === body.planId);
      assert.equal(body.revision, plan.revision);
      return r.fulfill({
        json: {
          receiptId: nextId(),
          stops: reviewed(plan).points.map((p) => ({
            ...point(0),
            ...p.data,
            loadingInstructions: p.data.instructions,
          })),
          route: {
            geometry: {
              type: "LineString",
              coordinates: [
                [-75, 40],
                [-75.01, 40.01],
              ],
            },
            distanceMeters: 1500,
            durationSeconds: 600,
          },
        },
      });
    });
    await context.route("http://127.0.0.1:54321/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        name = url.pathname.split("/").at(-1),
        body = req.method() === "POST" ? req.postDataJSON() : {};
      if (name === "my_student_enrollment_context")
        return route.fulfill({
          json: {
            personId: actor,
            programs: [
              {
                tenantId: tenant,
                name: "TEST BUSINESS",
                canEnroll: false,
                canReview: true,
                canConfigure: false,
                enrollmentEnabled: true,
              },
            ],
          },
        });
      if (name === "student_transportation_customers")
        return route.fulfill({
          json: [
            {
              customer_id: customer,
              tenant_id: tenant,
              display_name: "TEST SCHOOL",
              status: "active",
              customer_kind: "school",
            },
          ],
        });
      if (name === "student_transportation_customer_invitations")
        return route.fulfill({ json: [] });
      if (name === "student_transportation_requests") return route.fulfill({ json: [source] });
      if (name === "my_student_planning")
        return allowed
          ? route.fulfill({ json: { records, manifests, operationallyReady: false } })
          : route.fulfill({ status: 403, json: { message: "Internal planning access required" } });
      if (name === "save_student_planning_record") {
        assert.equal(body.t, tenant);
        keys.push(body.request_key);
        if (failSave) {
          failSave = false;
          return route.abort("failed");
        }
        const record = {
          id: body.entity_value ?? nextId(),
          kind: body.kind_value,
          customerId: body.customer_value,
          reference: body.reference_value,
          revision: body.expected_revision + 1,
          state: body.state_value,
          data: body.data_value,
          actorId: actor,
          recordedAt: new Date().toISOString(),
          reason: body.reason_value,
        };
        records.push(record);
        return route.fulfill({ json: { id: record.id, revision: record.revision } });
      }
      if (name === "save_student_route_plan") {
        assert.equal(body.data_value.calendarReviewed, true);
        assert.equal(body.data_value.students[0].identityConfirmed, true);
        assert.equal(body.data_value.points.length, 2);
        const record = {
          id: nextId(),
          kind: "schedule",
          customerId: customer,
          reference: body.reference_value,
          revision: 1,
          state: "draft",
          data: body.data_value,
          actorId: actor,
          recordedAt: new Date().toISOString(),
          reason: body.reason_value,
        };
        records.push(record);
        return route.fulfill({ json: { id: record.id, revision: 1 } });
      }
      if (name === "approve_student_route_plan") {
        if (failApproval) {
          failApproval = false;
          return route.fulfill({
            status: 400,
            json: {
              message:
                "Vehicle configuration cannot satisfy current requirement; review before retry",
            },
          });
        }
        const plan = records.find((r) => r.id === body.id);
        assert.equal(plan.revision, body.expected_revision);
        plan.revision++;
        plan.state = "planning_approved";
        plan.data.approvedSnapshot = reviewed(plan);
        return route.fulfill({ json: { id: plan.id, revision: plan.revision } });
      }
      if (name === "generate_student_manifests") {
        assert.equal(body.t, tenant);
        const plan = records.find((r) => r.id === body.id);
        manifests.push({
          tenant_id: tenant,
          schedule_id: plan.id,
          service_date: body.from_day,
          revision: manifests.length + 1,
          schedule_revision: plan.revision,
          state: body.cancel_value ? "cancelled" : "planned",
          snapshot: {
            schedule: structuredClone(plan.data),
            reviewedRecords: reviewed(plan),
            startsAt: "2027-01-12T11:55:00Z",
            endsAt: "2027-01-12T13:05:00Z",
            operationallyReady: false,
            excludedReason: body.cancel_value ? "TEST CANCELLATION" : null,
          },
          actor_id: actor,
          recorded_at: new Date().toISOString(),
          reason: body.reason_value,
        });
        return route.fulfill({ json: { changedDates: 1 } });
      }
      if (name === "student_daily_manifests")
        return route.fulfill({
          json: manifests.filter(
            (m) => m.service_date === url.searchParams.get("service_date")?.replace("eq.", ""),
          ),
        });
      if (name === "student_planning_versions") return route.fulfill({ json: [] });
      throw Error("Unexpected TEST endpoint " + name);
    });
    page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/clients");
    await page.getByRole("button", { name: "Open route planning", exact: true }).click();
    const panel = page.getByRole("region", { name: "Internal route planning", exact: true });
    await panel.getByRole("button", { name: "Add qualification policy", exact: true }).waitFor();
    await panel.getByLabel("Source geographic request", { exact: true }).selectOption(requestId);
    const editor = () => panel.locator("form.planning-editor");
    const common = async (form, reference) => {
      await form
        .getByLabel(/reference$/i)
        .first()
        .fill(reference);
      await form.getByLabel("Review valid from", { exact: true }).fill("2026-01-01");
      await form.getByLabel("Review valid through", { exact: true }).fill("2028-12-31");
      await form
        .getByLabel("Review or change reason", { exact: true })
        .fill("TEST VERIFIED REVIEW");
    };
    const save = async () => {
      await editor().getByRole("button", { name: "Save reviewed revision", exact: true }).click();
      await panel.getByRole("status").filter({ hasText: "Planning revision saved" }).waitFor();
      assert.equal(await editor().count(), 0);
    };
    await panel.getByRole("button", { name: "Add qualification policy", exact: true }).click();
    await common(editor(), "TEST POLICY");
    await editor()
      .getByLabel("Approved district policy reference", { exact: true })
      .fill("TEST POLICY DOCUMENT");
    await editor()
      .getByLabel("Required Driver credential keys (comma-separated)", { exact: true })
      .fill("district_driver");
    await editor()
      .getByLabel("Required attendant credential keys (comma-separated)", { exact: true })
      .fill("district_attendant");
    await editor()
      .getByLabel("Wheelchair lift Driver keys (comma-separated)", { exact: true })
      .fill("district_driver");
    await editor()
      .getByLabel("Wheelchair lift attendant keys (comma-separated)", { exact: true })
      .fill("district_attendant");
    await editor().getByLabel("I reviewed the applicable policy", { exact: false }).check();
    await editor().getByRole("button", { name: "Save reviewed revision", exact: true }).click();
    await panel
      .getByRole("status")
      .filter({ hasText: "Planning could not be completed" })
      .waitFor();
    await save();
    assert.equal(keys[0], keys[1]);
    for (const role of ["vehicle", "driver", "attendant"]) {
      await panel.getByRole("button", { name: "Add dedicated resource", exact: true }).click();
      await common(editor(), "TEST " + role.toUpperCase());
      await editor().getByLabel("Resource role", { exact: true }).selectOption(role);
      await editor()
        .getByLabel("Resource display name", { exact: true })
        .fill("TEST " + role.toUpperCase());
      await editor()
        .getByLabel("Reviewed resource evidence reference", { exact: true })
        .fill("TEST RESOURCE EVIDENCE");
      await editor().getByLabel("This resource is dedicated", { exact: false }).check();
      if (role === "vehicle") {
        await editor()
          .getByLabel("Passenger seats, excluding Driver and wheelchair positions", { exact: true })
          .fill("1");
        await editor().getByLabel("Equipped wheelchair positions", { exact: true }).fill("1");
        await editor().getByLabel("Wheelchair lift available", { exact: true }).check();
        await editor()
          .getByLabel("Wheelchair securement configuration reviewed", { exact: true })
          .check();
      } else {
        await editor().getByRole("button", { name: "Add credential", exact: true }).click();
        await editor()
          .getByLabel("Credential key", { exact: true })
          .fill(role === "driver" ? "district_driver" : "district_attendant");
        await editor()
          .getByLabel("Credential evidence reference", { exact: true })
          .fill("TEST CREDENTIAL");
        await editor().getByLabel("Credential valid from", { exact: true }).fill("2026-01-01");
        await editor().getByLabel("Credential valid through", { exact: true }).fill("2028-12-31");
      }
      await save();
    }
    await panel.getByLabel("Source geographic request", { exact: true }).selectOption(requestId);
    await panel.getByRole("button", { name: "Register student 1 identity", exact: true }).click();
    await common(editor(), "TEST DISTRICT CHILD");
    await editor()
      .getByLabel("School authority evidence reference", { exact: true })
      .fill("TEST SCHOOL CONTRACT");
    await editor().getByLabel("I reviewed the school's authority", { exact: false }).check();
    await editor().getByLabel("I reviewed requirements", { exact: false }).check();
    await save();
    for (let i = 0; i < 2; i++) {
      await panel.getByRole("button", { name: "Review loading point", exact: true }).click();
      await common(editor(), "TEST POINT " + i);
      await editor().getByLabel("Source stop", { exact: true }).selectOption(String(i));
      await editor()
        .getByLabel("Approved point label", { exact: true })
        .fill(i ? "TEST NORTH GATE" : "TEST HOME CURB");
      await editor()
        .getByLabel("Site or district loading approval reference", { exact: true })
        .fill("TEST SITE INSPECTION");
      await editor().getByLabel("I verified this specific loading point", { exact: false }).check();
      await save();
    }
    await panel.getByRole("button", { name: "Create recurring schedule", exact: true }).click();
    await editor().getByLabel("Schedule reference", { exact: true }).fill("TEST MORNING");
    await editor().getByLabel("Schedule name", { exact: true }).fill("TEST MORNING ROUTE");
    await editor()
      .getByLabel("School local time zone", { exact: true })
      .selectOption("America/New_York");
    await editor().getByLabel("Term start", { exact: true }).fill("2027-01-10");
    await editor().getByLabel("Term end", { exact: true }).fill("2027-01-31");
    await editor().getByLabel("First pickup time (school local)", { exact: true }).fill("07:00");
    await editor()
      .getByLabel("Final drop-off deadline (school local)", { exact: true })
      .fill("08:00");
    await editor()
      .getByLabel("School closures and holidays (optional)", { exact: true })
      .fill("2027-01-18 TEST SCHOOL CLOSED");
    await editor().getByLabel("I reviewed school dates", { exact: false }).check();
    const student = records.find((r) => r.kind === "student"),
      policy = records.find((r) => r.kind === "policy"),
      vehicle = records.find((r) => r.data.role === "vehicle"),
      driver = records.find((r) => r.data.role === "driver");
    await editor()
      .getByLabel("Reviewed student identity", { exact: true })
      .selectOption(student.id);
    await editor().getByLabel("I confirmed this request entry", { exact: false }).check();
    await editor()
      .getByLabel("Stop 1: TEST REQUEST CHILD", { exact: true })
      .selectOption(records.find((r) => r.kind === "point" && r.data.stopIndex === 0).id);
    await editor()
      .getByLabel("Stop 2: School", { exact: true })
      .selectOption(records.find((r) => r.kind === "point" && r.data.stopIndex === 1).id);
    await editor().getByLabel("Qualification policy", { exact: true }).selectOption(policy.id);
    await editor().getByLabel("Vehicle configuration", { exact: true }).selectOption(vehicle.id);
    await editor().getByLabel("Driver", { exact: true }).selectOption(driver.id);
    await editor().getByLabel("TEST ATTENDANT", { exact: true }).check();
    await editor().getByLabel("Schedule change reason", { exact: true }).fill("TEST TERM PLANNING");
    const evidence = path.resolve(__dirname, "../../tmp/student-planning-evidence");
    await fs.mkdir(evidence, { recursive: true });
    await editor().screenshot({ path: path.join(evidence, "414-schedule-editor.png") });
    await editor()
      .getByRole("button", { name: "Save schedule draft", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(evidence, "414-schedule-actions.png") });
    await editor().getByRole("button", { name: "Save schedule draft", exact: true }).click();
    await panel.getByRole("status").filter({ hasText: "Planning revision saved" }).waitFor();
    const plan = records.find((r) => r.kind === "schedule");
    await panel.getByLabel("Recurring schedule", { exact: true }).selectOption(plan.id);
    await panel.getByRole("button", { name: "Preview reviewed route", exact: true }).click();
    await panel.getByRole("status").filter({ hasText: "Road preview unavailable" }).waitFor();
    await panel.getByRole("button", { name: "Preview reviewed route", exact: true }).click();
    await panel.locator('.student-route-preview[data-map-state="ready"]').waitFor();
    await panel
      .getByLabel("Planning approval reason", { exact: true })
      .fill("TEST APPROVED PLANNING");
    await panel.getByLabel("I reviewed identity, school authority", { exact: false }).check();
    await panel.getByRole("button", { name: "Approve planning data", exact: true }).click();
    await panel
      .getByRole("status")
      .filter({ hasText: "Vehicle configuration cannot satisfy" })
      .waitFor();
    assert.equal(plan.state, "draft");
    await panel.getByRole("button", { name: "Approve planning data", exact: true }).click();
    await panel.getByRole("status").filter({ hasText: "Planning revision saved" }).waitFor();
    assert.equal(plan.state, "planning_approved");
    const generate = async (cancel = false) => {
      await panel.getByLabel("Manifest dates from", { exact: true }).fill("2027-01-12");
      await panel
        .getByLabel("Manifest dates through (maximum 14 dates)", { exact: true })
        .fill("2027-01-12");
      await panel
        .getByLabel("Daily planning action", { exact: true })
        .selectOption(cancel ? "cancel" : "generate");
      await panel
        .getByLabel("Manifest change reason", { exact: true })
        .fill(cancel ? "TEST CANCEL DAY" : "TEST GENERATE DAY");
      await panel.getByRole("button", { name: "Apply daily planning action", exact: true }).click();
      await panel.getByRole("status").filter({ hasText: "Planning revision saved" }).waitFor();
    };
    await generate();
    await panel.getByText("2027-01-12 · revision 1 · planned", { exact: true }).click();
    await panel.getByRole("heading", { name: "Immutable student snapshot", exact: true }).waitFor();
    await panel.screenshot({ path: path.join(evidence, "414-manifest.png") });
    await generate(true);
    assert.equal(manifests[0].state, "planned");
    assert.equal(manifests[1].state, "cancelled");
    await panel.getByLabel("Manifest history date", { exact: true }).fill("2027-01-12");
    await panel.getByRole("button", { name: "Show all revisions for date", exact: true }).click();
    await panel.getByText("2027-01-12 · revision 2 · cancelled", { exact: true }).waitFor();
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 896 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    allowed = false;
    await panel.getByRole("button", { name: "Refresh planning", exact: true }).click();
    await panel
      .getByRole("status")
      .filter({ hasText: "Internal planning access required" })
      .waitFor();
    assert.equal(await panel.getByText("TEST MORNING ROUTE", { exact: true }).count(), 0);
    assert.equal(
      await panel.getByRole("button", { name: "Apply daily planning action", exact: true }).count(),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS internal planning policy/resources/student/loading-point forms, same-key failed-save retry, canonical binding, calendar/compatibility controls, road failure/recovery, approval hard-lock UI, immutable manifest history/cancellation, revoked clearing and 320/414/desktop layout. Mock APIs/provider only.",
    );
  } finally {
    if (browser) {
      if (page) {
        const evidence = path.resolve(__dirname, "../../tmp/student-planning-evidence");
        await fs.mkdir(evidence, { recursive: true });
        await fs.writeFile(path.join(evidence, "last-fixture.html"), await page.content());
        await page.screenshot({ path: path.join(evidence, "last-fixture.png"), fullPage: true });
      }
      await browser.close();
    }
    child.kill();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
