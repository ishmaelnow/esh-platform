# Community Core Content — Production Manual Test

## Safe deployment

Run the migration dry run and confirm it lists only
`20260823000600_community_core_content.sql`. Apply it before deploying the independent Community app.
The migration does not enable Community, enroll a member, or create content.

## Dark-rollout SQL

Confirm all 11 new tables have RLS enabled and all content tables contain zero rows. Confirm existing
tenants still have `app.community = false` before authorizing a pilot.

## Application dark state

Deploy `apps/community` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. A person
without an enabled Community enrollment must be denied with **This account does not have access to
ESH Community.** The app must clear its Community-local authentication session and must not expose
tenant choices, feed, navigation, or post access. Refreshing must return to the Community sign-in
screen rather than retaining an admitted Community session.

## Authorized pilot

Only after the owner explicitly approves the Yahooemail pilot:

1. Enable the six Community capabilities in tenant governance.
2. Enable the Community workspace.
3. Enroll one test membership with `community_member`.
4. Sign in to Community and select **Enter Community**.
5. Publish one clearly identified test post for Community members.
6. Confirm it appears in the chronological feed with the correct author and tenant.
7. Confirm a different tenant/member cannot read or create the post.
8. Exit Community and confirm its product session ends.

Do not enable emergency broadcasts, SMS, email, or push during this test.
