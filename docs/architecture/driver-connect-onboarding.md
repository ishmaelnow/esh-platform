# Driver Stripe Connect Onboarding V1

Driver payout setup uses Stripe connected accounts configured with an Express Dashboard and
Stripe-hosted onboarding. The Driver app's authenticated server routes create or resume onboarding
and generate Express dashboard links. New accounts use explicit controller properties rather than
the legacy `type: express` account parameter so newly registered Connect platforms can create them.
Stripe collects bank, identity, tax, and verification information directly; ESH stores only the
connected-account identifier, readiness flags, outstanding-requirement names, and audit history.

The Driver Vercel project holds `STRIPE_SECRET_KEY`, `STRIPE_CONNECT_WEBHOOK_SECRET`, and
`SUPABASE_SERVICE_ROLE_KEY` as server-only variables. The browser receives only short-lived Stripe
URLs. Connect `account.updated` events are accepted only after signature verification and update the
tenant- and Driver-scoped payout record idempotently.

Wallet availability now distinguishes completed earnings backed by a successful Rider payment from
uncollected earnings. “Collected earnings” means eligible for a future transfer policy; onboarding
does not itself transfer money. The Driver payable ledger remains the authoritative amount owed.

Deferred: creating Stripe Transfers, transfer reversals, payout scheduling, minimum thresholds,
processor fees, tax statements, negative-balance recovery, disputes, and reconciliation.
