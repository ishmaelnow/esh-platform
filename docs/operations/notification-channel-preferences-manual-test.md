# Independent notification channels: release and acceptance

Owner performs database and deployment commands. First run from the repository:

```sh
corepack pnpm exec supabase db push --dry-run
```

Confirm only 20261008000200_notification_channel_preferences.sql is listed before proceeding with
the real push. Deploy Admin, Rider and Driver after migration. Transportation reuses the Admin
notification UI and also needs its hosted update for the new status label. No APK/IPA rebuild
or new environment variable is needed for already push-capable installed shells.

Use identifiable test accounts and record original preferences. Keep unrelated account/device
sessions separate. Do not send emergency actions or create financial transactions only for this test.

1. Rider: enable Mobile alerts and disable trip emails. During one controlled ride, confirm the
   driver-accepted/arrived alert arrives once and there is no corresponding trip email.
2. Driver: in Notifications disable new-trip-offer emails and leave Mobile alerts on. Send one
   controlled dispatcher offer; confirm the device alert and absence of the offer email.
3. Disable device alerts while enabling the relevant email. Confirm email delivery remains enabled.
4. Disable both choices; verify no device message or optional email for the matching event.
5. Re-enable emails; verify future events deliver, without replaying previously skipped messages.
6. Refresh/reopen both apps and confirm each saved email choice persists. With network unavailable,
   try changing a choice and confirm it does not falsely show a successfully saved setting.
7. Sign out; verify device registration stops receiving new messages. Essential account/document
   emails remain governed by their original workflow, not the new offer-email switch.
8. Admin notification history: skipped optional emails show Email disabled. Native acceptance and
   actual device receipt remain separate observations; neither is inferred from email status.

Restore preferences, cancel unfinished test rides and return the Driver to Offline afterward.

Local database smoke (disposable only):

```sh
node tooling/scripts/notification-channel-sql-check.cjs
```

This harness uses the existing ignored tmp/native-push-sql PGlite installation. It never connects
to Supabase or sends notifications. Full Supabase/concurrency and physical iOS/Android checks remain
separate release acceptance.
