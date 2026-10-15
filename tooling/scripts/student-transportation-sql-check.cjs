// Disposable database only. No remote connection, credentials or production mutation.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("../../tmp/native-push-sql/node_modules/@electric-sql/pglite");
async function main() {
  const db = new PGlite();
  try {
    for (const file of [
      "tooling/sql/student-transportation-bootstrap.sql",
      "supabase/migrations/20261014000100_student_transportation_foundation.sql",
    ])
      await db.exec(fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8"));
    const rows = async (sql) => (await db.query(sql)).rows;
    // Exercise the actual existing tenant seed function, not a copied test implementation.
    const workspaceMigration = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../supabase/migrations/20260823000300_product_workspace_foundation.sql",
      ),
      "utf8",
    );
    const seed = workspaceMigration.match(
      /create or replace function public\.seed_product_workspaces\(\)[\s\S]*?\$\$;/,
    );
    assert.ok(seed);
    await db.exec(seed[0]);
    await db.exec(
      "create trigger tenants_seed_product_workspaces after insert on tenants for each row execute function seed_product_workspaces()",
    );
    assert.equal(
      (
        await rows(
          "select * from tenant_product_workspaces where workspace_key='student_transportation' and status='disabled'",
        )
      ).length,
      2,
    );
    assert.equal(
      (
        await rows(
          "select * from tenant_product_entitlements where workspace_key='student_transportation'",
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await rows(
          "select * from workspace_role_catalog where workspace_key='student_transportation' and assignable",
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await rows(
          "select * from tenant_product_workspaces where workspace_key='transportation' and status='enabled'",
        )
      ).length,
      2,
    );
    const tenant = "'00000000-0000-0000-0000-000000000001'";
    await assert.rejects(
      db.exec(
        `update tenant_product_workspaces set status='enabled' where workspace_key='student_transportation'`,
      ),
      /not available for activation/,
    );
    await assert.rejects(
      db.exec(
        `insert into tenant_product_entitlements values (${tenant}, 'student_transportation', 'granted')`,
      ),
      /not available for activation/,
    );
    // Guards must not interfere with existing product updates.
    await db.exec(
      "update tenant_product_workspaces set status='enabled' where workspace_key='transportation'",
    );
    await db.exec(
      "update tenant_product_entitlements set status='granted' where workspace_key='transportation'",
    );
    await db.exec(
      `insert into student_transportation_launch_controls (tenant_id) values (${tenant})`,
    );
    await assert.rejects(
      db.exec("update student_transportation_launch_controls set operations_enabled=true"),
      /student_transportation_not_launched/,
    );
    const rls = await rows(
      "select relrowsecurity from pg_class where relname='student_transportation_launch_controls'",
    );
    assert.equal(rls[0].relrowsecurity, true);
    await db.exec("set role authenticated");
    for (const roles of [
      "array['student_transport_admin']",
      "array['student_transport_guardian']",
      "array['transportation_admin']",
      "array[]::text[]",
      "null::text[]",
    ])
      assert.equal(
        (
          await rows(
            `select has_student_transportation_operational_access(${tenant}, ${roles}) as allowed`,
          )
        )[0].allowed,
        false,
      );
    assert.equal(
      (
        await rows(
          "select has_student_transportation_operational_access('00000000-0000-0000-0000-000000000002', array['student_transport_operator']) as allowed",
        )
      )[0].allowed,
      false,
    );
    await assert.rejects(
      db.exec("select * from student_transportation_launch_controls"),
      /permission denied/,
    );
    await assert.rejects(
      db.exec(
        `insert into student_transportation_launch_controls (tenant_id) values ('00000000-0000-0000-0000-000000000002')`,
      ),
      /permission denied/,
    );
    await db.exec("reset role; set role anon");
    await assert.rejects(
      db.exec(
        `select has_student_transportation_operational_access(${tenant}, array['student_transport_admin'])`,
      ),
      /permission denied/,
    );
    await db.exec("reset role; set role service_role");
    assert.equal((await rows("select * from student_transportation_launch_controls")).length, 1);
    await db.exec("reset role");
    await db.exec("insert into tenants values ('00000000-0000-0000-0000-000000000003')");
    assert.equal(
      (
        await rows(
          "select status from tenant_product_workspaces where tenant_id='00000000-0000-0000-0000-000000000003' and workspace_key='student_transportation'",
        )
      )[0].status,
      "disabled",
    );
    console.log(
      "PASS disabled product, unassignable roles, activation guards, existing-product compatibility, RLS/privileges and fail-closed tenant access (minimal schema; not full platform integration).",
    );
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
