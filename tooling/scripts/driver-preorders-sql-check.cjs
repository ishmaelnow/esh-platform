// Disposable local PostgreSQL only. No environment credentials or remote connections.
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("../../tmp/native-push-sql/node_modules/@electric-sql/pglite");
const read = (file) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8");
async function main() {
  const db = new PGlite();
  try {
    for (const file of ["tooling/sql/native-push-bootstrap.sql", "supabase/migrations/20261006000100_native_push_notifications.sql",
      "tooling/sql/notification-channel-bootstrap.sql", "supabase/migrations/20261008000200_notification_channel_preferences.sql"])
      await db.exec(read(file));
    await db.exec(read("tooling/sql/driver-preorders-bootstrap.sql"));
    const matching = read("supabase/migrations/20260801001200_automatic_driver_matching.sql");
    for (const name of ["match_dispatch_booking", "trigger_automatic_matching"])
      await db.exec(matching.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, "i"))[0]);
    await db.exec("create trigger dispatch_bookings_automatic_matching after insert or update of status on public.dispatch_bookings for each row execute function public.trigger_automatic_matching();");
    await db.exec(read("supabase/migrations/20261007000100_rider_active_booking_guard.sql"));
    await db.exec(read("supabase/migrations/20261009000100_driver_preorders.sql"));
    const blocks = [];
    const fixture = read("tooling/sql/driver-preorders-test.sql").replace(/\$\$[\s\S]*?\$\$/g, (block) => {
      blocks.push(block); return `__SQL_BLOCK_${blocks.length - 1}__`;
    });
    for (const part of fixture.split(/;\s*(?:\r?\n|$)/)) {
      const statement = part.replace(/__SQL_BLOCK_(\d+)__/g, (_, index) => blocks[Number(index)]).trim();
      if (!statement) continue;
      try { await db.exec(`${statement};`); }
      catch (error) { throw new Error(`Fixture ${statement.slice(0, 160)}: ${error.message}`); }
    }
    console.log("Driver preorder reservation, privacy, scheduling and priority/fallback smoke passed (minimal schema).");
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
