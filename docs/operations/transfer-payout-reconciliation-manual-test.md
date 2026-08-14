# Transfer-to-Payout Reconciliation V1 production test

1. Run `pnpm exec supabase db push --dry-run` and confirm only
   `20260813000500_transfer_payout_reconciliation_v1.sql` is listed, then have the owner apply it.
2. Deploy Driver and Admin. No new environment variable or Stripe webhook event is required; keep
   the existing connected-account payout events and signing secret.
3. Use an automatic Stripe test payout containing the known $41.05 ESH transfer, or replay that
   payout's existing verified event after deployment.
4. In Driver **Earnings → Bank payout activity**, confirm the payout shows reconciliation status,
   matched amount, allocation count, and the contributing ESH trip reference. The matched total must
   equal the payout only when all payout balance activity came from recorded ESH transfers.
5. In Admin **Ledger → Bank payouts**, confirm the same status, matched/unmatched totals, and transfer
   count for the correct Driver.
6. Confirm no new ledger journal appears; the earlier `Driver earnings transferred to Stripe`
   posting remains the only cash/payable movement.
7. Replay the same payout event. Confirm allocation rows and totals do not duplicate and no unchanged
   reconciliation audit event is added.
8. If the connected balance contains non-ESH activity, confirm the result is `partial` or `unmatched`
   and the difference is visible rather than attributed to a trip.
9. For a manual payout, confirm `unsupported manual` and no guessed trip allocations.
10. Sign in as a different Driver and tenant Admin and confirm they cannot see this payout's links.

Pass requires verified connected-account lookup, exact same-Driver/same-currency matching,
idempotency, honest unmatched/manual handling, tenant isolation, and no second ledger posting.
