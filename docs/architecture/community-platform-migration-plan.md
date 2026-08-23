# Community Platform Migration Plan

## Purpose

This plan converts the approved Community architecture into reviewable database increments. It is
not SQL and does not apply migrations or enable Community for any tenant.

Each implementation migration must include constraints, indexes, RLS, grants, controlled mutation
functions, audit behavior, generated/manual Supabase types, tests, and rollback/operational notes
appropriate to that increment. Migrations are applied in the order below and Community remains
disabled until the production release gate passes.

## Migration 1: Product Capability And Authorization Foundation

Planned changes:

- introduce a capability catalog if feasible, avoiding another indefinitely growing capability
  check constraint;
- add `app.community`, `community.content`, `community.groups`, `community.services`,
  `community.moderation`, and `community.broadcasts`;
- add Community permission definitions and controlled role bundles;
- add `tenant_community_settings` for feature switches and moderation defaults; and
- add reusable `can_read_community`, `can_create_community_content`,
  `can_moderate_community`, and broadcast authorization helpers.

Defaults:

- all Community capabilities disabled for existing tenants;
- no ordinary tenant member receives moderation or broadcast authority;
- tenant owner/admin receives only the explicitly approved Community administration bundle when
  Community is enabled; and
- emergency publication and broadcast remain separately disabled.

Required tests:

- disabled capability denies all Community mutations;
- active Tenant A membership grants no Tenant B access;
- suspended person, membership, or tenant denies access;
- moderator and emergency permissions remain distinct; and
- client-provided person, tenant, or role claims cannot bypass derived authorization.

## Migration 2: Community Areas, Groups, Organizations, And Trust

Planned tables:

- `community_areas`
- `community_groups`
- `community_group_memberships`
- `community_organizations`
- `community_organization_memberships`
- `community_organization_verifications`
- `community_provider_profiles`
- `community_provider_verifications`

Required constraints:

- all records carry `tenant_id`;
- composite tenant-aware foreign keys prevent cross-tenant relationships;
- area parent belongs to the same tenant and cannot be self-referential;
- active group/organization memberships are unique;
- verification status, reviewer, reason, and dates agree; and
- identity/tenant/subject fields cannot be rewritten after creation.

Required indexes:

- tenant plus active/status/name;
- area hierarchy;
- group member and organization representative lookup;
- active verification by subject; and
- unique active verification where the product contract permits one.

RLS expectations:

- public may read only public active organization/group display records;
- members read tenant-visible areas and groups;
- representatives manage only their organization-owned drafts/profile fields;
- verification transitions require authorized moderators/admins; and
- private memberships and verification evidence are not exposed publicly.

## Migration 3: Core Content, Typed Records, Targets, And Actions

Planned tables:

- `community_content_kinds`
- `community_content_items`
- `community_posts`
- `community_announcements`
- `community_events`
- `community_alerts`
- `community_help_requests`
- `community_opportunities`
- `community_resources`
- reserved poll definition tables only when poll voting enters scope;
- `community_content_targets`
- `community_content_actions`

Required constraints:

- typed records use `(tenant_id, content_id)` foreign keys;
- one typed record matches the envelope's content kind;
- event end follows start, capacity is positive, and external URLs use allowed schemes;
- expiration follows publication/effective time;
- target row contains exactly one valid target;
- official publisher, pin, removal, and status attribution are internally consistent;
- published author/tenant/content kind are immutable; and
- action fields match their action kind and reject executable URLs.

Mutation strategy:

- members create and edit drafts through controlled RPCs or tightly bounded RLS;
- publication and privileged lifecycle transitions use security-definer RPCs;
- functions derive the actor and tenant membership from `auth.uid()`;
- official and emergency fields are never accepted from an ordinary member payload; and
- every privileged transition writes `tenant_audit_events` in the same transaction.

Required indexes:

- `(tenant_id, publication_status, moderation_status, published_at desc)`;
- `(tenant_id, content_kind, published_at desc)`;
- expiration and event-time indexes;
- target area/group/organization/person indexes; and
- generated PostgreSQL search vectors with GIN indexes.

