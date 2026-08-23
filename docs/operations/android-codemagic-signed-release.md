# Android Codemagic signed release

This procedure builds signed Google Play app bundles for ESH Rider (`com.esh.rider`) and ESH
Driver (`com.esh.driver`) without placing the upload key or its passwords in Git.

## One-time signing setup

1. Use the existing Google Play upload keystore for these applications. Do not generate a new key
   for an application that has already been released unless Google Play has completed an upload-key
   reset.
2. In Codemagic, open **Team settings → Code signing identities → Android keystores**.
3. Upload the private keystore and enter its keystore password, key alias, and key password.
4. Set the reference name to exactly `esh_android_upload` and save it. Keep an independent encrypted
   backup; Codemagic does not provide keystore downloads.
5. Never add the keystore, passwords, `key.properties`, or populated signing variables to Git.

## One-time Driver Mapbox setup

Driver's embedded native navigation downloads private Mapbox Navigation SDK artifacts and also
needs a public token at runtime. In Codemagic, create a protected variable group named exactly
`mapbox_credentials` containing:

- `MAPBOX_DOWNLOADS_TOKEN`: a secret Mapbox token with the `Downloads:Read` scope. Mark it Secret.
- `MAPBOX_ACCESS_TOKEN`: a public `pk.` token suitable for the Android native SDK. It must not use
  web-only URL restrictions. Marking it Secret in Codemagic is still preferred to reduce log output.

Only the Driver Android workflow imports this group. Never use the secret `sk.` downloads token as
the runtime access token, expose either value in build logs, or commit either value.

## Build the signed bundles

1. Confirm the intended native release commit is on `main` and its hosted Rider/Driver deployments
   are Ready.
2. In Codemagic, open the `esh-platform` application and start **ESH Rider Android** from `main`.
3. Confirm **Build signed Rider APK and app bundle** passes. Download `app-release.apk` for direct
   device installation and `app-release.aab` for a future Google Play release.
4. Repeat with **ESH Driver Android** and download its separate APK and AAB artifacts.
5. Keep the files clearly separated by application. Verify Rider is `com.esh.rider`, Driver is
   `com.esh.driver`, and both report version `1.0.1` / version code `2` before upload.

The workflows produce signed artifacts but deliberately do not upload them to Google Play. Upload
each bundle to its matching internal-testing release in Play Console, review the release summary,
then explicitly roll it out. This preserves an owner-controlled production boundary.

The workflows invoke each Gradle wrapper with `bash ./gradlew`. Git records the wrappers as regular
files on the Windows-mounted repository, so direct `./gradlew` execution can fail in Codemagic with
exit code 126 even when WSL displays a local executable permission.

Both Android workflows pin Java 21. Capacitor Android compiles with Java source release 21, while
Codemagic's default JDK may be older and fail during `compileReleaseJavaWithJavac` with `invalid
source release: 21`.

If Driver dependency resolution returns HTTP 401 from
`https://api.mapbox.com/downloads/v2/releases/maven`, confirm the `mapbox_credentials` group is
available to the application and `MAPBOX_DOWNLOADS_TOKEN` is the current `sk.` token with
`Downloads:Read`.

## Device verification

Install the internal-test update from Google Play. Confirm the launcher uses the blue ESH road icon,
the app opens its correct hosted portal, sign-in returns to the installed app, and no generic
Capacitor/Android icon remains. If a launcher caches the former icon after the update, restart the
launcher/device; uninstalling is a last resort because it clears the local app session.
