export type ReceiptLine = { label: string; amountMinor: number };
export type TripReceipt = {
  bookingId: string; company: string; status: string; createdAt: string; completedAt: string | null;
  pickup: string; destination: string; currency: string | null; fareMinor: number | null;
  quotedFareMinor: number | null; farePolicy: string | null; breakdown: ReceiptLine[];
  payments: { id: string; amountMinor: number; currency: string; status: string; date: string;
    method: string; receiptUrl: string | null }[];
  refunds: { amountMinor: number; currency: string; status: string; date: string | null }[];
  wallet: { amountMinor: number; currency: string; status: string; restoredAt: string | null } | null;
  settlements: { amountMinor: number; currency: string; direction: string; status: string }[];
  disputes: { amountMinor: number; currency: string; status: string }[];
  review: { status: string; contractFareMinor: number; currency: string } | null;
};
export const receiptMoney = (amount: number, currency: string) => new Intl.NumberFormat(undefined,
  { style: "currency", currency }).format(amount / 10 ** (new Intl.NumberFormat(undefined, { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2));
const amount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
// Reconstruct only the immutable quote formula, and only when it balances exactly.
// Never present current tenant rates or guessed historical components as recorded charges.
export function quoteBreakdown(snapshot: unknown, distance: number, duration: number, fare: number): ReceiptLine[] {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
  const row = snapshot as Record<string, unknown>;
  const base = row.baseFareMinor, mile = row.perMileMinor, minute = row.perMinuteMinor, minimum = row.minimumFareMinor;
  const toll = row.tollAmountMinor ?? 0, service = row.serviceTypeSurchargeMinor ?? 0;
  if (![base, mile, minute, minimum, toll, service, fare, distance, duration].every(amount)) return [];
  const miles = Math.round(distance * (mile as number) / 1609.344), minutes = Math.round(duration * (minute as number) / 60);
  const subtotal = (base as number) + miles + minutes;
  const adjustment = Math.max(0, (minimum as number) - subtotal);
  const lines = [{ label: "Base fare", amountMinor: base as number }, { label: "Quoted distance", amountMinor: miles },
    { label: "Quoted time", amountMinor: minutes }, { label: "Minimum fare adjustment", amountMinor: adjustment },
    { label: "Vehicle option", amountMinor: service as number }, { label: "Tolls", amountMinor: toll as number }];
  return lines.every((line) => amount(line.amountMinor)) && lines.reduce((sum, line) => sum + line.amountMinor, 0) === fare
    ? lines.filter((line) => line.amountMinor > 0) : [];
}
export function safeStripeReceipt(value: unknown): string | null {
  try {
    const url = new URL(typeof value === "string" ? value : "");
    return url.protocol === "https:" && !url.username && !url.password && (url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com"))
      ? url.toString() : null;
  } catch { return null; }
}
export function receiptSummary(receipt: TripReceipt): { label: string; value: string }[] {
  const money = (value: number, currency: string) => receiptMoney(value, currency);
  const status = (value: string) => ({ paid: "Paid", refunded: "Refunded", pending: "Pending",
    processing: "Processing", failed: "Not completed", expired: "Not completed", cancelled: "Cancelled",
    requires_action: "Action needed" } as Record<string, string>)[value] ?? "Unconfirmed";
  return [
    { label: "Trip", value: receipt.status === "completed" ? "Completed" : "Cancelled" },
    { label: "Date", value: new Date(receipt.completedAt ?? receipt.createdAt).toLocaleString() },
    { label: "Pickup", value: receipt.pickup }, { label: "Destination", value: receipt.destination },
    { label: receipt.status === "cancelled" ? "Booked fare" : "Fare",
      value: receipt.fareMinor != null && receipt.currency ? money(receipt.fareMinor, receipt.currency) : "Not recorded" },
    ...receipt.payments.map((payment) => {
      const method = /^(VISA|MASTERCARD|AMEX|DISCOVER|JCB|UNIONPAY|DINERS|CARD) ending in \d{4}$/i.test(payment.method) ? payment.method : "";
      return { label: "Payment", value: `${money(payment.amountMinor, payment.currency)} · ${status(payment.status)}${method ? ` · ${method}` : ""}` };
    }),
    ...(receipt.wallet ? [{ label: "ESH credit", value: `${money(receipt.wallet.amountMinor, receipt.wallet.currency)} · ${receipt.wallet.status === "restored" ? "Returned to your wallet" : receipt.wallet.status === "applied" ? "Applied to this trip" : "Reserved"}` }] : []),
    ...receipt.refunds.map((refund) => ({ label: "Refund", value: `${money(refund.amountMinor, refund.currency)} · ${refund.status === "succeeded" ? "Refunded" : refund.status === "pending" ? "Processing" : "Not completed"}` })),
    ...receipt.settlements.filter((item) => item.direction === "charge" && item.status === "balance_due")
      .map((item) => ({ label: "Amount due", value: money(item.amountMinor, item.currency) })),
    ...(!receipt.payments.length && !receipt.wallet ? [{ label: "Payment", value: "Details unavailable" }] : []),
  ];
}
export function receiptText(receipt: TripReceipt): string {
  return ["ESH RECEIPT", ...receiptSummary(receipt).map((line) => `${line.label}: ${line.value}`)].join("\n");
}