## Migration 4: Comments, Reactions, Media, Blocks, And Reports

Planned tables/storage:

- `community_comments`
- `community_content_reactions`
- `community_comment_reactions`
- `community_media_assets`
- `community_content_media`
- private `community-media` storage bucket and object policies;
- `community_user_blocks`
- `community_user_mutes`
- `community_reports`

Required constraints:

- comments and reactions remain tenant-consistent with their content;
- one reaction of a given kind per actor/target;
- bounded comment nesting;
- reports cannot target arbitrary or cross-tenant IDs;
- active block/mute relationships are unique;
- media paths begin with the tenant and owner identity expected by policy;
- MIME type, size, attachment count, and ordering are bounded; and
- removal and report resolution require attribution and reason.

RLS expectations:

- users manage only their own comments/reactions/blocks/mutes;
- content authors cannot moderate reports against themselves;
- blocked/muted relationships are private to their owner and trusted moderation paths;
- signed media viewing rechecks content visibility; and
- removed or restricted media receives no new public signed URL.

Abuse controls:

- server-enforced post/comment/report/upload rate limits;
- normalized URL and text length limits;
- no HTML or JavaScript execution; and
- moderation-preserving soft removal.

## Migration 5: Service Directory

Planned tables:

- `community_service_categories`
- `community_service_listings`
- `community_service_listing_categories`
- `community_service_listing_areas`
- `community_service_contacts`
- `community_service_media`

Required constraints:

- listing provider belongs to the same tenant;
- active listing requires an active provider and at least one category;
- structured contact values match their channel;
- service area references a Community area, not a transportation service area;
- price/rate is display text only in V1 and cannot imply a payment contract;
- verification display is derived from provider verification; and
- inactive, suspended, removed, and expired states preserve history.

Required indexes:

- tenant/category/status;
- tenant/area/status;
- provider/status;
- normalized title/provider name; and
- service search vector.

Promotional feed content references a listing and records its promotion origin/time so a later
policy can enforce frequency limits and sponsored placement without changing listing identity.

## Migration 6: Moderation And Announcement Submission

Planned tables:

- `community_announcement_submissions`
- `community_moderation_cases`
- `community_moderation_actions`
- optional `community_submission_revisions` when request-changes editing is implemented

Required lifecycle:

```text
draft submission
-> pending
-> changes_requested | rejected | approved
-> approved creates a separate official announcement linked to the reviewed source/revision
```

Required protections:

- only source author/authorized organization may submit;
- reviewer cannot fabricate or replace source authorship;
- approval and official announcement creation are atomic;
- decisions require reason and reviewer attribution;
- action history is append-only;
- restore is a new moderation action; and
- every decision and privileged content transition writes a tenant audit event.

Required tests include concurrent review, duplicate approval, stale revision approval, cross-tenant
review attempts, self-elevation attempts, and replay/idempotency.

## Migration 7: In-App Notifications And Delivery Generalization

Planned changes:

- add person-based notification subscriptions without requiring Rider or Driver profiles;
- add `community_notification_preferences` keyed by tenant, person, category, and channel;
- add `notification_inbox_items` and recipient/read state;
- extend notification type catalogs and outbox payload contracts compatibly;
- add publication/broadcast authorization RPCs with deduplication keys; and
- add independently retryable delivery attempts using the existing workers.

The implementation must not duplicate the email, push, or SMS sender. If the current
`notification_outbox` shape cannot represent Community recipients cleanly, introduce a generic
notification event/recipient layer and adapt existing delivery paths incrementally rather than
breaking Rider/Driver delivery.

V1 channels:

- normal: feed and in-app;
- important: in-app, with browser push only after production verification;
- urgent/emergency: classification and authorization foundation, but no Community SMS/email/native
  push promise in V1.

Required tests:

