# iOS Codemagic and TestFlight Release Reference

This is the repeatable release process for ESH Rider (`com.esh.rider`) and ESH Driver
(`com.esh.driver`). The Apple Developer Team ID is `5BJ7VXSZ3R`.

## 1. Apple Developer setup

For each App ID in Apple Developer → Certificates, Identifiers & Profiles → Identifiers:

- ESH Rider (`com.esh.rider`)
- ESH Driver (`com.esh.driver`)

Enable **Associated Domains** and save. Existing provisioning profiles become invalid after a
capability change, so regenerate an **App Store** profile for each bundle ID using the current
Apple Distribution certificate. Confirm the profile is Active/Valid and lists **Associated
Domains** under Enabled Capabilities.

Upload the regenerated `.mobileprovision` files to Codemagic → Team settings → Code signing
identities → iOS provisioning profiles. Use clear references such as:

```text
esh-rider-app-store-universal-links
esh-driver-app-store-universal-links
```

Do not upload `.log` files. Do not delete the old profile until the replacement profile has been
used successfully by a build.

## 2. Universal Link files and project configuration

Each app must publish an Apple association file at:

```text
https://rider.eshapp.com/.well-known/apple-app-site-association
https://driver.eshapp.com/.well-known/apple-app-site-association
```

The JSON must use the Team ID plus bundle ID, for example:

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["5BJ7VXSZ3R.com.esh.rider"],
        "components": [{ "/": "/auth/callback*" }]
      }
    ]
  }
}
```

The file must be served as `Content-Type: application/json`. Browser download behavior for this
extensionless file is not itself a failure. Verify the header in PowerShell:

```powershell
(Invoke-WebRequest `
  -Uri "https://rider.eshapp.com/.well-known/apple-app-site-association" `
  -Method Head).Headers["Content-Type"]
```

The iOS projects contain Associated Domains entitlements for their respective domains. Native
sign-in requests must use HTTPS callbacks so iOS can claim them through Universal Links:

```text
https://rider.eshapp.com/auth/callback
https://driver.eshapp.com/auth/callback
```

The Supabase Auth redirect allow-list must include both callback URLs (with the appropriate query
wildcard if used).

## 3. Push and deploy web/native changes

Before building, confirm the intended commit is on `main` and the relevant Vercel deployment is
**Ready**. AASA files are served by Vercel; a native IPA cannot fix a stale web deployment.

Use explicit staging commands, for example:

```bash
git add apps/rider/src/app/page.tsx
git add apps/rider/ios/App/App/Info.plist
git add apps/driver/src/app/page.tsx
git add apps/driver/ios/App/App/Info.plist
git commit -m "fix: prepare iOS universal-link release"
git push origin main
```

Only stage files that actually changed. Check `git status --short --branch` before staging.

## 4. Start a Codemagic build

In Codemagic:

1. Open the `esh-platform` project.
2. Select **ESH Rider iOS** or **ESH Driver iOS**.
3. Click **Start new build**.
4. Select branch `main`.
5. Start the build.

The workflow uses automatic signing by bundle ID and `distribution_type: app_store`; no profile
name needs to be added to `codemagic.yaml`.

In the build log, verify:

- **Apply iOS signing profiles** is green.
- The log references the correct bundle ID (`com.esh.rider` or `com.esh.driver`).
- It does not say `No matching profiles found`.
- **Build Rider IPA** or **Build Driver IPA** is green.
- An `App.ipa` artifact is produced.

If signing configuration succeeds but post-processing fails, the IPA may still have uploaded
successfully. Check App Store Connect before rebuilding.

## 5. App Store Connect processing and compliance

After upload, open the app in App Store Connect → TestFlight → iOS Builds. Wait for Apple to finish
processing and record the numeric build number shown there.

Every newly uploaded build may require export-compliance confirmation, even if an earlier build was
already answered. For this app, select:

```text
None of the algorithms mentioned above
```

This is the appropriate answer for the app's use of standard system HTTPS/TLS rather than custom
encryption. Save until the build changes from **Missing Compliance** to **Ready to Submit**.

Codemagic may report a post-processing failure such as:

```text
The build is missing export compliance.
```

Resolve that in App Store Connect; a new IPA is not required.

## 6. TestFlight groups and testers

For each app:

1. Open **TestFlight → Internal Testing**.
2. Use an existing app-specific group or click **Create Group**.
3. Add the tester's Apple ID email (the Apple ID used on the test device).
4. Open the group's **Builds** tab.
5. Add the newest processed build.
6. On the device, open TestFlight and install/update the newest build.

TestFlight beta information (feedback email, description, and review contact details) is required
when submitting external beta review. Internal testing generally does not require external review,
but keeping the information complete prevents Codemagic's automatic submission from failing.

## 7. Universal Link test

Use a newly installed TestFlight build and a newly generated sign-in email. Open the link by tapping
it directly from Apple Mail or Messages; some email clients keep links inside an embedded browser.
If the link opens Safari, verify the build includes the Associated Domains entitlement and that the
email was generated after the HTTPS callback deployment.

## Common mistakes

- Reusing an old email link after changing the redirect URL.
- Testing an older TestFlight build instead of the newest build number.
- Treating a Codemagic post-processing/export-compliance failure as an IPA build failure.
- Creating a new internal group when an existing group already exists.
- Uploading the `.log` file instead of the `.mobileprovision` profile.
- Pasting build-log text into a terminal; logs are informational output, not shell commands.
