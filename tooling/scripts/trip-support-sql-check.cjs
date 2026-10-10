// Disposable in-memory PostgreSQL only; never reads credentials or connects remotely.
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("../../tmp/native-push-sql/node_modules/@electric-sql/pglite");
async function main() {
  const db = new PGlite();
  try {
    for (const file of ["tooling/sql/trip-support-bootstrap.sql", "supabase/migrations/20261010000400_trip_support.sql", "tooling/sql/trip-support-test.sql"])
      await db.exec(fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8"));
    console.log("Trip support ownership, tenant boundaries, retries, review conflicts and audit smoke passed (minimal schema).");
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
