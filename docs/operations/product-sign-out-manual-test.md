# Product Sign-Out — Production Manual Test

## Purpose

Verify every ESH exit control ends the current browser's product session visibly and reliably
without silently revoking unrelated devices. Sign-out must wait for the authentication result,
prevent duplicate clicks, report failure, and return to the product's signed-out entry state.

## Test Matrix

Test each applicable surface after its production deployment:

1. `https://admin.eshapp.com` — Platform and tenant governance.
2. `https://transportation.eshapp.com` — Transportation entry and operations.
3. `https://community.eshapp.com` — Community member application.
4. `https://rider.eshapp.com` — Rider portal.
5. `https://driver.eshapp.com` — Driver portal.
6. A pending tenant invitation — **Sign in with another account**.
7. A Driver application — **Use a different email**.

For each surface:

1. Sign in and confirm private account data is visible.
2. Click its sign-out or account-switch control once.
3. Confirm the control shows **Signing out…** and cannot be clicked repeatedly.
4. Confirm the application returns to its signed-out entry state.
5. Refresh the page and confirm private data does not return.
6. Use the browser Back button and confirm private data remains unavailable.
7. Confirm no unhandled authentication or Navigator LockManager error appears in the console.

For Community, also confirm sign-out succeeds even if ending the operational product lease reports
an error. The lease remains server-authoritative and expires independently; it must never trap the
user inside the browser session.

## Pass Criteria

- Every control provides immediate progress feedback and awaits local sign-out.
- Successful sign-out explicitly reloads or replaces the current entry URL.
- Failures are visible and the user can retry.
- Refresh and browser Back do not restore private account data.
- Signing out on one device does not intentionally revoke another device's refresh token.
- No database migration or environment change is required.
