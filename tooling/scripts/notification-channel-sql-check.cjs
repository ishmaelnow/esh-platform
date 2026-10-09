// Disposable embedded PostgreSQL only; no remote/environment access.
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("../../tmp/native-push-sql/node_modules/@electric-sql/pglite");
async function main() {
  const db = new PGlite();
  try {
    for (const file of ["tooling/sql/native-push-bootstrap.sql", "supabase/migrations/20261006000100_native_push_notifications.sql",
      "tooling/sql/notification-channel-bootstrap.sql", "supabase/migrations/20261008000200_notification_channel_preferences.sql"])
      await db.exec(fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8"));
    // Exercise the actual existing producer, rather than a copied implementation.
    const source = fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/20260801001100_scheduled_rider_bookings.sql"), "utf8");
    const producer = source.match(/create or replace function public\.queue_rider_booking_notification\(\)[\s\S]*?\$\$;/i);
    if (!producer) throw new Error("Existing booking notification producer not found.");
    await db.exec(producer[0]);
    await db.exec("create trigger test_booking_channel after insert or update on public.dispatch_bookings for each row execute function public.queue_rider_booking_notification();");
    await db.exec(fs.readFileSync(path.resolve(__dirname, "../../tooling/sql/notification-channel-test.sql"), "utf8"));
    console.log("Independent email/device channel migration and privacy smoke passed (minimal schema).");
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
