# Community Platform Architecture

## Purpose

The Community product is the second business domain built on ESH Platform. It provides useful
local discussion, official community information, events, resources, help requests, and a local
service directory without turning the platform into an engagement-maximizing social network.

Community is a tenant-enabled product module. A tenant may enable Transportation, Community, or
both. Community records remain isolated by tenant even when the same person belongs to several
tenants.

This document is an architecture contract. It does not create SQL, application routes, storage
buckets, delivery jobs, or production configuration.

The first member-facing slice is implemented in `apps/community` with Migration
`20260823000600_community_core_content.sql`. It provides explicit Community-session entry, a
chronological feed, and controlled ordinary member posts. Announcements, events, alerts, help,
opportunities, resources, targeting, and structured actions have normalized schema foundations but
do not yet expose broad authoring UI. Community remains tenant-disabled until a deliberate pilot.

## Existing Platform Primitives

Community reuses:

- `person_profiles` for neutral authenticated identity;
- `tenants`, `tenant_configurations`, and tenant slugs for workspace identity and routing;
- `tenant_memberships` for membership lifecycle;
- tenant roles, capabilities, and active tenant context for authorization;
- append-only `tenant_audit_events` for privileged and moderation actions;
- the durable notification outbox, delivery attempts, and preference patterns;
- Supabase Auth and the shared browser/server client factories;
- private Supabase Storage and signed-view patterns established by evidence uploads; and
- the shared Mapbox package for optional map display and coordinate handling.

Community must not reuse transportation business identities such as Rider or Driver profiles.
Community areas must not be stored in transportation `service_areas`, whose operational meaning
and lifecycle are specific to dispatch.

## Product Boundaries

The module has three surfaces:

1. **Community**: posts, comments, reactions, media, groups, and neighborhood discussion.
2. **Community Information**: announcements, events, alerts, help requests, opportunities, and
   resources.
3. **Local Services**: provider profiles and searchable service listings, with optional promotional
   feed posts linked to a listing.

Services are a directory, not merely a post type. Payments, appointment booking, ratings, sponsored
placement, lead sales, and subscriptions are deferred. Stable provider and listing identifiers must
leave those additions possible.

## Application Boundary And Navigation

The member experience belongs in a new deployable `apps/community` application. It uses the shared
Supabase identity and tenant-slug conventions and may later be hosted at `community.eshapp.com`.
It must not be embedded in Rider or Driver.

Recommended member navigation:

- **Home**: relevant chronological feed;
- **Discover**: announcements, events, help, opportunities, and resources;
- **Services**: dedicated service directory;
- **Groups**: groups and neighborhood discussion;
- **Create**: contextual creation action; and
- notifications and profile in the account/header surface.

Recommended routes:

- `/`
- `/announcements`
- `/events`
- `/services` and `/services/[listingId]`
- `/resources`
- `/groups` and `/groups/[groupId]`
- `/content/[contentId]`
- `/organizations/[organizationId]`
- `/notifications`
- `/settings/notifications`

Community administration belongs in a separately deployed Community Admin application, not a
module inside Tenant or Transportation Admin. Its routes cover overview, moderation,
announcements/alerts, events, organizations, services, reports, and settings. The shared control
plane manages tenant/product enrollment but performs no Community operations. This follows ADR
0002 and prevents simultaneous Transportation/Community operation.

## Authorization Model

### Product-specific admission

Community uses shared ESH identity infrastructure internally, but it is an independent product
entrance. Successful credential verification alone never establishes a Community application
session. The Community app must immediately verify an enabled Community workspace, active
Community enrollment, and active Community role. If no eligible Community access exists, it clears
its isolated local auth session and returns a neutral product-specific denial. It must not expose
Community navigation, tenant choices, content, or the person's access to any other ESH product.

Rider, Driver, Transportation, Tenant Governance, and Community admission remain independent even
when the same person record underlies more than one deliberately enrolled product relationship.

Foundation tenant roles remain `tenant_owner`, `tenant_admin`, and `tenant_member`. Community uses
domain permissions and profiles rather than introducing a parallel authentication system.

Planned tenant capabilities:

- `app.community`
- `community.content`
- `community.groups`
- `community.services`
- `community.moderation`
- `community.broadcasts`

