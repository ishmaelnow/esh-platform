// Uses only an in-memory test database, with minimal fixture dependencies. No env or remote access.
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("../../tmp/native-push-sql/node_modules/@electric-sql/pglite");
async function main() {
  const db = new PGlite();
  try {
    for (const file of ["tooling/sql/native-push-bootstrap.sql", "supabase/migrations/20261006000100_native_push_notifications.sql", "tooling/sql/native-push-test.sql"])
      await db.exec(fs.readFileSync(path.resolve(__dirname,"../..",file),"utf8"));
    console.log("Native push migration and isolation regression passed in embedded PostgreSQL (minimal dependency schema).");
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode=1; });
