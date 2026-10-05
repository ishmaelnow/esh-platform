# Driver Android session acceptance

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