Planned permission keys include:

- `community.content.create`
- `community.content.comment`
- `community.content.react`
- `community.events.submit`
- `community.services.manage_own`
- `community.submissions.create`
- `community.content.moderate`
- `community.submissions.review`
- `community.events.approve`
- `community.services.moderate`
- `community.content.pin`
- `community.verifications.manage`
- `community.announcements.publish`
- `community.alerts.urgent`
- `community.broadcasts.urgent`
- `community.alerts.emergency`
- `community.broadcasts.important`
- `community.broadcasts.emergency`

Permissions may be represented initially by controlled role bundles, but database authorization
helpers must check active person, active tenant, active membership, required capability, and the
specific permission. Client UI visibility is never the enforcement boundary.

### Actor boundaries

- **Anonymous visitor**: may read only currently published, public, non-removed content whose
  tenant is active and whose audience permits public viewing. Has no mutation grants.
- **Community member**: may manage their own ordinary content, comments, reactions, help requests,
  event submissions, reports, and eligible service listings. Cannot self-declare official,
  pinned, urgent, emergency, verified, or broadcast state.
- **Organization/provider representative**: acts through an active organization relationship and
  may manage that organization's profile, events, resources, and listings. Verification is a
  separate current trust record, not a role or cosmetic badge.
- **Moderator**: may review submissions, moderate content/comments/listings, and resolve reports
  within assigned permissions. Moderation does not imply emergency broadcast authority.
- **Community administrator**: may publish official information and manage verification when the
  corresponding capabilities and permissions are active.
- **Emergency publisher**: requires separately assigned emergency publication and broadcast
  authority. Ordinary tenant administration does not implicitly grant it.

## Content Model

Use a shared content envelope for cross-cutting feed behavior and one-to-one typed records for
domain-specific invariants. Do not place all fields in one generic post table, and do not duplicate
targeting, media, moderation, and lifecycle fields across unrelated tables.

### Shared envelope: `community_content_items`

Required concepts:

- `content_id`, `tenant_id`, and `content_kind`;
- author person and optional publishing organization;
- optional title and required body;
- publication, moderation, visibility, and priority state;
- publish and expiration time;
- pin attribution and time;
- soft-removal attribution, time, and reason;
- source submission where official content was promoted from member content; and
- created/updated timestamps.

Content kinds are catalog-backed or constrained text keys, not a PostgreSQL enum that makes later
extension operationally difficult:

- `post`
- `announcement`
- `event`
- `alert`
- `help_request`
- `opportunity`
- `poll`
- `resource`
- `service_promotion`

Publication status is separate from moderation status. A useful starting lifecycle is
`draft -> submitted -> published -> expired/archived`, with `rejected` available to review flows.
Moderation state independently supports `clear`, `under_review`, `restricted`, and `removed`.

### Typed records

One-to-one tables provide the fields and checks unique to each domain:

- `community_posts`
- `community_announcements`
- `community_events`
- `community_alerts`
- `community_help_requests`
- `community_opportunities`
- `community_polls`
- `community_resources`

Examples:

- Events require an organizer, start/end ordering, attendance policy, location, optional capacity,
  and optional external registration URL.
- Help requests use `open`, `in_progress`, `resolved`, or `cancelled` state.
- Alerts use effective/expiration time plus `active` or `resolved` operational state.
- Opportunities carry a deadline and become `closed` without deleting history.
- Polls require options, vote eligibility, uniqueness, visibility, and closure tables; their content
  key may be reserved in V1 while voting is deferred.

Every typed row uses `(tenant_id, content_id)` foreign keys so a child cannot reference content in
another tenant.

## Areas, Groups, Organizations, And Targeting

### Community areas

`community_areas` represents city, neighborhood, district, or another named community geography.
V1 supports a hierarchy, optional center coordinates, and optional circular radius. Polygon
boundaries and verified residency are deferred. Areas are not transportation service areas.

### Groups

`community_groups` and `community_group_memberships` represent public, approval-required, and
private tenant groups. Group membership and content visibility must remain tenant-consistent.

### Organizations and providers

Planned records:

- `community_organizations`
- `community_organization_memberships`
- `community_organization_verifications`
- `community_provider_profiles`
- `community_provider_verifications`

