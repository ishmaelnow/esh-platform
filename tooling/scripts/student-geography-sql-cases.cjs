// Called by the existing actual-Student-migration harness; disposable TEST fixtures only.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
module.exports = async function geographyCases({ db, read, rows, actor, uuid, customer, when }) {
  await db.exec(read("supabase/migrations/20261016000100_student_request_geography.sql"));
  const baseline = await rows("select * from student_request_history where event_name='baseline'");
  assert.ok(baseline.length > 0);
  assert.equal(baseline[0].actor_person_id, null);
  assert.equal(
    (await rows("select geography_status from student_transportation_requests limit 1"))[0]
      .geography_status,
    "unverified",
  );
  const stop = {
    address: "TEST PRECISE STREET ADDRESS",
    latitude: 40,
    longitude: -75,
    addressLatitude: 40,
    addressLongitude: -75,
    accuracy: "rooftop",
    pointSource: "routable",
    loadingInstructions: "TEST NORTH GATE",
    safetyStatus: "unreviewed",
  };
  const payload = {
    scheduledAt: when,
    destination: stop.address,
    students: [
      {
        name: "TEST ACCOMMODATED STUDENT",
        pickupAddress: stop.address,
        accommodations: ["wheelchair_lift", "attendant"],
      },
    ],
    geography: { safetyStatus: "unreviewed", stops: [stop, stop], provider: "mapbox" },
  };
  const receipt = async (
    hash = "TEST INPUT HASH",
    body = payload,
    expires = new Date(Date.now() + 600000).toISOString(),
  ) => {
    await db.exec("reset role; set role service_role");
    const id = (
      await rows(
        "insert into student_request_geography_receipts(tenant_id,customer_id,auth_user_id,input_hash,payload,expires_at) values($1,$2,$3,$4,$5,$6) returning receipt_id",
        [uuid(1), customer, uuid(21), hash, body, expires],
      )
    )[0].receipt_id;
    await actor(21);
    return id;
  };
  const submit = async (id, key = randomUUID(), tenant = uuid(1), account = customer) =>
    (
      await rows("select submit_geographic_student_request($1,$2,$3,$4) as id", [
        tenant,
        account,
        key,
        id,
      ])
    )[0].id;
  const firstReceipt = await receipt();
  const key = randomUUID();
  await assert.rejects(
    rows(
      "insert into student_request_geography_receipts(tenant_id,customer_id,auth_user_id,input_hash,payload) values($1,$2,$3,'FORGED',$4)",
      [uuid(1), customer, uuid(21), payload],
    ),
    /permission denied/,
  );
  assert.equal((await rows("select * from student_request_history")).length, baseline.length);
  const request = await submit(firstReceipt, key);
  assert.equal(await submit(firstReceipt, key), request);
  assert.equal(
    (await rows("select * from student_request_history where request_id=$1", [request])).length,
    1,
  );
  assert.equal(
    (await rows("select * from student_transportation_requests where request_id=$1", [request]))[0]
      .students[0].accommodations[0],
    "wheelchair_lift",
  );
  const changedReceipt = await receipt("CHANGED INPUT HASH");
  await assert.rejects(submit(changedReceipt, key), /already used/);
  const expired = await receipt("EXPIRED", payload, "2000-01-01");
  await assert.rejects(submit(expired), /Preview expired/);
  await assert.rejects(submit(randomUUID()), /Verified preview/);
  await assert.rejects(submit(firstReceipt, randomUUID(), uuid(2)), /Customer access/);
  await actor(23);
  assert.equal((await rows("select * from student_request_history")).length, 0);
  await assert.rejects(submit(firstReceipt), /Customer access/);
  await db.exec("reset role");
  await db.query(
    "insert into student_transportation_customer_users select $1,$2,person_id from person_profiles where auth_user_id=$3",
    [uuid(1), customer, uuid(23)],
  );
  await actor(23);
  await assert.rejects(submit(firstReceipt), /Verified preview/); // Same customer, different verified actor.
  await db.exec("reset role");
  await db.query(
    "delete from student_transportation_customer_users where customer_id=$1 and person_id in (select person_id from person_profiles where auth_user_id=$2)",
    [customer, uuid(23)],
  );
  await actor(14);
  assert.equal((await rows("select * from student_request_history")).length, 0); // Owner alone cannot read children.
  await rows("select set_student_customer_status($1,$2,false)", [uuid(1), customer]);
  await actor(21);
  await assert.rejects(submit(firstReceipt), /Customer access/);
  assert.equal((await rows("select * from student_request_history")).length, 0);
  await actor(14);
  await rows("select set_student_customer_status($1,$2,true)", [uuid(1), customer]);
  await actor(21);
  await rows("select withdraw_student_transport_request($1,$2)", [uuid(1), request]);
  await rows("select withdraw_student_transport_request($1,$2)", [uuid(1), request]);
  const history = await rows(
    "select * from student_request_history where request_id=$1 order by recorded_at",
    [request],
  );
  assert.equal(history.length, 2);
  assert.equal(history[1].event_name, "withdrawn");
  assert.equal(history[0].snapshot.status, "submitted");
  assert.equal(history[1].actor_person_id, uuid(21));
  await assert.rejects(
    db.exec("update student_request_history set event_name='withdrawn'"),
    /permission denied/,
  );
  await db.exec("reset role; set role service_role");
  await assert.rejects(db.exec("delete from student_request_history"), /permission denied/);
  await db.exec("reset role");
  await assert.rejects(
    db.exec("update student_request_history set event_name='withdrawn'"),
    /immutable/,
  );
  await assert.rejects(db.exec("truncate student_request_history"), /immutable/);
  await assert.rejects(
    rows(
      "update student_transportation_requests set destination_address='CHANGED STREET ADDRESS' where request_id=$1",
      [request],
    ),
    /cannot be edited/,
  );
  await assert.rejects(
    rows("delete from student_transportation_requests where request_id=$1", [request]),
    /cannot be deleted|RESTRICT/,
  );
  const malformed = await receipt("INVALID TAG", {
    ...payload,
    students: [{ ...payload.students[0], accommodations: ["diagnosis"] }],
  });
  await assert.rejects(submit(malformed), /equipment requirements/);
  await db.exec("reset role");
  assert.equal(
    (
      await rows(
        "select count(*)::int n from tenant_product_entitlements where workspace_key='student_transportation'",
      )
    )[0].n,
    0,
  );
  assert.ok(
    !JSON.stringify(
      await rows(
        "select metadata,reason from tenant_audit_events where event_name='student_request.submitted'",
      ),
    ).includes("TEST ACCOMMODATED"),
  );
  console.log(
    "PASS Student geographic receipts, actor/tenant isolation, legacy unverified baseline, tags, retries/expiry, immutable private submission/withdrawal snapshots and closed operations.",
  );
};
