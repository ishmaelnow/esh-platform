// Disposable embedded PostgreSQL only. No environment or network access.
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("../../tmp/native-push-sql/node_modules/@electric-sql/pglite");
async function main() {
  const db = new PGlite();
  try {
    for (const file of ["tooling/sql/native-push-bootstrap.sql", "supabase/migrations/20261006000100_native_push_notifications.sql",
      "tooling/sql/notification-channel-bootstrap.sql", "supabase/migrations/20261008000200_notification_channel_preferences.sql",
      "tooling/sql/driver-preorders-bootstrap.sql", "supabase/migrations/20261009000100_driver_preorders.sql",
      "supabase/migrations/20261010000400_trip_support.sql", "supabase/migrations/20261010000500_trip_support_notifications.sql",
      "tooling/sql/trip-support-notifications-test.sql"]) {
      try { await db.exec(fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")); }
      catch (error) { throw new Error(`${file}: ${error.message}`); }
    }
    console.log("Support notification ownership, deduplication, preferences, native claims and privacy smoke passed (minimal legacy schema).");
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