Verification includes status, evidence/reference, reviewer, reason, effective date, expiration,
and suspension. UI trust marks are derived from a current verification, never directly editable.

### Targeting

`community_content_targets` makes audience selection first class. Each row targets exactly one of:

- the tenant/community;
- a community area;
- a group;
- an organization; or
- a selected person.

Nullable target columns must have real foreign keys plus an exactly-one-target check. `tenant_id`
must participate in composite foreign keys. V1 product UI supports tenant, area, and group targets;
organization and selected-person targeting remain schema-compatible but may be deferred.

Visibility and targeting are separate: visibility determines who may read; targeting determines
for whom otherwise-readable content is relevant.

## Services Directory

Planned records:

- `community_service_categories`
- `community_service_listings`
- `community_service_listing_categories`
- `community_service_listing_areas`
- `community_service_contacts`
- `community_service_media`

A listing belongs to a verified or unverified provider profile, carries explicit verification and
moderation presentation, and supports active/inactive lifecycle without destructive deletion.
Contact methods are structured and individually validated.

A promotional feed item references a listing. The content model records promotion timestamps and
origin so tenant policy can later enforce posting frequency, featured placement, and sponsorship
without rewriting the service directory.

## Interactions, Media, And Safety

Planned interaction records:

- `community_comments`, with optional parent comment and bounded nesting;
- `community_content_reactions` and `community_comment_reactions`, using explicit foreign keys;
- `community_reports`;
- `community_user_blocks`; and
- `community_user_mutes`.

V1 reactions use a small controlled catalog such as `like`, `support`, and `helpful`. Reaction
counts are derived or safely aggregated; they do not control engagement-maximizing ranking.

Community media uses a private storage bucket and tenant-prefixed paths. Metadata records include
owner, MIME type, byte size, dimensions where known, alt text, moderation state, and attachment
ordering. Upload and signed-view operations are server-mediated or narrowly authorized. Removed
content must not remain publicly viewable through permanent object URLs.

V1 requires post/comment/report throttling, upload size and count limits, URL sanitization,
suspended-member write denial, and preserved soft-removal evidence.

## Structured Actions

`community_content_actions` provides validated actions instead of executable or body-embedded
links. Supported keys may include `rsvp`, `directions`, `add_to_calendar`, `register`, `apply`,
`volunteer`, `call`, `email`, `visit_website`, `request_service`, `message_provider`, `download`,
`report_issue`, and `learn_more`.

Each action contains only the fields appropriate to its kind, an accessible label, and sort order.
JavaScript URLs and arbitrary executable markup are forbidden.

## Moderation And Announcement Promotion

Moderation records are explicit and auditable:

- `community_announcement_submissions`
- `community_moderation_cases`
- `community_moderation_actions`
- optional submission revisions or reviewer messages

The announcement workflow is:

```text
Member content
-> submission with an escalation reason
-> pending moderation case
-> approve, reject, or request changes
-> approval creates a separate official announcement linked to the source
-> an authorized notification policy may be selected
-> publication, review decision, and broadcast authorization are audited
```

The source post is not silently converted into official speech. This preserves member authorship,
the reviewed revision, official publisher identity, and decision history.

Moderation actions require a reason and append to history. Restoring content is a new action, not
deletion of the removal record. Account suspension remains an identity/membership lifecycle action
and must not be approximated by hiding a user's posts.

## Notification Contract

Publishing and broadcasting are separate operations. Ordinary users never insert directly into a
delivery outbox or select mass-delivery channels.

Severity keys:

- `normal`: feed and in-app inbox;
- `important`: feed, inbox, and eligible push;
- `urgent`: feed, inbox, push, and explicitly allowed email/SMS;
- `emergency`: separately authorized administrators and approved channels only.

An authorized publication RPC must:

1. derive the actor from Supabase Auth;
2. validate tenant, membership, capability, and publication/broadcast permission;
3. lock and validate the content lifecycle and audience;
4. calculate eligible recipients inside the database or a trusted worker;
5. apply category/channel preferences and mandatory-message policy;
6. create deduplicated inbox/outbox recipient records; and
7. append an audit event with audience, policy, and recipient counts.

