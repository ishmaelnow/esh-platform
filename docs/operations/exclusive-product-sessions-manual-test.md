# Exclusive Product Sessions — Production Manual Test

## Deployment

Run `pnpm exec supabase db push --dry-run` and confirm only
`20260823000500_exclusive_product_sessions.sql`. Apply it before deploying the Admin app.

The migration remains backward-compatible while the session table is empty. Push/deploy the paired
Admin commit immediately after applying it. Do not manually insert a product-session row. The first
**Open Transportation** action in the deployed selector activates enforcement permanently.

## Baseline

1. Sign in as the Yahooemail tenant owner at `https://admin.eshapp.com`.
2. Confirm only enabled, assigned operational products appear under **Your products**.
3. Confirm disabled Community is absent from the operational product cards. Do not enable it for
   this test.
4. If the account is a tenant owner, select **Manage tenant governance** and confirm Community is
   visible there as disabled, then close governance.
5. Click **Open Transportation**. Confirm `/transportation` loads normally.

## Governance invalidates Transportation

1. Leave Transportation open in Tab A.
2. Open `https://admin.eshapp.com` in Tab B.
3. Return to Tab A and wait up to 60 seconds.
4. Expect Tab A to return to `/` with guidance that Transportation was not opened; no tenant
   operational data may remain visible.
5. Directly reopening `/transportation` must return to the product-entry page and must not create a
   session automatically.
6. Explicitly click **Open Transportation** to restore access.

This scenario proves the old tab cannot remain operational. Community-to-Transportation switching
is deferred until an isolated pilot Community enrollment is authorized; do not enable Community
just to test it.

## Database evidence

```sql
select
  profile.normalized_email,
  product_session.workspace_key,
  product_session.status,
  product_session.activated_at,
  product_session.heartbeat_at,
  product_session.expires_at,
  product_session.ended_at,
  product_session.end_reason
from public.product_operational_sessions product_session
join public.person_profiles profile using (person_id)
where profile.normalized_email = 'ishmaelkosh@gmail.com'
order by product_session.created_at desc
limit 10;
```

Expected: never more than one active row for the person. Returning to governance produces an ended
row; re-entering Transportation produces a new active row.

```sql
select event_name, reason, metadata, occurred_at
from public.tenant_audit_events
where event_name in (
  'product_session.entered',
  'product_session.ended',
  'product_session.superseded'
)
order by occurred_at desc
limit 20;
```

Expected: entry and exit events correspond to the UI actions. No Community session or enrollment
is created.

## Regression

- Transportation Admin works after explicit entry.
- Rider and Driver applications remain unaffected.
- Platform Admin remains available at `/platform`.
- The selector remains governance-only and Community remains disabled.
