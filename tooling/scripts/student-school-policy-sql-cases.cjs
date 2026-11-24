// Actual migration SQL in disposable TEST database only; no providers or real student data.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
module.exports = async ({ db, rows, actor, uuid, customer, request }) => {
  const tenant = uuid(1);
  const first = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const last = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const dates = { validFrom: "2026-01-01", validUntil: "2030-12-31" };
  await db.exec("reset role");
  // Separate source/resource fixtures ensure the earlier reservation tests remain untouched.
  const source = (
    await rows(
      `insert into student_transportation_requests(tenant_id,customer_id,submitted_by,idempotency_key,payload_hash,scheduled_at,destination_address,students,geography_status,geography,intake_hash)
    select tenant_id,customer_id,submitted_by,$1,'TEST DYNAMIC POLICY',now()+interval '10 days',destination_address,
    '[{"name":"TEST POLICY CHILD","pickupAddress":"TEST HOME","accommodations":["wheelchair_lift"]}]'::jsonb,geography_status,geography,'TEST DYNAMIC INTAKE'
    from student_transportation_requests where request_id=$2 returning request_id`,
      [randomUUID(), request],
    )
  )[0].request_id;
  await actor(13);
  const save = async (kind, data, c = customer, existing = null) =>
    (
      await rows(
        "select save_student_planning_record($1,$2,$3,$4,$5,$6,'active',$7,'TEST SCHOOL POLICY REVIEW',$8) result",
        [
          tenant,
          kind,
          c,
          existing?.reference ?? randomUUID(),
          existing?.id ?? null,
          existing?.revision ?? 0,
          data,
          randomUUID(),
        ],
      )
    )[0].result;
  const policyData = {
    ...dates,
    policyVersion: 2,
    minimumRouteAttendants: 0,
    reviewCoverage: "full_term",
    loadingProcedure: "TEST SCHOOL NORTH GATE",
    policyReviewed: true,
    sourceReference: "TEST SCHOOL A POLICY",
    driverKeys: [],
    attendantKeys: [],
    equipmentDriverKeys: {},
    equipmentAttendantKeys: {},
  };
  const policy = await save("policy", policyData);
  const policyReference = (
    await rows("select reference from student_planning_entities where entity_id=$1", [policy.id])
  )[0].reference;
  const stripped = { ...policyData };
  delete stripped.policyVersion;
  await assert.rejects(
    save("policy", stripped, customer, { ...policy, reference: policyReference }),
    /retain its reviewed rule settings/,
  );
  const studentData = {
    ...dates,
    name: "TEST POLICY CHILD",
    authorityReviewed: true,
    authorityReference: "TEST SCHOOL AUTHORITY",
    requirementsReviewed: true,
    requirements: ["wheelchair_lift"],
    seating: "wheelchair",
  };
  const student = await save("student", studentData);
  const points = [];
  for (let index = 0; index < 2; index++)
    points.push(
      await save("point", {
        ...dates,
        requestId: source,
        stopIndex: index,
        label: `TEST DYNAMIC STOP ${index}`,
        loadingType: "curb",
        latitude: 40,
        longitude: -75,
        instructions: "TEST LOAD",
        siteReviewed: true,
        siteReference: "TEST SITE POLICY",
      }),
    );
  const resource = (role, extra = {}) => ({
    ...dates,
    role,
    label: `TEST DYNAMIC ${role}`,
    dedicatedReviewed: true,
    evidenceReference: "TEST RESOURCE REVIEW",
    credentials: [],
    ...extra,
  });
  const vehicle = await save(
    "resource",
    resource("vehicle", {
      seats: 0,
      wheelchairPositions: 1,
      boosterSeats: 0,
      carSeats: 0,
      lift: true,
      securementReviewed: true,
    }),
    null,
  );
  const driver = await save("resource", resource("driver"), null);
  const base = {
    requestId: source,
    name: "TEST DYNAMIC ROUTE",
    direction: "inbound",
    timeZone: "America/New_York",
    startDate: first,
    endDate: last,
    startTime: "07:00",
    endTime: "08:00",
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    exceptions: [],
    calendarReviewed: true,
    bufferMinutes: 0,
    students: [{ ...student, sourceIndex: 0, identityConfirmed: true }],
    points,
    policy,
    vehicle,
    driver,
    attendants: [],
  };
  const draft = async (data = base) =>
    (
      await rows("select save_student_route_plan($1,null,0,$2,$3,'TEST DYNAMIC DRAFT',$4) result", [
        tenant,
        randomUUID(),
        data,
        randomUUID(),
      ])
    )[0].result;
  const approve = async (plan) => {
    const view = (
      await rows("select student_route_plan_preview($1,$2,$3) result", [
        tenant,
        plan.id,
        plan.revision,
      ])
    )[0].result;
    await db.exec("reset role");
    const receipt = (
      await rows(
        "insert into student_request_geography_receipts(tenant_id,customer_id,auth_user_id,input_hash,payload) values($1,$2,$3,'TEST DYNAMIC ROAD',$4) returning receipt_id",
        [
          tenant,
          customer,
          uuid(13),
          {
            kind: "planning",
            planId: plan.id,
            revision: plan.revision,
            planHash: view.planHash,
            durationSeconds: 600,
            distanceMeters: 1000,
          },
        ],
      )
    )[0].receipt_id;
    await actor(13);
    return (
      await rows(
        "select approve_student_route_plan($1,$2,$3,$4,'TEST POLICY APPROVAL',$5) result",
        [tenant, plan.id, plan.revision, receipt, randomUUID()],
      )
    )[0].result;
  };
  const generate = async (plan, from, to = from) =>
    (
      await rows(
        "select generate_student_manifests($1,$2,$3,$4,$5,'TEST POLICY DAY',$6,false) result",
        [tenant, plan.id, plan.revision, from, to, randomUUID()],
      )
    )[0].result;
  // School A requires the equipment but no extra equipment-training credential or attendant.
  const approved = await approve(await draft());
  assert.equal(approved.revision, 2);
  // School B's actual qualification remains mandatory even though School A required none.
  const strict = await save("policy", {
    ...policyData,
    sourceReference: "TEST SCHOOL B RULE",
    driverKeys: ["district_training"],
  });
  await assert.rejects(approve(await draft({ ...base, policy: strict })), /credential missing/);
  await assert.rejects(save("policy", policyData, uuid(999999)), /Active customer/);
  await db.exec("reset role");
  const schoolB = (
    await rows(
      "insert into student_transportation_customers(tenant_id,display_name,customer_kind,created_by,request_id,creation_hash) values($1,'TEST OTHER SCHOOL','school',$2,$3,'TEST OTHER SCHOOL') returning customer_id",
      [tenant, uuid(13), randomUUID()],
    )
  )[0].customer_id;
  await actor(13);
  const otherPolicy = await save(
    "policy",
    { ...policyData, driverKeys: ["district_training"] },
    schoolB,
  );
  await assert.rejects(draft({ ...base, policy: otherPolicy }), /review|customer|reference/i);
  const tooSmall = await save(
    "resource",
    resource("vehicle", {
      seats: 0,
      wheelchairPositions: 0,
      boosterSeats: 0,
      carSeats: 0,
      lift: false,
      securementReviewed: false,
    }),
    null,
  );
  await assert.rejects(approve(await draft({ ...base, vehicle: tooSmall })), /cannot satisfy/);
  const monitorPolicy = await save("policy", { ...policyData, minimumRouteAttendants: 1 });
  await assert.rejects(approve(await draft({ ...base, policy: monitorPolicy })), /attendant/);
  const attendant = await save("resource", resource("attendant"), null);
  await assert.rejects(
    approve(await draft({ ...base, policy: monitorPolicy, attendants: [attendant] })),
    /cannot satisfy/,
  );
  const withSeat = await save(
    "resource",
    resource("vehicle", {
      seats: 1,
      wheelchairPositions: 1,
      boosterSeats: 0,
      carSeats: 0,
      lift: true,
      securementReviewed: true,
    }),
    null,
  );
  await approve(
    await draft({ ...base, policy: monitorPolicy, vehicle: withSeat, attendants: [attendant] }),
  );
  const dedicated = await save("student", {
    ...studentData,
    requirements: ["wheelchair_lift", "attendant"],
  });
  await assert.rejects(
    approve(
      await draft({
        ...base,
        students: [{ ...dedicated, sourceIndex: 0, identityConfirmed: true }],
      }),
    ),
    /attendant/,
  );
  // No implicit legacy relaxation, and invalid new settings cannot be saved.
  const legacy = { ...policyData };
  delete legacy.policyVersion;
  await assert.rejects(save("policy", legacy), /required credential/);
  await assert.rejects(
    save("policy", { ...policyData, minimumRouteAttendants: -1 }),
    /school-specific/,
  );
  await assert.rejects(
    save("policy", { ...policyData, reviewCoverage: "ignore_expiry" }),
    /school-specific/,
  );
  const expiry = new Date(Date.parse(first) + 86400000).toISOString().slice(0, 10);
  const badDay = new Date(Date.parse(first) + 2 * 86400000).toISOString().slice(0, 10);
  const credential = {
    key: "district_training",
    reference: "TEST TRAINING EVIDENCE",
    ...dates,
    validUntil: expiry,
  };
  const expiring = await save("resource", resource("driver", { credentials: [credential] }), null);
  const fullTermPolicy = await save("policy", { ...policyData, driverKeys: ["district_training"] });
  await assert.rejects(
    approve(await draft({ ...base, policy: fullTermPolicy, driver: expiring })),
    /credential missing/,
  );
  const dailyPolicy = await save("policy", {
    ...policyData,
    reviewCoverage: "service_date",
    driverKeys: ["district_training"],
  });
  const dailyData = { ...base, policy: dailyPolicy, driver: expiring };
  const daily = await approve(await draft(dailyData));
  assert.equal((await generate(daily, first)).changedDates, 1);
  await assert.rejects(generate(daily, badDay), /credential missing/);
  const count = async () =>
    Number(
      (
        await rows("select count(*)::int n from student_daily_manifests where schedule_id=$1", [
          daily.id,
        ])
      )[0].n,
    );
  assert.equal(await count(), 1);
  await assert.rejects(generate(daily, first, badDay), /credential missing/);
  assert.equal(await count(), 1, "Failed date range must not leave partial manifests");
  const immutable = (
    await rows("select snapshot from student_daily_manifests where schedule_id=$1", [daily.id])
  )[0].snapshot;
  assert.equal(immutable.reviewedRecords.policy.data.reviewCoverage, "service_date");
  // A renewal creates a new version; old schedules cannot silently switch evidence.
  const ref = (
    await rows("select reference from student_planning_entities where entity_id=$1", [expiring.id])
  )[0].reference;
  const renewed = await save(
    "resource",
    resource("driver", { credentials: [{ ...credential, validUntil: dates.validUntil }] }),
    null,
    { ...expiring, reference: ref },
  );
  await assert.rejects(generate(daily, badDay), /changed|current|superseded|revision/i);
  const revised = await approve(await draft({ ...dailyData, driver: renewed }));
  assert.equal((await generate(revised, badDay)).changedDates, 1);
  await db.exec("reset role; set role authenticated");
  await assert.rejects(
    rows("select student_plan_snapshot_for_date($1,$2,true,$3)", [tenant, base, first]),
    /permission denied/,
  );
  await db.exec("reset role");
  console.log(
    "PASS school-specific policy SQL: optional qualifications, school isolation, route monitors and seats, dedicated student needs, legacy preservation, per-service-date expiry hard locks, atomic manifests, immutable policy snapshots and explicit renewed versions.",
  );
};
