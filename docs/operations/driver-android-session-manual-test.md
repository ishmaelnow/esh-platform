# Driver Android session acceptance

Signer alignment follow-up, 2026-10-08: Driver assetlinks now trusts the signer verified on the
downloaded tracking Driver and Rider APKs, matching Rider's working association. Push/deploy Driver
first and confirm its public /.well-known/assetlinks.json includes the 8E:0A:... fingerprint.
No APK rebuild or migration is needed. On Android, Settings > Apps > ESH Driver > Open by default:
enable Open supported links and select driver.eshapp.com (possibly under Add links). Device labels
vary. Request a fresh email link from installed Driver and confirm it opens the installed app,
then confirm same-account background/return, close/reopen and normal token refresh without email.
Do not share callback URLs/tokens. Browser authentication does not populate the native vault.
If link verification still fails, read-only `adb shell pm get-app-links com.esh.driver` can inspect
device state when connected; do not reset data or reinstall solely to recover a browser session.

2026-10-08 follow-up: hosted launch-link replay protection is local. After its Driver deployment is
Ready, sign in once with a fresh link, open Driver home, background/return, close/reopen from its
installed icon, and reload again after token refresh. Expect the same account without new email.
Verify explicit sign-out still works and a different fresh link can sign in to another test account.
Do not reinstall merely to test this hosted correction; no migration/native build is required.
This code-path protection does not establish the original device cause; record remaining failures
without printing credentials or magic links.

Owner pushes the scoped correction, verifies ESH Driver hosted Ready and runs **ESH Driver Android**
in Codemagic from that commit. Install 1.0.4/code 5 using the existing release signing. No migration
or Driver iOS rebuild. Keep the working camera plugin and navigation registration.

1. Sign in once, then check Profile name/email against the intended test Driver. Verify identity
   remains correct after background/return, closing/relaunching and restarting the phone. Valid
   sessions should restore without requesting another email.
2. Let an access token refresh normally, reopen and verify identity again. Server-revoked or expired
   sessions legitimately require sign-in; this fix does not bypass those restrictions.
3. Explicitly Sign out from Settings, close/reopen and confirm signed-out state. Sign in as a second
   test Driver and confirm prior profile/documents are absent. Rider session must remain separate.
4. Go offline/background/return, then online. Recovery errors must not deliberately delete stored
   credentials. Report version/build, exact error and whether the email link opened Chrome or Driver
   if verification still repeats. Do not share magic links, access tokens or refresh tokens.
5. In Documents, verify existing Take photo, cancellation, file/library selection and private
   viewing still work. Use identifiable test evidence only. Check navigation UI without initiating
   trips/emergencies/payouts. Leave Driver Offline and restore temporary settings.

Native encrypted storage is excluded from backup/device transfer. Clearing app data/uninstalling
requires new sign-in. Automated bridge fixtures verify JS session flow, not physical Keystore
durability; signed-device acceptance remains required.
