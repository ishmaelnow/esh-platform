# Community Conversations And Safety V1 — Production Manual Test

## Deployment Gate

1. Run `pnpm exec supabase db push --dry-run` from the repository root.
2. Confirm it lists only `20260825000100_community_conversations_safety.sql`.
3. Apply the migration with `pnpm exec supabase db push`.
4. Push the owner-created commit and wait for both Community and Community Admin deployments to be
   Ready.
5. Do not enable any notification or broadcast channel for this test.

## Read-Only Database Validation

Confirm all interaction tables have RLS:

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'community_comments', 'community_content_reactions', 'community_comment_reactions',
  'community_user_blocks', 'community_user_mutes', 'community_reports',
  'community_media_assets', 'community_content_media'
)
order by c.relname;
```

Expect eight rows and `rls_enabled = true` for every row. Confirm `community-media` is private and
bounded:

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'community-media';
```

Expect `public = false`, `file_size_limit = 5242880`, and only JPEG, PNG, and WebP MIME types.

## Member Conversations

Use two clearly identified Community test members in the same pilot tenant.

1. Member A publishes a members-only post with one valid photo and useful alt text.
2. Confirm the post and short-lived private photo render after refresh.
3. Member B adds a comment.
4. Member B selects Like; Member A selects Helpful on the comment.
5. Refresh both browsers. Confirm counts and each viewer's selected state persist.
6. Select the same reaction again and confirm it toggles off without creating a duplicate.
7. Attempt more than four photos, a file over 5 MB, or a non-image file. Confirm the client rejects
   it before publishing.

## Member Safety

1. Member B reports Member A's post with category and optional details.
2. Confirm the post remains visible until a moderator makes a decision; reporting alone must not
   become an untrusted removal mechanism.
3. Member B mutes Member A. Confirm Member A's content disappears only for Member B.
4. Open **Safety**, unmute Member A, and confirm the content returns.
5. Block Member A and confirm the content disappears; unblock and confirm it returns.
6. Confirm reports, blocks, and mutes are not exposed in another ordinary member's database reads
   or UI.

## Moderator Workflow

1. Open `https://community-admin.eshapp.com` using an explicitly enrolled Community moderator or
   administrator.
2. Enter the same tenant and confirm the report appears in **Moderation queue** with its category,
   reporter, target author, excerpt, and details.
3. Verify a reason is required.
4. Choose **Dismiss** for a harmless test report. Confirm the report leaves the queue and the post
   remains visible.
5. Create another clearly identified test post/report and choose **Restrict** or **Remove**.
6. Confirm the content disappears from the member feed without being deleted from history.
7. Confirm every open report for the same target is resolved together so stale duplicate reports do
   not later overwrite the decision.
8. Query `tenant_audit_events` for `community.report_moderated` and confirm tenant, actor, reason,
   target, and decision evidence exists.

## Authorization And Isolation

1. Confirm a Community member without a moderator/admin role cannot enter Community Admin.
2. Confirm a Transportation-only identity cannot read or mutate Community interactions.
3. Confirm Tenant A cannot comment, react, report, attach media, or moderate Tenant B content.
4. Enter another product with the same person, wait up to 60 seconds, and confirm stale Community
   member/Admin operations stop.
5. Confirm direct inserts into interaction, report, and moderation tables remain unavailable.

## Cleanup

- Remove or restrict clearly identified test content through the moderator workflow.
- Undo test mutes and blocks.
- Do not delete audit or moderation history.
- Confirm no Driver availability or Transportation booking was changed during the test.

## Pass Criteria

- Comments and three controlled reaction types persist without duplicates.
- Private bounded media renders only through short-lived authorized access.
- Reports remain private and do not automatically hide content.
- Mute/block is viewer-specific and reversible.
- Moderator decisions are reasoned, soft-removing, tenant-isolated, and audited.
- Member, Community Admin, Transportation, Rider, and Driver boundaries remain independent.
