// Local disposable PostgreSQL; no credentials or remote connections.
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("../../tmp/native-push-sql/node_modules/@electric-sql/pglite");
async function main() {
  const db = new PGlite();
  try {
    for (const file of ["tooling/sql/native-push-bootstrap.sql", "supabase/migrations/20261006000100_native_push_notifications.sql",
      "tooling/sql/notification-channel-bootstrap.sql", "supabase/migrations/20261008000200_notification_channel_preferences.sql",
      "tooling/sql/driver-preorders-bootstrap.sql", "supabase/migrations/20261009000100_driver_preorders.sql",
      "supabase/migrations/20261010000100_trip_messages.sql", "tooling/sql/trip-participant-photos-test.sql",
      "supabase/migrations/20261010000200_trip_participant_photos.sql", "tooling/sql/trip-participant-photos-assert.sql"])
      await db.exec(fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8"));
    console.log("Trip participant photo ownership, image selection, audit and lifecycle checks passed (minimal schema).");
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
