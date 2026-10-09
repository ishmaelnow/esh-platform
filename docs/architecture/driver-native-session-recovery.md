# Driver Android session recovery

## Verified Android link signer alignment (2026-10-08)

Driver and Rider use the same Codemagic android_signing identity, esh_android_upload, but Driver's
assetlinks file lacked the actual release signer trusted by Rider. Public hosted Driver JSON was
read-only verified to contain only 71:F7:... . apksigner confirmed the downloaded track-driver.apk
(com.esh.driver, 1.0.5/code6) and rider-track.apk both use SHA-256
8E:0A:3D:FB:CB:B6:0A:9A:51:34:6F:63:35:CE:81:AE:DB:3C:71:A6:47:7F:0E:5E:23:60:9E:4F:07:B8:03:1B.
Driver now trusts that verified signer in addition to the original certificate, preserving its own
package and domain. No key rotation, Rider change or native manifest/build change is required.
Android's device approval state still requires acceptance after hosted deployment; cached failure
or user link preferences can require selecting driver.eshapp.com under Open supported links.

Browser sign-in and native encrypted sign-in are separate stores. An email callback handled by
Chrome cannot establish Driver's native vault. Restoring link routing and signing in once inside
installed Driver is prerequisite to judging vault persistence. The replay correction alone did not
resolve the reported recurrence. Do not claim device acceptance before it is confirmed.

## Android launch-link replay protection (2026-10-08)

Android's original launch intent can be returned again on a later WebView mount. Driver previously
deduplicated callbacks only in component memory; this did not survive reload. A previously consumed
implicit callback could reintroduce old tokens after refresh. This is a plausible recurrence path,
not a device-log-confirmed diagnosis of the owner's report.

Successful Android sign-in callbacks now save a bounded list of SHA-256 URL fingerprints in
Driver-scoped WebView storage. Home's native listener and the hosted callback page skip receipts
already consumed. Failed callbacks are not receipted; different links still allow new sign-ins and
account switches. Raw links and tokens are never saved in receipts. Native callbacks must target
the Driver auth host/path or the same-origin hosted callback path. Existing encrypted credentials,
server expiration/revocation and explicit sign-out remain authoritative. Receipt storage failure
does not discard a successful sign-in. Clearing app data also clears receipts and session storage.

This is a hosted Driver correction: no migration or native rebuild is required on current shells.
After deployment, use a fresh sign-in once to establish its receipt, then test reopen, background
return and normal refresh on the installed Android Driver app. Physical acceptance remains required.

Owner clarified that repeated verification affects both Driver and Rider Android. Rider correction
is pushed as `3bf1fbb`; this follow-up applies the same session contract to Driver only. Driver
iOS authentication, working Android camera/navigation, dispatch, availability and evidence review
remain intact. No migration, token-lifetime extension or changed hosted Auth/domain settings.

DriverSessionStorage is registered alongside EmbeddedNavigation. It accepts only the isolated
`esh-driver-portal-auth` session and its PKCE verifier; Rider keys/origin are not accepted.
Preferences `esh_driver_session` contain AES-GCM ciphertext; key `esh.driver.session.v1` stays
in Android Keystore. A fresh IV and storage-key associated data protect each value. Cloud backup
and device transfer exclude this ciphertext. Existing WebView values migrate only after confirmed
native save. Explicit sign-out clears native and legacy session data. Failures report errors and
never silently reset the vault. No tokens, private paths or magic links are logged.

Home and callback use this adapter only on Android with the plugin available. Older shells,
ordinary browsers and iOS preserve existing storage. Android background/foreground controls refresh
and restores a still-valid session. A delayed initial read cannot replace a newer Auth event.
Successful Android callback dismisses the external browser. Supabase remains authoritative for
expiration/revocation. No Driver activation, availability or tenant permission is granted by storage.
The original device failure is not established from logs; acceptance on the signed build must
confirm whether the user's repeated-verification symptom is resolved.

Release requires hosted Driver deployment plus a new ESH Driver Android build/install,
version 1.0.4/code 5. Keep signing/bundle IDs. No Driver iOS rebuild is needed. Follow
`../operations/driver-android-session-manual-test.md`; Rider camera/session acceptance remains
separate. Reference design/security: `rider-native-session-recovery.md`.
