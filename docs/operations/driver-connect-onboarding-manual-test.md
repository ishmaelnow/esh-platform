# Driver Stripe Connect Onboarding V1 Manual Test

## Stripe and Vercel setup

1. Enable Stripe Connect in the same RideEasy sandbox used for Rider Checkout.
2. In the Driver Vercel project, add server-only `STRIPE_SECRET_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, and `STRIPE_CONNECT_WEBHOOK_SECRET`. Never use `NEXT_PUBLIC_`.
3. In Stripe Workbench, create a separate destination named `esh_driver_connect` with scope
   **Connected accounts**, endpoint `https://driver.eshapp.com/api/webhooks/stripe-connect`, snapshot
   payloads, and selected event `account.updated`.
4. Copy that destination's distinct `whsec_...` value into `STRIPE_CONNECT_WEBHOOK_SECRET`, then
   redeploy Driver.
5. Dry-run and apply only `20260812000300_driver_connect_onboarding_v1.sql`.

## Onboarding test

1. Sign in to Driver, open **Earnings**, and select **Set up payouts**.
2. Confirm Stripe—not ESH—collects the legal identity and test bank-account information.
3. Complete Stripe's sandbox onboarding and return to Driver.
4. Refresh Driver. Confirm the payout status progresses from details required/under review to
   enabled when Stripe enables transfers and payouts. Use **Continue payout setup** for outstanding
   requirements.
5. When enabled, select **Manage payout account** and confirm Stripe Express opens.
6. In Admin Ledger, confirm the Driver payout-account status appears without bank or identity data.
7. Confirm a different Driver and tenant cannot read this payout account.
8. Confirm an invalid Connect webhook signature changes no state.

## Wallet expectations

- Completed earnings with a successful Rider payment appear as **Collected earnings**.
- Older/unpaid completed earnings remain **Pending earnings**.
- **Paid** remains $0.00 because this version does not create transfers.
- Stripe onboarding must not change the Driver payable ledger balance.
