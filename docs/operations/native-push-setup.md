# Native push setup and release

Native integration is owner-deployed as b501da0 and owner-confirmed to receive alerts on iPhone
and Android. The once-per-minute retry schedule is deployed as 3e8ff47 with repeated scheduled
GET 200 responses owner-confirmed on Oct 07. Owner moved
transport-platform-admin to ESH Platform Admin and confirmed Pro. Codex has not inspected remote
credentials or sent production notifications. No secrets belong in Git or chat.

## Completed owner setup

Firebase project esh-platform-609d3 has Android registrations com.esh.rider and com.esh.driver and
FCM HTTP v1 enabled. Both Apple App IDs have Push Notifications enabled. A Production Topic Specific
APNs key covers both topics. Private key files remain outside the repository.

Codemagic application environment group esh_native_push contains secret variables:

- RIDER_GOOGLE_SERVICES_JSON_BASE64: Rider Firebase client configuration.
- DRIVER_GOOGLE_SERVICES_JSON_BASE64: Driver Firebase client configuration.

Use plain names without formatting characters. These are client configurations, not Admin SDK
credentials. The Android workflows inject and validate each product's own file. Existing Mapbox
and signing groups remain intact. PowerShell clipboard encoding may run from any folder:

```powershell
Set-Clipboard -Value ([Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\ESH Rider Firebas\google-services.json')))
Set-Clipboard -Value ([Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\ESH Driver Firebase\google-services.json')))
```

Run one command, paste into that product's saved variable, then run the next. The Rider folder's
Firebas spelling is intentional. Clear the clipboard with Set-Clipboard -Value ' '; the owner's
PowerShell rejects an empty string.

Only transport-platform-admin (admin.eshapp.com) receives sensitive Production server variables:

- FIREBASE_SERVICE_ACCOUNT_JSON: raw service-account JSON, not base64.
- APNS_PRIVATE_KEY: raw .p8 PEM, not an App Store Connect API key.
- APNS_KEY_ID: the key identifier.
- APNS_TEAM_ID: Apple developer team identifier.

Never copy these into Rider, Driver, Community, Transportation or NEXT_PUBLIC variables.
Existing CRON_SECRET protects the native worker endpoint; confirm it without printing its value.

## Owner release sequence

1. Review local changes and perform full disposable Supabase checks where available. The embedded
   minimal-schema PostgreSQL check is supplementary, not proof of the entire Supabase schema.
2. Owner runs the migration preview in the authenticated shell:

```bash
corepack pnpm exec supabase db push --dry-run
```

It must list only 20261006000100_native_push_notifications.sql. Inspect the output before providing
or executing the real push. Checkpoint: owner completed this dry run in WSL and successfully applied
the migration; do not reapply it. Previous saved-place migrations are also owner-applied.
Do not assume WSL and PowerShell share Supabase authentication.

3. Owner commits/pushes the reviewed feature. Confirm Admin, Rider and Driver deployments at the
   intended commit. Preserve preexisting generated configuration edits when staging.
4. Confirm a timely retry scheduler. The new endpoint is
   https://admin.eshapp.com/api/cron/native-notifications and requires
   Authorization: Bearer CRON_SECRET. Invocation returns aggregate counts only. Existing business
   delivery invokes native sending, but recovery/retries need independent scheduling.
   Vercel Pro supports once per minute; Hobby permits daily cron only and rejects a minute schedule.
   Owner now confirms the transferred Admin team is Pro. apps/admin/vercel.json locally adds
   this endpoint once per minute and preserves the existing daily email job.
   After owner push/deployment, open Admin Settings -> Cron Jobs; confirm both jobs are enabled.
   Inspect the native job logs for HTTP 200. HTTP 401 means the Production CRON_SECRET is missing
   or mismatched; verify its presence without sharing its value. HTTP 503 requires sanitized
   backend/configuration diagnosis. Never invoke Run just to inspect configuration: it can send
   eligible queued alerts. Normal scheduled success is sufficient to verify the job.
   Daily retries are unsuitable for expiring trip offers. Never expose the secret in a public URL.
5. Rebuild Rider Android/iOS 1.0.3 and Driver Android/iOS 1.0.5 in Codemagic. Regenerate iOS
   provisioning profiles after adding push capability; retain bundle IDs, existing signing and
   authentication domains. Inspect the exported app's signed entitlement for
   aps-environment=production. This sender does not target the APNs sandbox.
6. After schema, server deployments, scheduling and signed shells are ready, set the nonsecret
   NEXT_PUBLIC_NATIVE_PUSH_ENABLED=true in each Rider/Driver Vercel project and redeploy.
   Examples default false. Older shells remain unavailable/update-gated even with the flag enabled.
7. Complete native-push-notifications-manual-test.md on actual iPhone and Android for both products.
   Record device receipt, consent/account isolation and retry results before calling this operational.

To pause rollout, disable the public flag and redeploy; this hides controls but does not revoke
existing server registrations. Pausing the sender requires disabling its scheduler/event delivery
or removing its server credentials through the owner-controlled configuration. Do not confuse UI
rollback with a delivery stop. Messages already accepted by providers cannot be recalled.

References: [Capacitor push setup](https://capacitorjs.com/docs/apis/push-notifications),
[Firebase HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api),
[Apple token-based APNs](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns),
and [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