- member cannot broadcast;
- publisher without broadcast permission can publish but cannot enqueue mass delivery;
- audience expansion never crosses tenant boundaries;
- preferences suppress optional channels but not the in-app record required by policy;
- dedupe replay creates no duplicate recipient/delivery rows;
- recipient counts and audit metadata agree; and
- ordinary clients cannot insert or mutate delivery state directly.

## Migration 8: Lifecycle Automation And Search Read Models

Planned changes:

- bounded, idempotent expiration/past-event processing;
- alert resolution and opportunity/help lifecycle helpers;
- public and authenticated feed functions/views returning display-safe author data;
- PostgreSQL full-text discovery functions; and
- aggregate counts that do not expose blocked/private actors.

Automation may use the existing `pg_cron` convention. Jobs must be safe to replay, process bounded
batches, avoid duplicate audit/notification records, and never destructively delete history.

## RLS Verification Matrix

Minimum actors:

1. anonymous visitor;
2. authenticated person without membership;
3. Tenant A member;
4. Tenant A organization representative;
5. Tenant A verified provider representative;
6. Tenant A moderator;
7. Tenant A Community administrator;
8. Tenant A emergency publisher;
9. Tenant A suspended member;
10. Tenant B administrator/member;
11. platform administrator;
12. service role for explicitly trusted worker tests.

Every tenant-owned table must prove:

- anonymous access is limited to public read models;
- Tenant A cannot read or mutate Tenant B records;
- inactive person/membership/tenant cannot mutate;
- owner-only mutations cannot target another actor's record;
- capability-disabled tenants cannot use the module;
- moderators cannot broadcast without separate permission;
- organization representatives cannot act for unrelated organizations;
- public reads expose no private profile, membership, report, block, verification evidence, or
  delivery data; and
- service-role use is server-only and privileged actions are audited.

## API And Server Requirements

Application code should expose narrow operations rather than arbitrary table writes:

- resolve public/registered tenant Community context;
- create/update/submit own content;
- comment/react/report/block/mute;
- upload/finalize/view media;
- manage own organization/provider/listing records;
- query feed/discovery/services;
- review moderation/announcement submissions;
- publish/pin/expire/resolve official content;
- preview and authorize a broadcast; and
- read/update notification inbox/preferences.

Service-role routes require authenticated server authorization before service client creation.
Inputs receive schema validation, bounded lengths/counts, safe URL handling, and stable error
mapping. No endpoint accepts a caller-selected role or trusted actor ID.

## Application And Test Sequence

For each migration increment:

1. implement database constraints, RLS, grants, and RPCs;
2. update generated/manual Supabase types;
3. add database authorization and lifecycle tests;
4. add the smallest corresponding Community/Admin UI vertical slice;
5. add unit, API, and browser tests;
6. update architecture, environment, operations, roadmap, and handoff;
7. run tests, lint, type checks, and production builds proportional to risk; and
8. owner dry-runs the one intended migration before production apply.

Cross-cutting E2E scenarios must include public read, member creation, cross-tenant denial,
moderation, announcement promotion, expiration, service discovery, notification preference, and
broadcast denial/authorization.

## Production Release Gates

- Community capabilities remain disabled during schema rollout.
- A dedicated pilot tenant and test accounts exist for every role in the RLS matrix.
- Dry run lists only the intended migration at each step.
- Cross-tenant negative tests pass before capability enablement.
- Ordinary members cannot set privileged publication or broadcast state.
- Public responses contain only approved display-safe fields.
- Private media cannot be fetched after authorization/removal changes.
- Moderation and announcement decisions are attributable and auditable.
- Notification fan-out is bounded, previewed, deduplicated, and initially limited to verified
  channels.
- Lifecycle automation is idempotent and preserves history.
- Temporary content, memberships, notification preferences, and unfinished moderation cases are
  restored or closed after production tests.

## Deferred Migration Work

- poll options, voting, and result-visibility contracts;
- polygon boundaries and verified residency;
- selected-user targeting UI;
- native push and Community mass SMS/email;
- provider reviews and ratings;
- service booking, leads, payment, promotion billing, and subscriptions;
- external search engines and recommendation systems; and
- AI moderation.
