# Web Push Notifications V1 production test

1. Generate one VAPID pair with `pnpm --filter @esh-platform/admin exec web-push generate-vapid-keys`.
2. Add `VAPID_SUBJECT=mailto:support@eshapp.com`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY` to
   Admin. Add the same public key as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to Rider and Driver. Never place
   the private key in Rider, Driver, Git, or a browser variable.
3. Dry-run and apply only `20260815000300_web_push_notifications_v1.sql`, then deploy Admin, Rider,
   and Driver.
4. In Rider, enable **Device alerts**, grant browser permission, refresh, and confirm it remains on.
5. In Driver, enable **Browser push notifications** and grant permission.
6. Create a test trip. Confirm the Driver receives a generic new-offer alert with no Rider name or
   address on the lock screen. Click it and confirm Driver authentication still protects details.
7. Accept and arrive. Confirm Rider receives generic accepted/arrived alerts and clicking opens the
   correct tenant Rider portal.
8. Trigger a recurring-autopay failure or another urgent financial sandbox event and confirm its
   generic action-needed alert contains no amount or payment details.
9. Disable Rider alerts in that browser and confirm later events produce email but no push there.
10. Remove browser permission or subscription, deliver another event, and confirm an expired
    endpoint becomes inactive without blocking email delivery.
11. In Admin Notifications, verify email and push delivery remain separate operational records.

Pass requires explicit permission, one profile/tenant-scoped subscription per browser, privacy-safe
payloads, correct deep links, independent email/push results, dead-endpoint cleanup, and no secrets
or trip/financial details exposed on the lock screen.
