export type StripeBalanceTransactionReference = {
  id: string;
  type: string;
  source: string | { id: string } | null;
};

export function transferReferencesFromBalanceTransactions(
  transactions: StripeBalanceTransactionReference[],
) {
  const seen = new Set<string>();
  const references: Array<{ providerTransferId: string; providerBalanceTransactionId: string }> = [];
  for (const transaction of transactions) {
    const source = typeof transaction.source === "string" ? transaction.source : transaction.source?.id;
    if (transaction.type !== "transfer" || !source || !source.startsWith("tr_") || seen.has(source)) continue;
    seen.add(source);
    references.push({ providerTransferId: source, providerBalanceTransactionId: transaction.id });
  }
  return references;
}
