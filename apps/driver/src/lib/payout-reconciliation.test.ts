import { describe, expect, it } from "vitest";
import { transferReferencesFromBalanceTransactions } from "./payout-reconciliation";

describe("payout reconciliation", () => {
  it("keeps unique Stripe transfer balance activity only", () => {
    expect(transferReferencesFromBalanceTransactions([
      { id: "txn_1", type: "transfer", source: "tr_esh" },
      { id: "txn_duplicate", type: "transfer", source: "tr_esh" },
      { id: "txn_fee", type: "stripe_fee", source: null },
      { id: "txn_charge", type: "charge", source: "ch_1" },
      { id: "txn_2", type: "transfer", source: { id: "tr_second" } },
    ])).toEqual([
      { providerTransferId: "tr_esh", providerBalanceTransactionId: "txn_1" },
      { providerTransferId: "tr_second", providerBalanceTransactionId: "txn_2" },
    ]);
  });
});
