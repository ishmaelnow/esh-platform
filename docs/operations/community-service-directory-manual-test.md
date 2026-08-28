# Community service directory manual test

1. Run `pnpm exec supabase db push --dry-run` and confirm only `20260827000100_community_service_listings.sql` is listed; the owner then applies it.
2. With Community still disabled, confirm the member Services section is empty and no listing can be submitted.
3. Enable `community.services` and `service_provider_posting_enabled` for a test tenant only, then open `https://community.eshapp.com` in an explicitly entered Community session.
4. Submit a provider listing with one contact method. Confirm it is not visible in the public directory while `pending`.
5. Open `https://community-admin.eshapp.com` as a moderator. Confirm the listing appears in Service listing review, and that a decision requires a reason.
6. Approve it, refresh the member directory, and confirm it appears only for the same tenant with an active provider.
7. Reject or suspend another listing and confirm it disappears from the directory. Verify the tenant audit event records the decision and reason.
8. Restore the test tenant's capability/settings after testing.
