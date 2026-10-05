# Rider profile acceptance

iOS Camera crash follow-up: Rider now declares camera and photo-library usage descriptions.
Owner must push this correction, run ESH Rider iOS in Codemagic and install the newest TestFlight
build. Existing workflow generates a unique build number. A hosted deployment alone is insufficient.
Verify permission prompt, capture/upload, cancellation, denial, library/files and retained sign-in.
Do not rebuild Driver or change iOS authentication for this fix. Android now has a Rider-only native
encrypted session adapter and foreground recovery; build/install ESH Rider Android 1.0.2/code 3
as well. No additional migration. See `../architecture/rider-native-session-recovery.md`.

Native release acceptance:

- iOS: selecting Camera must prompt rather than crash. Capture/upload, cancel, deny permission,
  choose library/files and view/remove the photo. Existing sign-in persistence must remain intact.
- Android: sign in once through the email link, verify the same email in Account, background/return,
  close/relaunch, and restart the phone. A valid session must restore without another email prompt.
  Let an access token refresh normally, repeat, then explicitly sign out and relaunch: remain signed
  out. Sign back in as a different test Rider and verify no prior account details/photo appear.
- Offline: show a connection/recovery error without deliberately deleting saved credentials. Return
  online and reopen. Revoked/expired sessions legitimately require sign-in; no session bypass.
- Verify HTTPS email callback opens the installed Rider, not only Chrome. Existing fingerprint
  association and supported-link settings must match the installed signed build. Do not post tokens
  or magic links. Record version/build and exact error if the prompt repeats after this update.

Requires `20261005000100_rider_profile_account.sql` and the existing server-only Supabase service
configuration. Owner first runs `corepack pnpm exec supabase db push --dry-run` and checks that
only this intended migration is listed. Apply it only after that confirmation, then deploy code.
No migration or deployment has been performed by Codex. Never expose populated environment files.

Local layout preview: `node tooling/scripts/rider-preview.cjs`. This uses fixtures and does not
prove production persistence. Automated preview checks: append `--tests`. Do not run a production
build concurrently with the preview. Real acceptance uses the Rider app URL, not Admin or Driver.

1. Sign into a clearly identified test Rider. Open the hamburger menu, then Account. Confirm the
   existing name, optional contact phone and read-only verified email. Save edited name, phone and
   notes; reopen Account and reload. Verify persistence. Blank name must not save. Empty phone and
   notes are allowed. Saving phone must not grant SMS consent or verify the number.
2. Select JPEG/PNG using library/files. Selection saves the photo immediately. Reopen/reload;
   preview must persist. Remove photo, reload and confirm the placeholder. Try PDF/corrupt image,
   offline upload and cancellation; preserve prior photo/text and provide useful feedback. Large
   supported images are reduced; source files above 20 MB are rejected. Photo is never required
   for requesting a trip. Use Refresh photo if a signed preview expires.
3. Check 414 x 896 and 320 x 600, then focus name/phone/notes with the device keyboard open. Scroll
   to every field and Save profile; no horizontal overflow or obscured action. Repeat selection,
   save and preview on installed iOS and Android. Physical-device checks remain owner acceptance.
4. With a second Rider, prove the first Rider's profile/photo cannot be fetched or changed. With
   another provider, prove edits remain provider-specific. An unsigned, unverified or suspended
   identity must not update the profile. Direct client object writes and table updates must fail.
5. Return to Request ride. Verify the approved map, address entry, vehicles/payment and booking
   remain usable. Do not create/pay a production booking merely to test the profile. Restore all
   temporary settings and test profile details afterward.

Run `tooling/sql/rider-profile-account-test.sql` only against a disposable/local Supabase database
with all migrations installed, using `psql -v ON_ERROR_STOP=1 -f` and that file path. It uses metadata
fixtures and rolls back. Local Docker was unavailable during implementation, so database execution
and real-account acceptance are outstanding.

On ambiguous upload failure refresh before retrying: the metadata transaction might have committed.
For cleanup, privately compare bucket objects with every current `rider_profiles.photo_storage_path`;
delete only confirmed unreferenced objects after allowing in-flight uploads to finish. Do not log
paths, phone numbers, signed URLs or credentials. Existing signed links can survive until expiry.
