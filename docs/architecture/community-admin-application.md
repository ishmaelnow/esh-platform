# Independent Community Admin Application

## Boundary

Community operations are deployed from `apps/community-admin` and served at
`https://community-admin.eshapp.com`. The application is distinct from both the Community member
application at `community.eshapp.com` and the neutral governance control plane at
`admin.eshapp.com`.

The shell exposes only `/` and `/community`. It contains no Platform, tenant-governance,
Transportation, Rider, Driver, invitation, payment, notification-worker, or cron routes. It
compiles the proven `CommunityWorkspaceApp` from Admin source as an extraction bridge; after
production proof, reusable Community Admin code should move into a neutral product package.

## Admission And Sessions

The browser client uses the dedicated `esh-community-admin-auth` storage key. Authentication alone
does not grant Community Administration. Admission requires an enabled Community workspace,
explicit Community enrollment, and at least one operational role:

- `community_admin`
- `community_moderator`
- `emergency_publisher`

`community_member` alone is intentionally insufficient. Transportation, Rider, Driver, Platform,
or tenant-governance access does not imply Community Administration.

After admission, the operator selects one eligible tenant. The application persists that tenant
preference and creates the server-authoritative Community product lease before navigating to
`/community`. The existing heartbeat and database authorization remain authoritative. Entering
another product or governance invalidates the stale Community Admin context.

## Deployment

Create a separate Vercel project from the same repository with Root Directory
`apps/community-admin`. It requires only:

```text
NEXT_PUBLIC_ADMIN_SURFACE=community-admin
NEXT_PUBLIC_SUPABASE_URL=<existing public URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<existing public key>
NEXT_PUBLIC_COMMUNITY_ADMIN_URL=https://community-admin.eshapp.com
```

No privileged backend secrets, new database, or Supabase migration are required. Add
`NEXT_PUBLIC_COMMUNITY_ADMIN_URL=https://community-admin.eshapp.com` to the existing Admin project
and redeploy Admin so its Community launcher opens the independent application. Attach the custom
domain only after the generated Vercel URL passes admission and isolation tests.

The legacy `admin.eshapp.com/community` route remains temporarily as rollback protection. Retire it
after the independent application passes production validation and the observation window closes.
