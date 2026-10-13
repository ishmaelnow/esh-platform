// Disposable local PostgreSQL only. Never connects to production.
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../../tmp/native-push-sql/node_modules/@electric-sql/pglite');
async function main() {
  const db = new PGlite();
  try {
    const files = ['tooling/sql/native-push-bootstrap.sql', 'supabase/migrations/20261006000100_native_push_notifications.sql',
      'tooling/sql/notification-channel-bootstrap.sql', 'supabase/migrations/20261008000200_notification_channel_preferences.sql',
      'tooling/sql/driver-preorders-bootstrap.sql', 'supabase/migrations/20261009000100_driver_preorders.sql',
      'supabase/migrations/20261010000400_trip_support.sql', 'supabase/migrations/20261010000500_trip_support_notifications.sql',
      'supabase/migrations/20261010000600_driver_trip_support.sql',
      'supabase/migrations/20260810000200_trip_reputation.sql', 'supabase/migrations/20260815000500_trip_rating_appeals_v2.sql',
      'supabase/migrations/20261011000200_trip_rating_reminders.sql', 'supabase/migrations/20261013000100_rating_appeal_review.sql',
      'supabase/migrations/20261013000200_rating_update_notifications.sql', 'tooling/sql/rating-updates-test.sql'];
    await db.exec("create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at:=now(); return new; end; $$;");
    for (const file of files) {
      try { await db.exec(fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8')); }
      catch (error) { throw new Error(file + ': ' + error.message); }
    }
    console.log('Rating updates: disclosure timing, privacy, consent, ownership, native claims, decisions, dedupe and expiry passed (minimal schema).');
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
