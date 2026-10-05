# Driver Android session recovery

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
