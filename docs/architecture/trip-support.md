# Trip support and lost items

Riders open Get help on a completed or cancelled trip in Trips → Show history. Reports are private
to the owning active Rider and the tenant's authorized transportation managers. Live Driver chat,
booking status, payments, refunds, ratings and dispatch remain separate workflows. Support does
not initiate an emergency action, issue a refund or disclose a report to a Driver.

## Authorization and storage

Migration `20261010000400_trip_support.sql` adds cases and an append-only-through-RPC review trail.
Both tables enable RLS and deny all direct anonymous/authenticated table access. Security-definer
RPCs use a fixed public search path and explicit authorization, with execute granted only to
authenticated callers. Service-role maintenance access is retained; the application uses no
service credentials for this feature. Private helper execution is revoked from clients.

Rider reads/submits require an active person, active tenant, active owning Rider profile, and
completed/cancelled booking. Client-selected booking/tenant IDs never establish authorization.
Managers use existing `can_manage_dispatch` (owner/admin and operational capability), plus an
active person. Drivers and unrelated Riders cannot read or review. Composite foreign keys bind
the case to its booking and Rider within the tenant. No RLS grants on existing tables change.

Descriptions are trimmed, 10–2000 characters, with controlled trip_issue/lost_item categories.
One report per category per trip bounds duplicates, including after reload. A memory-only request
UUID makes identical uncertain submissions idempotent; changing a retry's body/category/booking
is rejected. Booking-row locking serializes submissions on the same trip. Reports are retained
with trip history rather than deleted when the trip ends. No attachments, ID documents, location
tracking, payment details or private chat transcript are collected through this form.

## Review and recovery

Admin navigation adds Trip support. The tenant queue filters Received, Under review and Resolved,
with 50-row pagination and deterministic creation-time/ID ordering. Each saved review requires a
Rider-visible text response (1–2000 characters), writes a history entry and increments the version.
Identical lost-response retries succeed without an extra history entry; conflicting stale edits
must refresh. Managers may reopen a resolved report with a new response. There are no hidden
internal notes. Audit records include identifiers/category/status/version, never report/reply text.

The Rider sees every response and current status by reopening Get help or refreshing it. The UI
refreshes on foreground/online events; no background polling or push/email/SMS notification is
produced in V1. The screen explicitly explains this. Existing notification preferences and senders
are unchanged. New automatic support alerts would need a separately designed delivery contract.

Drafts and retry IDs stay in memory; closing the form or signing out discards them. Confirmed
submissions remain confirmed even if a subsequent list refresh fails. Private rows clear on failed
refresh, account/provider changes remount the component, and obsolete responses are ignored.
Network errors use customer-facing wording; uncertain mutations never trigger automatic retries.
Text renders as escaped React text. Expanded controls flow in the scrollable trip history, with
no fixed support action that can overlap the keyboard. Browser short-viewport checks approximate
keyboard space; physical keyboard behavior remains a device acceptance check.

## Deployment and limits

Owner applies the migration after intended-only dry run, then deploys Rider and Transportation
(the operational UI imports Admin's shared component). Admin build is checked too. Existing native
shells load the hosted UI; no APK/IPA, new credentials or environment variables are required.
Transportation uses the existing shared map stylesheet export rather than relying on an undeclared
direct mapbox-gl dependency; map appearance/behavior is unchanged.

This first release supports two report categories and company replies, not Rider follow-up threads,
attachments, guaranteed response times, automated lost-item recovery or automatic alerts.
Data retention follows existing trip history; no automatic purge policy is introduced.
Minimal PostgreSQL smoke tests use stand-in legacy dependencies and are not a full Supabase-chain
or true multi-session concurrency certification. See the operations manual for release acceptance.
