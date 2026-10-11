// Disposable local PostgreSQL only. Never connects to production.
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("../../tmp/native-push-sql/node_modules/@electric-sql/pglite");
async function main() {
  const db = new PGlite();
  try {
    const files = ["tooling/sql/native-push-bootstrap.sql", "supabase/migrations/20261006000100_native_push_notifications.sql",
      "tooling/sql/notification-channel-bootstrap.sql", "supabase/migrations/20261008000200_notification_channel_preferences.sql",
      "tooling/sql/driver-preorders-bootstrap.sql", "supabase/migrations/20261009000100_driver_preorders.sql",
      "supabase/migrations/20261010000400_trip_support.sql", "supabase/migrations/20261010000500_trip_support_notifications.sql",
      "supabase/migrations/20261010000600_driver_trip_support.sql"];
    for (const file of files) await db.exec(fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8"));
    await db.exec("create table trip_ratings(tenant_id uuid,booking_id uuid,reviewer_type text);");
    for (const file of ["supabase/migrations/20261011000200_trip_rating_reminders.sql", "tooling/sql/trip-rating-reminders-test.sql"])
      await db.exec(fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8"));
    console.log("Rating reminder dedupe, consent, ownership, delayed claims, cancellation and expiry passed (minimal schema).");
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
