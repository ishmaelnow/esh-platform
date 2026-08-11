# Ledger Foundation V1 production test

Use a clearly labeled amount and description. The test creates permanent accounting records; they
must not be deleted. If correction is required, post an equal reversing journal.

1. Confirm `pnpm exec supabase db push --dry-run` lists only
   `20260811000100_ledger_foundation_v1.sql`, then have the owner apply it.
2. Open Admin for the intended test tenant and select **Ledger**.
3. Initialize the ledger with the tenant's real operating currency. This choice is permanent.
4. Confirm five zero-balance accounts appear.
5. Post `10.00` with description `LEDGER V1 MANUAL TEST`, debit **Cash and payment clearing**, and
   credit **Platform fee revenue**.
6. Confirm the journal shows one debit and one credit for the same formatted amount.
7. Confirm Cash/payment clearing and Platform fee revenue each show a positive normal balance of
   `10.00`; all other balances remain zero.
8. Refresh and sign in again. Confirm balances and the journal persist.
9. Confirm `ledger.initialized` and `ledger.transaction_posted` appear in tenant audit history.
10. As another tenant administrator, confirm the test tenant's accounts and entries are absent.
11. If the test must be neutralized, post `LEDGER V1 MANUAL TEST REVERSAL` for `10.00`, debit
    **Platform fee revenue**, and credit **Cash and payment clearing**. Confirm both balances return
    to zero while both immutable transactions remain visible.

Pass requires tenant isolation, exact minor-unit display, balanced persistence, immutable history,
audit events, and successful refresh. Do not enter real card, bank, or processor information.
