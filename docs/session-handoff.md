# Session Handoff

Last updated: 2026-08-29

## Current objective

Complete the first Community member invitation created through the public join-request and
Community Admin approval workflow. The implementation, migrations, and production deployments are
complete. The remaining work is a recipient action followed by a production verification; no code,
migration, or deployment is currently waiting.

## Authoritative checkpoint

- Branch `main` matches `origin/main` at `38325d3` (`docs: consolidate August 29 session handoff`).
  The immediately preceding application commit is `12c09a9` (`fix: link community approval email
  to member sign in`).
- The public/member Community split is deployed:
  - `community.eshapp.com` is the browse-only public surface with join-request and visitor-feedback
    forms.
  - `app.community.eshapp.com` is the authenticated Community member application.
  - `community-admin.eshapp.com` is the separate Community operations surface for join requests,
    feedback, service-listing review, and moderation.
- Community Admin approval routes invitation creation through the trusted Admin backend. The
  invitation-context trigger assigns the `community_member` workspace role after acceptance.
- Community approval email delivery uses the shared notification outbox and links recipients to the
  member sign-in surface.
- Community member password recovery is available from the member sign-in page.
- The service directory and public entry work are committed and deployed. Migrations
  `20260827000100_community_service_listings.sql`,
  `20260827000200_community_public_entry.sql`,
  `20260828000100_community_invitation_context.sql`, and
  `20260828000200_community_member_notifications.sql` are no longer pending work.
- Community Conversations and Safety V1, Platform product entitlements, independent Community and
  Transportation applications, tenant-first product governance, and cross-application sign-out
  stabilization are deployed foundations. Their implementation history remains in Git and their
  durable contracts remain in the architecture and operations documents.

## Exact next action

Invitation `650a20d9-eadf-4340-8747-b15bc6c9d5fd` for `kand8363@gmail.com` is recorded as `pending`,
with repaired Community context:

- `workspace_key = community`
- `workspace_role_key = community_member`

The recipient must open the invitation and complete credentials. Do not manually set the invitation
to accepted. After the recipient finishes:

1. Verify the invitation status is `accepted`.
2. Verify a Community workspace enrollment exists for the person and tenant.
3. Verify the active `community_member` workspace-role assignment exists.
4. Verify the member can sign in at `app.community.eshapp.com` and enter only the authorized
   Community tenant.
5. Confirm that unrelated Transportation, Rider, Driver, or governance identity does not grant
   Community admission.

The older `ishmaelkosh@gmail.com` invitation is already accepted and predates the Community-context
workflow; do not use it as proof of the new acceptance path.

## Repository and deployment state

- No Supabase migration or application deployment is documented as waiting.
- Before any future migration, the owner must run `pnpm exec supabase db push --dry-run` and confirm
  that it lists only the intended migration before applying it.
- The project owner performs Git mutation, production deployment, and database mutation commands.
- Preserve existing uncommitted work. When handing off multiple files for staging, provide one
  explicit `git add <file>` command per line; never suggest broad staging.

## Operational account note

The Resend account is registered under `ishmaelkosh@gamil.com` (email address recorded as provided).
Keep Resend API keys and all other credentials out of this handoff and out of Git.

## Deliberately deferred work

### Native Rider authentication and payment return

Mobile payment testing is paused. The Rider payment backend is functioning, verified Stripe
webhooks finalize ordinary paid bookings, and wallet-covered ordinary trips finalize directly. Do
not create another payment merely to resume investigation.

The remaining defects are native callback/session UX:

- iOS can leave the Stripe browser sheet visible after returning to Rider.
- Android can return from a magic link and refresh into a new unauthenticated WebView session even
  though the server-side booking remains intact.
- The durable follow-up is an explicit native authentication callback contract and a payment-return
  design that reliably dismisses the external browser sheet.

Preserve the successful payment/booking recovery record. Do not refund or recreate it during
callback work. A future controlled test should build Rider once for both iOS and Android after the
callback contract is implemented.

### SMS provider approval

ESH Rider SMS consent is deployed and manually validated. Consent remains separate from phone
storage, number verification, and delivery. No production SMS was sent during consent validation.

Sent compliance remains external work: finish or resubmit the public Fair Fare opt-in evidence,
then obtain the Sent API key, sender/profile, template and OTP behavior, webhook signing secret, and
10DLC approval before implementing delivery. Keep the adapter provider-neutral and Twilio
switchable; never send duplicate traffic through both providers.

Twilio verification remains paused until suspended-account billing ticket `#29018616` is resolved.
Do not retry production SMS verification before reactivation. Sent, Twilio, Meta, and other provider
credentials must not enter documentation or Git.

### Stripe sandbox dispute diagnostic

The out-of-order Stripe dispute diagnostic is deployed, but no post-deployment automatic retry was
observed. This sandbox issue is deferred and does not block ordinary payments or bookings. If work
resumes, inspect a verified automatic retry using sanitized logs only; never log signatures,
payloads, payment credentials, or secrets.

### Native notifications

Rider and Driver native release `1.0.1` was operationally validated. Web Push is deployed, but native
APNs/FCM delivery remains unimplemented. Keep Android and Apple signing credentials outside Git and
independently backed up.

### Admin control-plane cleanup

Do not remove or rename `admin.eshapp.com`. Transportation still uses it as the trusted backend
selected by `TRANSPORTATION_BACKEND_URL`. Follow
`docs/operations/admin-control-plane-safe-cleanup.md`: finish the rollback observation window,
retire only legacy product UI routes, prove a stable replacement backend, repoint every consumer,
and only then consider a domain change.

## Durable architecture boundaries

- Shared identity and infrastructure do not imply shared product admission.
- Product access requires an active tenant relationship, enabled and entitled product workspace,
  explicit enrollment, explicit product role, enabled capability, and the expected
  server-authoritative operational session.
- Rider and Driver business identities do not grant Community access.
- Branding, domains, and public configuration are not authorization.
- Community normal publishing, official publication, moderation, emergency publication, and mass
  broadcast authority remain separate permissions.
- Direct client writes stay denied where controlled RPCs enforce reason, audit, lifecycle, or
  authorization contracts.
- Preserve tenant isolation, RLS, audit evidence, notification idempotency, and exclusive product
  sessions in every follow-up.

## Production-test hygiene

- Use clearly identifiable test data.
- Do not manually accept invitations or rewrite successful payment lifecycle records.
- Cancel unfinished test bookings.
- Return test Drivers to Offline.
- Restore temporary tenant settings and notification preferences.
- Confirm no test booking remains `requested`, `offered`, `accepted`, `arrived`, or `in_progress`.
- Never approve a fare adjustment produced by unrealistic simulated GPS movement.

## Required reading for recovery

Read these before changing the current Community flow:

- `AGENTS.md`
- `docs/roadmap.md`
- `docs/architecture/community-platform.md`
- `docs/architecture/community-platform-migration-plan.md`
- `docs/adr/0002-separate-product-applications-shared-platform.md`
- `docs/operations/admin-control-plane-safe-cleanup.md`

For work in another domain, read the matching architecture document and production manual test under
`docs/architecture/` and `docs/operations/` before implementation. Git history and migration files
remain the source of implementation evidence when older prose is stale.
