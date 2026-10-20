const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
module.exports = async function planningCases({ db, read, rows, actor, uuid, customer }) {
  await db.exec("reset role");
  await db.exec(read("supabase/migrations/20261017000100_student_recurring_planning.sql"));
  await actor(13); // Already explicitly admitted reviewer, unlike owner-only actor 14.
  const today = new Date();
  today.setUTCDate(today.getUTCDate() + 10);
  const start = today.toISOString().slice(0, 10);
  today.setUTCDate(today.getUTCDate() + 30);
  const end = today.toISOString().slice(0, 10);
  const dates = { validFrom: "2026-01-01", validUntil: "2030-12-31" };
  const save = async (
    kind,
    data,
    reference = randomUUID(),
    customerId = null,
    existing = null,
    state = "active",
    key = randomUUID(),
  ) =>
    (
      await rows(
        "select save_student_planning_record($1,$2,$3,$4,$5,$6,$7,$8,'TEST REVIEW REASON',$9) result",
        [
          uuid(1),
          kind,
          customerId,
          reference,
          existing?.id ?? null,
          existing?.revision ?? 0,
          state,
          data,
          key,
        ],
      )
    )[0].result;
  const policyData = {
    ...dates,
    policyReviewed: true,
    sourceReference: "TEST DISTRICT POLICY",
    driverKeys: ["district_driver"],
    attendantKeys: ["district_attendant"],
    equipmentDriverKeys: { wheelchair_lift: ["district_driver"] },
    equipmentAttendantKeys: { wheelchair_lift: ["district_attendant"] },
  };
  await assert.rejects(
    () =>
      save(
        "policy",
        { ...policyData, equipmentDriverKeys: { wheelchair_lift: ["`test_lift_training`"] } },
        "TEST INVALID POLICY",
        customer,
      ),
    /Use explicit equipment credential keys/,
  );
  assert.equal(
    (await rows("select * from student_planning_entities where kind='policy'")).length,
    0,
  );
  const policy = await save("policy", policyData, "TEST POLICY", customer);
  const studentData = {
    ...dates,
    name: "TEST CANONICAL CHILD",
    authorityReviewed: true,
    authorityReference: "TEST SCHOOL AUTHORITY",
    requirementsReviewed: true,
    requirements: ["wheelchair_lift", "attendant"],
    seating: "wheelchair",
  };
  const student = await save("student", studentData, "TEST DISTRICT CHILD", customer);
  const resource = (role, extra = {}) => ({
    ...dates,
    role,
    label: "TEST " + role,
    dedicatedReviewed: true,
    evidenceReference: "TEST DEDICATED RESOURCE EVIDENCE",
    credentials:
      role === "vehicle"
        ? []
        : [
            {
              key: role === "driver" ? "district_driver" : "district_attendant",
              ...dates,
              reference: "TEST CREDENTIAL EVIDENCE",
            },
          ],
    ...extra,
  });
  const vehicle = await save(
    "resource",
    resource("vehicle", {
      seats: 1,
      wheelchairPositions: 1,
      boosterSeats: 0,
      carSeats: 0,
      lift: true,
      securementReviewed: true,
    }),
    "TEST VEHICLE",
  );
  const driver = await save("resource", resource("driver"), "TEST DRIVER");
  const attendant = await save("resource", resource("attendant"), "TEST ATTENDANT");
  await assert.rejects(
    save("student", { ...studentData, authorityReviewed: false }, "TEST NO AUTHORITY", customer),
    /authority/,
  );
  await assert.rejects(
    save(
      "student",
      { ...studentData, requirementsReviewed: false },
      "TEST UNREVIEWED NEEDS",
      customer,
    ),
    /requirements/,
  );
  await assert.rejects(
    save(
      "student",
      { ...studentData, requirements: ["diagnosis"] },
      "TEST INVALID NEEDS",
      customer,
    ),
    /operational requirement/,
  );
  const retryKey = randomUUID();
  const retryRecord = await save(
    "student",
    studentData,
    "TEST RETRY CHILD",
    customer,
    null,
    "active",
    retryKey,
  );
  assert.equal(
    (await save("student", studentData, "TEST RETRY CHILD", customer, null, "active", retryKey)).id,
    retryRecord.id,
  );
  await assert.rejects(
    save(
      "student",
      { ...studentData, name: "CHANGED" },
      "TEST RETRY CHILD",
      customer,
      null,
      "active",
      retryKey,
    ),
    /already used/,
  );
  await assert.rejects(
    save("resource", resource("attendant"), "TEST DRIVER", null, driver),
    /role cannot change/,
  );
  await db.exec("reset role");
  const stop = {
    address: "TEST PRECISE STREET ADDRESS",
    latitude: 40,
    longitude: -75,
    addressLatitude: 40,
    addressLongitude: -75,
    accuracy: "rooftop",
    pointSource: "routable",
    loadingInstructions: "TEST GATE",
    safetyStatus: "unreviewed",
  };
  const receipt = (
    await rows(
      "insert into student_request_geography_receipts(tenant_id,customer_id,auth_user_id,input_hash,payload) values($1,$2,$3,$4,$5) returning receipt_id",
      [
        uuid(1),
        customer,
        uuid(21),
        randomUUID(),
        {
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
          destination: stop.address,
          students: [
            {
              name: "TEST REQUEST CHILD",
              pickupAddress: stop.address,
              accommodations: ["wheelchair_lift", "attendant"],
            },
          ],
          geography: { safetyStatus: "unreviewed", stops: [stop, stop] },
        },
      ],
    )
  )[0].receipt_id;
  await actor(21);
  const request = (
    await rows("select submit_geographic_student_request($1,$2,$3,$4) id", [
      uuid(1),
      customer,
      randomUUID(),
      receipt,
    ])
  )[0].id;
  await actor(13);
  const point = async (i) =>
    save(
      "point",
      {
        ...dates,
        requestId: request,
        stopIndex: i,
        label: i ? "TEST SCHOOL GATE" : "TEST HOME CURB",
        loadingType: i ? "driveway_loop" : "curb",
        latitude: 40,
        longitude: -75,
        instructions: "TEST LOADING",
        siteReviewed: true,
        siteReference: "TEST SITE REVIEW",
      },
      "TEST POINT " + i,
      customer,
    );
  const points = [await point(0), await point(1)];
  const planData = {
    requestId: request,
    name: "TEST MORNING SCHOOL",
    direction: "inbound",
    timeZone: "America/New_York",
    startDate: start,
    endDate: end,
    startTime: "07:00",
    endTime: "08:00",
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    exceptions: [],
    calendarReviewed: true,
    bufferMinutes: 5,
    students: [{ ...student, sourceIndex: 0, identityConfirmed: true }],
    points,
    policy,
    vehicle,
    driver,
    attendants: [attendant],
  };
  const draft = async (
    data = planData,
    existing = null,
    reference = randomUUID(),
    key = randomUUID(),
  ) =>
    (
      await rows(
        "select save_student_route_plan($1,$2,$3,$4,$5,'TEST SCHEDULE REASON',$6) result",
        [uuid(1), existing?.id ?? null, existing?.revision ?? 0, reference, data, key],
      )
    )[0].result;
  const plan = await draft(planData, null, "TEST MORNING");
  assert.equal(plan.revision, 1);
  const preview = (
    await rows("select student_route_plan_preview($1,$2,$3) result", [
      uuid(1),
      plan.id,
      plan.revision,
    ])
  )[0].result;
  assert.equal(preview.snapshot.segments[0].wheelchairPositions, 1);
  const proof = async (p = plan, overrides = {}) => {
    const view = (
      await rows("select student_route_plan_preview($1,$2,$3) result", [uuid(1), p.id, p.revision])
    )[0].result;
    await db.exec("reset role");
    const result = (
      await rows(
        "insert into student_request_geography_receipts(tenant_id,customer_id,auth_user_id,input_hash,payload) values($1,$2,$3,'TEST PLAN PROOF',$4) returning receipt_id",
        [
          uuid(1),
          customer,
          uuid(13),
          {
            kind: "planning",
            planId: p.id,
            revision: p.revision,
            planHash: view.planHash,
            durationSeconds: 600,
            distanceMeters: 1000,
            verifiedAt: new Date().toISOString(),
            ...overrides,
          },
        ],
      )
    )[0].receipt_id;
    await actor(13);
    return result;
  };
  const approval = (
    await rows(
      "select approve_student_route_plan($1,$2,$3,$4,'TEST PLANNING APPROVAL',$5) result",
      [uuid(1), plan.id, 1, await proof(), randomUUID()],
    )
  )[0].result;
  const generate = async (
    p = approval,
    from = start,
    to = start,
    cancel = false,
    key = randomUUID(),
  ) =>
    (
      await rows(
        "select generate_student_manifests($1,$2,$3,$4,$5,'TEST DAILY PLANNING',$6,$7) result",
        [uuid(1), p.id, p.revision, from, to, key, cancel],
      )
    )[0].result;
  const approve = async (p) =>
    (
      await rows(
        "select approve_student_route_plan($1,$2,$3,$4,'TEST HARD LOCK REVIEW',$5) result",
        [uuid(1), p.id, p.revision, await proof(p), randomUUID()],
      )
    )[0].result;
  const smallVehicle = await save(
    "resource",
    resource("vehicle", {
      seats: 0,
      wheelchairPositions: 0,
      boosterSeats: 0,
      carSeats: 0,
      lift: false,
      securementReviewed: false,
    }),
    "TEST SMALL VEHICLE",
  );
  await assert.rejects(
    approve(await draft({ ...planData, vehicle: smallVehicle })),
    /cannot satisfy/,
  );
  await assert.rejects(
    approve(await draft({ ...planData, attendants: [] })),
    /dedicated attendant/,
  );
  const noCredentialDriver = await save(
    "resource",
    resource("driver", { credentials: [] }),
    "TEST NO DRIVER CREDENTIAL",
  );
  await assert.rejects(
    approve(await draft({ ...planData, driver: noCredentialDriver })),
    /credential missing/,
  );
  const expiringDriver = await save(
    "resource",
    resource("driver", { validUntil: start }),
    "TEST EXPIRING DRIVER",
  );
  await assert.rejects(
    approve(await draft({ ...planData, driver: expiringDriver })),
    /expires before/,
  );
  const missingPolicy = await save(
    "policy",
    { ...policyData, equipmentDriverKeys: {}, equipmentAttendantKeys: {} },
    "TEST MISSING EQUIPMENT POLICY",
    customer,
  );
  await assert.rejects(
    approve(await draft({ ...planData, policy: missingPolicy })),
    /specify Driver qualification/,
  );
  const mismatchPolicy = await save(
    "policy",
    { ...policyData, equipmentDriverKeys: { wheelchair_lift: ["lift_training"] } },
    "TEST EQUIPMENT TRAINING POLICY",
    customer,
  );
  await assert.rejects(
    approve(await draft({ ...planData, policy: mismatchPolicy })),
    /equipment-specific credential/,
  );
  const otherCustomer = (
    await rows(
      "select customer_id from student_transportation_customers where tenant_id=$1 and customer_id<>$2 and status='active' limit 1",
      [uuid(1), customer],
    )
  )[0].customer_id;
  const otherPolicy = await save("policy", policyData, "TEST OTHER SCHOOL POLICY", otherCustomer);
  await assert.rejects(
    approve(await draft({ ...planData, policy: otherPolicy })),
    /referenced review/,
  );
  await assert.rejects(draft({ ...planData, calendarReviewed: false }), /Valid term/);
  await assert.rejects(draft({ ...planData, timeZone: "EST" }), /Valid term/);
  await assert.rejects(
    draft({ ...planData, students: [{ ...student, sourceIndex: 0, identityConfirmed: false }] }),
    /identity mapping/,
  );
  const badProofPlan = await draft(planData);
  await assert.rejects(
    rows("select approve_student_route_plan($1,$2,$3,$4,'TEST PROOF REASON',$5)", [
      uuid(1),
      badProofPlan.id,
      1,
      await proof(badProofPlan, { durationSeconds: 10000 }),
      randomUUID(),
    ]),
    /duration does not fit/,
  );
  const forgedKey = randomUUID();
  await assert.rejects(
    rows("select approve_student_route_plan($1,$2,$3,$4,'TEST PROOF REASON',$5)", [
      uuid(1),
      badProofPlan.id,
      1,
      forgedKey,
      randomUUID(),
    ]),
    /Fresh server road preview/,
  );
  const expiredProof = await proof(badProofPlan);
  await db.exec("reset role");
  await rows(
    "update student_request_geography_receipts set expires_at=now()-interval '1 minute' where receipt_id=$1",
    [expiredProof],
  );
  await actor(13);
  await assert.rejects(
    rows("select approve_student_route_plan($1,$2,1,$3,'TEST EXPIRED PROOF',$4)", [
      uuid(1),
      badProofPlan.id,
      expiredProof,
      randomUUID(),
    ]),
    /Fresh server road preview/,
  );
  await assert.rejects(
    generate(
      approval,
      start,
      new Date(new Date(start).getTime() + 14 * 86400000).toISOString().slice(0, 10),
    ),
    /fourteen dates/,
  );
  assert.equal((await generate()).changedDates, 1);
  assert.equal((await generate()).changedDates, 0);
  assert.equal((await rows("select * from student_daily_manifests")).length, 1);
  assert.equal((await rows("select * from student_planning_reservations where active")).length, 3);
  await actor(21);
  await assert.rejects(rows("select my_student_planning($1)", [uuid(1)]), /Internal planning/);
  assert.equal((await rows("select * from student_daily_manifests")).length, 0);
  await actor(14);
  await assert.rejects(rows("select my_student_planning($1)", [uuid(1)]), /Internal planning/);
  await actor(13);
  await assert.rejects(
    rows("update student_planning_versions set state='active'"),
    /permission denied/,
  );
  await assert.rejects(rows("delete from student_daily_manifests"), /permission denied/);
  await db.exec("reset role");
  await assert.rejects(rows("update student_daily_manifests set state='cancelled'"), /immutable/);
  await assert.rejects(rows("truncate student_planning_versions cascade"), /immutable/);
  await actor(13);
  const collision = await draft(planData, null, "TEST COLLISION");
  const collisionApproval = (
    await rows("select approve_student_route_plan($1,$2,$3,$4,'TEST PLAN APPROVAL',$5) result", [
      uuid(1),
      collision.id,
      1,
      await proof(collision),
      randomUUID(),
    ])
  )[0].result;
  await assert.rejects(generate(collisionApproval), /already reserved/);
  assert.equal((await generate(approval, start, start, true)).changedDates, 1);
  assert.equal((await rows("select * from student_daily_manifests")).length, 2);
  assert.equal((await rows("select * from student_planning_reservations where active")).length, 0);
  assert.equal((await generate()).changedDates, 0); // Re-running generation must not undo explicit cancellation.
  const revised = await draft(
    { ...planData, name: "TEST REVISED MORNING" },
    approval,
    "TEST MORNING",
  );
  const revisedApproved = await approve(revised);
  assert.equal((await generate(revisedApproved)).changedDates, 1);
  const beforeClose = await rows(
    "select * from student_daily_manifests where schedule_id=$1 order by revision",
    [plan.id],
  );
  assert.equal(beforeClose.length, 3);
  assert.equal(beforeClose[0].snapshot.schedule.name, "TEST MORNING SCHOOL");
  assert.equal(beforeClose[2].snapshot.schedule.name, "TEST REVISED MORNING");
  const closureDraft = await draft(
    { ...planData, exceptions: [{ date: start, reason: "TEST SCHOOL CLOSED" }] },
    revisedApproved,
    "TEST MORNING",
  );
  const closureApproval = await approve(closureDraft);
  assert.equal((await generate(closureApproval)).changedDates, 1);
  assert.equal(
    (
      await rows(
        "select * from student_daily_manifests where schedule_id=$1 order by revision desc limit 1",
        [plan.id],
      )
    )[0].state,
    "cancelled",
  );
  assert.equal((await rows("select * from student_planning_reservations where active")).length, 0);
  const dstYear = new Date().getUTCFullYear() + 1;
  const findSunday = (month, ordinal) => {
    const day = new Date(Date.UTC(dstYear, month, 1));
    while (day.getUTCDay() !== 0) day.setUTCDate(day.getUTCDate() + 1);
    day.setUTCDate(day.getUTCDate() + 7 * (ordinal - 1));
    return day.toISOString().slice(0, 10);
  };
  for (const [day, time, endTime] of [
    [findSunday(2, 2), "02:15", "03:45"],
    [findSunday(10, 1), "01:15", "02:45"],
  ]) {
    const dst = await approve(
      await draft({ ...planData, startDate: day, endDate: day, startTime: time, endTime }),
    );
    await assert.rejects(generate(dst, day, day), /ambiguous or nonexistent/);
  }
  const springDay = findSunday(2, 2);
  const slowSpringDraft = await draft({
    ...planData,
    startDate: springDay,
    endDate: springDay,
    startTime: "01:00",
    endTime: "03:00",
  });
  const slowSpring = (
    await rows("select approve_student_route_plan($1,$2,1,$3,'TEST DST DURATION',$4) result", [
      uuid(1),
      slowSpringDraft.id,
      await proof(slowSpringDraft, { durationSeconds: 5400 }),
      randomUUID(),
    ])
  )[0].result;
  await assert.rejects(generate(slowSpring, springDay, springDay), /actual dated service window/);
  const outbound = await draft({
    ...planData,
    direction: "outbound",
    points: [points[1], points[0]],
  });
  const outboundView = (
    await rows("select student_route_plan_preview($1,$2,$3) result", [uuid(1), outbound.id, 1])
  )[0].result;
  assert.equal(outboundView.snapshot.points[0].data.stopIndex, 1);
  assert.equal(outboundView.snapshot.segments[0].wheelchairPositions, 1);
  const currentPoint = (
    await rows("select data from student_planning_versions where entity_id=$1", [points[0].id])
  )[0].data;
  const moved = await save(
    "point",
    { ...currentPoint, latitude: 40.0001 },
    "TEST POINT 0",
    customer,
    points[0],
  );
  assert.equal(moved.revision, 2);
  await assert.rejects(generate(closureApproval, start, start), /superseded/);
  await assert.rejects(save("point", currentPoint, "TEST POINT 0", customer, points[0]), /changed/);
  await actor(12);
  await assert.rejects(save("policy", policyData), /Explicit internal reviewer/);
  await actor(13);
  await assert.rejects(rows("select my_student_planning($1)", [uuid(2)]), /Internal planning/);
  const boosterChild = await save(
    "student",
    { ...studentData, name: "TEST BOOSTER CHILD", requirements: ["booster_seat"], seating: "seat" },
    "TEST BOOSTER CHILD",
    customer,
  );
  const carSeatChild = await save(
    "student",
    { ...studentData, name: "TEST CAR SEAT CHILD", requirements: ["car_seat"], seating: "seat" },
    "TEST CAR SEAT CHILD",
    customer,
  );
  await db.exec("reset role");
  const groupedRequest = (
    await rows(
      "insert into student_transportation_requests(tenant_id,customer_id,submitted_by,idempotency_key,payload_hash,scheduled_at,destination_address,students,geography_status,geography,intake_hash) values($1,$2,$3,$4,'TEST GROUP HASH',now()+interval '1 day','TEST SHARED SCHOOL',$5,'geocoded',$6,'TEST GROUP INTAKE') returning request_id",
      [
        uuid(1),
        customer,
        uuid(21),
        randomUUID(),
        [
          {
            name: "TEST GROUP A",
            pickupAddress: stop.address,
            accommodations: ["wheelchair_lift", "attendant"],
          },
          { name: "TEST GROUP B", pickupAddress: stop.address, accommodations: ["booster_seat"] },
          { name: "TEST GROUP C", pickupAddress: stop.address, accommodations: ["car_seat"] },
        ],
        { safetyStatus: "unreviewed", stops: [stop, stop, stop, stop] },
      ],
    )
  )[0].request_id;
  await actor(13);
  const multiPoints = [];
  for (let i = 0; i < 4; i++)
    multiPoints.push(
      await save(
        "point",
        { ...currentPoint, requestId: groupedRequest, stopIndex: i },
        "TEST GROUP POINT " + i,
        customer,
      ),
    );
  const groupedData = {
    ...planData,
    requestId: groupedRequest,
    points: multiPoints,
    students: [student, boosterChild, carSeatChild].map((s, i) => ({
      ...s,
      sourceIndex: i,
      identityConfirmed: true,
    })),
  };
  const group = await draft(groupedData);
  const groupView = (
    await rows("select student_route_plan_preview($1,$2,1) result", [uuid(1), group.id])
  )[0].result;
  assert.deepEqual(
    groupView.snapshot.segments.map((s) => [
      s.studentSeats,
      s.wheelchairPositions,
      s.attendantSeats,
      s.boosterSeats,
      s.carSeats,
    ]),
    [
      [0, 1, 1, 0, 0],
      [1, 1, 1, 1, 0],
      [2, 1, 1, 1, 1],
    ],
  );
  const groupOut = await draft({
    ...groupedData,
    direction: "outbound",
    points: [multiPoints[3], ...multiPoints.slice(0, 3)],
  });
  const groupOutView = (
    await rows("select student_route_plan_preview($1,$2,1) result", [uuid(1), groupOut.id])
  )[0].result;
  assert.deepEqual(
    groupOutView.snapshot.segments.map((s) => [
      s.studentSeats,
      s.wheelchairPositions,
      s.attendantSeats,
      s.boosterSeats,
      s.carSeats,
    ]),
    [
      [2, 1, 1, 1, 1],
      [2, 0, 1, 1, 1],
      [1, 0, 1, 0, 1],
    ],
  );
  await db.exec("reset role");
  const ownRequest = (
    await rows(
      "insert into student_transportation_requests(tenant_id,customer_id,submitted_by,idempotency_key,payload_hash,scheduled_at,destination_address,students,geography_status,geography,intake_hash) select tenant_id,customer_id,$1,$2,'TEST SELF REVIEW',now()+interval '1 day',destination_address,students,geography_status,geography,'TEST SELF INTAKE' from student_transportation_requests where request_id=$3 returning request_id",
      [uuid(13), randomUUID(), request],
    )
  )[0].request_id;
  await actor(13);
  const ownPoints = [];
  for (let i = 0; i < 2; i++)
    ownPoints.push(
      await save(
        "point",
        { ...currentPoint, requestId: ownRequest, stopIndex: i },
        "TEST OWN POINT " + i,
        customer,
      ),
    );
  await assert.rejects(
    approve(await draft({ ...planData, requestId: ownRequest, points: ownPoints })),
    /different reviewer/,
  );
  const futurePlan = await approve(await draft({ ...planData, points: [moved, points[1]] }));
  const nextDay = new Date(new Date(start).getTime() + 86400000).toISOString().slice(0, 10);
  assert.equal((await generate(futurePlan, nextDay, nextDay)).changedDates, 1);
  assert.equal((await rows("select * from student_planning_reservations where active")).length, 3);
  await actor(21);
  await rows("select withdraw_student_transport_request($1,$2)", [uuid(1), request]);
  await actor(13);
  const context = (await rows("select my_student_planning($1) result", [uuid(1)]))[0].result;
  assert.equal(context.records.find((r) => r.id === plan.id).state, "cancelled");
  assert.equal(context.records.find((r) => r.id === futurePlan.id).state, "cancelled");
  assert.equal((await rows("select * from student_planning_reservations where active")).length, 0);
  const withdrawnHistory = await rows(
    "select * from student_daily_manifests where schedule_id=$1 order by revision",
    [futurePlan.id],
  );
  assert.equal(withdrawnHistory[0].state, "planned");
  assert.equal(withdrawnHistory[1].state, "cancelled");
  assert.equal(withdrawnHistory[1].actor_id, uuid(21));
  await assert.rejects(generate(collisionApproval), /schedule|Schedule/);
  await db.exec("reset role; set role anon");
  await assert.rejects(rows("select my_student_planning($1)", [uuid(1)]), /permission denied/);
  await assert.rejects(rows("select * from student_daily_manifests"), /permission denied/);
  await db.exec("reset role");
  console.log(
    "PASS Student planning canonical/point/resource/policy revisions, schedule preview/approval, immutable manifests, reservations/conflicts, cancellation, source withdrawal and internal-only access (minimal actual SQL fixtures).",
  );
};
