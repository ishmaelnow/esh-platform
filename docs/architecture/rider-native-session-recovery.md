# Rider native session recovery

Owner reported iOS crashing immediately when Camera was selected and Android repeatedly asking for
email verification. Rider profile release `8e05193` and its migration are already deployed/applied.
This follow-up needs no migration and changes only Rider behavior plus an optional shared-client
storage extension. Driver, Admin, product permissions and session expiry policies remain unchanged.

iOS now declares camera/photo-library purpose descriptions. Missing camera descriptions can terminate
an app at access time; hosted code cannot supply native permission declarations. Photo preparation
also falls back to a browser image element when bitmap decoding is absent/fails. Both paths resize,
re-encode JPEG, remove source metadata and release temporary image resources. No new camera plugin
or microphone permission is added. Capture cancellation/denial and actual upload require device checks.
See [Apple privacy guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-purpose-strings).

New Android shells register RiderSessionStorage. Supabase's existing isolated Rider client uses this
adapter only when the native Android plugin is available. Browser, older Android and iOS clients
keep established WebView/browser storage. Home and hosted callback use the same adapter and key.
Existing session/PKCE verifier migrate only after a confirmed native save; then plaintext legacy
copies are removed. Failed reads/writes raise errors without silently clearing the vault. Explicit
sign-out removes native and legacy copies. Newer shells require the hosted correction as well.

The plugin stores encrypted ciphertext in Rider-private preferences, using an AES-GCM key in Android
Keystore, fresh IV per write and storage-key associated data. It supports only Rider's session and
PKCE-verifier keys and requires the configured HTTPS Rider origin. It never logs credentials or
returns them to another product. Ciphertext is excluded from cloud backup/device transfer because
Keystore keys are device-local. Uninstalling/clearing app data requires sign-in again. No biometric
prompt is added. An invalidated vault reports a recovery error; explicit sign-out/new sign-in can
clear it rather than automatically resetting saved authentication.
See [Android Keystore key specification](https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec)
and [Supabase custom session storage](https://supabase.com/docs/guides/auth/sessions).

Android starts/stops token refresh on foreground/background transitions, restores the current
session on return and closes the external browser after a successful native authentication callback.
Initial asynchronous portal loading cannot overwrite a newer Auth session event. Transient recovery
errors do not deliberately sign out. Supabase still enforces expiration, revocation and refresh-token
validity; this does not guarantee indefinite login or share Chrome sessions with the native app.
There is no app-domain, hosted redirect configuration, tenant boundary or iOS callback change.

The exact device-specific Android failure was not established from logs. This correction addresses
WebView-only persistence and foreground recovery; actual release acceptance must confirm whether
the original repeated-verification behavior is resolved. If email opens only Chrome, inspect Android
supported-link settings and the signed APK's existing assetlinks association rather than changing
Auth domains or transferring someone else's session.

Release: Rider iOS marketing version 1.0.2 (unique Codemagic build number), Android 1.0.2/code 3.
Owner must push/deploy the hosted changes and build/install both Rider shells. Neither signed build
nor device acceptance is performed by Codex. Preserve all signing keys and original bundle IDs.
