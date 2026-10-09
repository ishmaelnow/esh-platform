# Independent email and device alerts

Status: implemented locally; migration owner-applied after an intended-only dry run on 2026-10-09.
Owner pushed application changes as 01a6546 and confirmed Admin/Rider/Driver Ready and successful
email-off/mobile-on workflow acceptance. Transportation deployment confirmation remains separate.

Rider trip/payment emails and Driver offer/earnings/expiration emails are independent of device
alerts. Existing email selections are copied into explicit email columns. Essential account and
evidence-review messages retain their existing behavior. Mobile consent remains per installation,
with the existing OS permission, tenant, product, profile and active-session checks.

Existing event producers use legacy preference columns as derived internal gates: email enabled
OR an active native/Web Push registration for that tenant/profile. Private triggers recompute gates
when preferences or device bindings change. Business producers and deduplication keys are preserved;
no old events are replayed. Email opt-out no longer cancels the shared event or native attempt.

Each outbox row has an email_delivery_enabled mask. Inserts and claim updates check current email
preferences; opt-out also masks pending emails. Once masked, a row is not re-enabled retrospectively.
Admin checks the claim result before sending. Email-disabled events are recorded as email_disabled,
not sent or failed. Native attempts retain independent claim/retry/expiry handling. Web Push and SMS
continue through their existing consent and delivery contracts. An already in-flight provider
request cannot be recalled. Email status is not proof of device receipt.

Owned RPCs retain Rider tenant selection and Driver identity checks, deny direct preference writes,
and audit changes. New Driver offer email RPCs are authenticated-only; trigger helpers are private.
No authentication, signing, domain, payment, dispatch, location or session-duration change is made.

Migration: 20261008000200_notification_channel_preferences.sql. Apply it before deploying Admin,
Rider and Driver hosted changes, plus the Transportation UI that shares the Admin component.
Existing push-capable native shells suffice; no new credential,
environment variable or native build is required. See the matching manual-test document.

The disposable PGlite check uses a minimal legacy schema and the actual booking notification producer.
It verifies preserved opt-outs, mobile-only event generation, deduplication, independent native claims,
web eligibility, audit and denied access. It does not certify the complete Supabase migration chain,
concurrent production workloads or physical device delivery.
