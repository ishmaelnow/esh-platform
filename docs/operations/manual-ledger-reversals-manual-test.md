# Manual Ledger Reversals V1 production test

Use clearly labeled test data. Both original and reversal remain permanently in financial history.

1. Run `pnpm exec supabase db push --dry-run` and confirm only
   `20260814000100_manual_ledger_reversals_v1.sql`, then have the owner apply it.
2. Deploy Admin. No new environment variable or Stripe configuration is required.
3. In Admin **Ledger → Manual journal**, post `MANUAL REVERSAL TEST` for `$7.00`, debiting Cash and
   payment clearing and crediting Operating adjustments. Record both account balances.
4. Open **Journal**, locate that manual entry, and select **Reverse manual journal**. Enter a clear
   reason of at least five characters and confirm.
5. Confirm the original remains visible and is labeled `reversed`. Confirm a new `Reversal:` entry
   is labeled `reversing entry`, contains the exact swapped debit/credit entries, and displays the
   shared correction reason and linked transaction references.
6. Confirm both affected account balances return to their pre-test values and all unrelated account
   balances remain unchanged.
7. Refresh and attempt to reverse the original again. Confirm no second control/transaction appears.
8. Confirm system-generated payment, trip fare, Driver earnings, transfer, settlement, and refund
   journals have no reversal control.
9. Confirm `ledger.manual_transaction_reversed` appears in tenant audit history with the reason.
10. As another tenant Admin, confirm neither transaction nor reversal link is visible.

Pass requires exact inverse entries, restored derived balances, immutable linked history,
idempotency, authorization and tenant isolation, audit, and rejection of automated transactions.
