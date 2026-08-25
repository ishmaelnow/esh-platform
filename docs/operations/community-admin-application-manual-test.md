# Community Admin Application — Production Manual Test

## Deployment Gate

1. Create a Vercel project from the ESH repository with Root Directory `apps/community-admin`.
2. Add only the four variables documented in `apps/community-admin/.env.example`.
3. Deploy first using the generated `*.vercel.app` production URL.
4. Add `NEXT_PUBLIC_COMMUNITY_ADMIN_URL=https://community-admin.eshapp.com` to the existing Admin
   Vercel project and redeploy Admin.
5. Attach `community-admin.eshapp.com` to Community Admin and add the exact CNAME supplied by Vercel
   in Netlify DNS. There is no migration for this feature.

## Authentication And Admission

1. Open `https://community-admin.eshapp.com` in a signed-out browser.
2. Confirm the page says **ESH Community** and **Community Administration**.
3. Confirm the password eye shows and hides the entered value without submitting the form.
4. Sign in with a Transportation-only administrator. Expect a neutral access-denied message and no
   tenant information.
5. Sign in with a Community-member-only account. Expect the same denial.
6. Sign in with the explicitly enrolled Community administrator for Community Hub.
7. Confirm only eligible Community tenant workspaces appear.
8. Open Community Hub and confirm the browser moves to `/community`.

## Operational And Route Isolation

1. Confirm the page identifies **Community Hub Community Administration**.
2. Confirm the foundation, content, and safety areas render without Transportation navigation.
3. Confirm **Exit Community Administration** ends the product lease and returns to `/`.
4. Confirm **Sign out** displays progress, returns to the signed-out entry, and remains signed out
   after refresh and browser Back.
5. Confirm these paths redirect to `/` and expose no corresponding UI:
   - `/platform`
   - `/governance`
   - `/transportation`
   - `/invite/example`
   - `/api/tenant-admin/settings`

## Product Exclusivity

1. Open Community Administration in Tab A.
2. Enter Transportation or tenant governance using the same person in Tab B.
3. Return to Tab A and wait up to 60 seconds.
4. Confirm Community operational access clears and returns to Community Admin entry.
5. Confirm reopening `/community` does not silently create a lease.

## Control-Plane And Member Regression

1. Sign into `https://admin.eshapp.com` and confirm its Community launcher opens
   `https://community-admin.eshapp.com`, not the Community member application.
2. Confirm Platform and tenant-governance controls remain on `admin.eshapp.com`.
3. Open `https://community.eshapp.com` and confirm it remains the separate member feed.
4. Confirm signing into one surface does not silently authenticate either of the other surfaces.

## Pass Criteria

- Community Administration has its own deployment, domain, sign-in, storage key, and routes.
- Shared identity does not imply product access.
- Community member access alone does not grant administrative admission.
- Only explicit Community operational roles are admitted.
- Community product entry and stale-session denial remain server-authoritative.
- Admin governance, Transportation, and Community member applications remain separate and usable.