Community needs a person-based in-app notification inbox and category/channel preferences. Existing
Rider/Driver-specific subscription columns must be generalized compatibly; the existing delivery
worker and delivery-attempt history remain the delivery mechanism. V1 delivers in-app first and
uses browser push only after the generalized contract is verified. Native push, SMS, and email
broadcast are deferred from the Community MVP.

## Discovery And Feed Ordering

V1 feed ordering is deterministic and useful:

1. active emergency/urgent and pinned information;
2. audience and area relevance;
3. publish time descending.

Reaction/comment totals do not dominate ranking. PostgreSQL full-text search, ordinary indexes,
and optional `pg_trgm` support title/body/provider/category discovery. A heavyweight search engine
is deferred.

Required indexes include tenant plus publication/moderation status, tenant plus kind/publish time,
expiration, group/area targets, event time, help status, service category/area/status, moderation
queue status, and searchable text vectors.

## Lifecycle And Retention

- An event becomes past after its end time but remains historically readable according to policy.
- An announcement expires at `expires_at` and loses prominence without deletion.
- An alert may be resolved early or expire.
- A help request becomes resolved or cancelled.
- An opportunity closes at its deadline.
- A service listing becomes inactive or suspended.
- Removed content retains audit and moderation evidence.

Scheduled lifecycle processing must be idempotent and tenant-aware. Existing `pg_cron` conventions
may invoke a bounded security-definer function. Each automatic transition records audit only when
the transition is operationally significant; jobs must not generate duplicate events on replay.

## RLS And Mutation Rules

Every tenant-owned table carries `tenant_id`. Direct client mutations are limited to safe own-record
operations; privileged transitions use narrowly granted security-definer RPCs.

Required invariants:

- no cross-tenant foreign-key relationships;
- tenant identity cannot change after creation;
- author/publisher identity cannot be rewritten after publication;
- ordinary members cannot assign official, pinned, urgent, emergency, verified, approved, or
  broadcast state;
- comments and reactions are accepted only on currently interactable content;
- blocks/mutes are visible only to their owner and trusted moderation paths;
- anonymous reads return only public, published, non-removed content for active tenants;
- service-role operations remain server-only and audit privileged actions; and
- audit/moderation history is append-only.

Public feed reads should use a stable database function or view that returns display-safe author and
organization fields instead of opening broad access to `person_profiles`.

## V1 Scope

V1 includes:

- Community application shell and tenant resolution;
- registered-member posts and private media;
- comments and simple reactions;
- announcements, events, alerts, help requests, opportunities, and resources;
- service providers and service listings;
- tenant, area, and group targeting;
- report and moderator review flows;
- submit-for-announcement promotion;
- expiration and resolved/past lifecycle;
- in-app notifications and preferences; and
- strict RLS, audit, authorization, and lifecycle tests.

Deferred:

- poll voting;
- selected-user targeting UI;
- polygon geofencing and verified residency;
- native push, Community mass SMS, and Community mass email;
- paid promotions, subscriptions, payments, booking, lead sales, reviews, and ratings;
- advanced recommendation/ranking;
- external search services; and
- AI moderation.

## Architectural Risks And Controls

- **Authorization sprawl**: use capability and permission catalogs rather than continually widening
  hardcoded role checks.
- **Generic-content ambiguity**: retain typed one-to-one records and database checks.
- **Polymorphic integrity**: use real nullable foreign keys with exactly-one checks or separate join
  tables; never accept unvalidated arbitrary target IDs.
- **Admin instability**: keep Community Admin routes/components separate from the existing large
  Tenant Admin component.
- **Broadcast abuse**: separate publication from broadcast, require explicit authority, preview
  recipient counts, deduplicate, and audit.
- **Location privacy**: areas express relevance, not proof of residence; exact member location is not
  exposed to other members.
- **Media abuse/cost**: private storage, limits, validation, moderation, and controlled delivery.
- **Advertising takeover**: separate listings from promotions and retain rate-limit metadata.
- **Emergency reliability**: do not promise channels that lack verified production delivery and
  monitoring.

## Completion Standard

The Community foundation is not complete until migrations, generated types, authorization/RLS
tests, application paths, lifecycle and notification behavior, operations documentation, roadmap,
and session handoff all agree. Production rollout must begin with a disabled tenant capability and
an explicit pilot tenant enablement.
