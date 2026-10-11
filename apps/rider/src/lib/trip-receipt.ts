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
export function receiptText(receipt: TripReceipt): string {
  const money = (value: number, currency: string) => receiptMoney(value, currency);
  const date = (value: string) => new Date(value).toLocaleString();
  const lines = ["ESH trip receipt", receipt.company, `Trip reference: ${receipt.bookingId}`, `Trip status: ${receipt.status}`,
    `Booked: ${date(receipt.createdAt)}`, ...(receipt.completedAt ? [`Completed: ${date(receipt.completedAt)}`] : []),
    `Pickup: ${receipt.pickup}`, `Destination: ${receipt.destination}`,
    receipt.fareMinor != null && receipt.currency ? `${receipt.status === "cancelled" ? "Booked" : "Recorded"} fare: ${money(receipt.fareMinor, receipt.currency)}` : "Fare: Not recorded",
    ...(receipt.quotedFareMinor != null && receipt.currency ? [`Upfront quote: ${money(receipt.quotedFareMinor, receipt.currency)}`] : []),
    ...receipt.breakdown.map((line) => `${line.label}: ${money(line.amountMinor, receipt.currency!)}`),
    ...(receipt.review ? [`Fare review: ${receipt.review.status.replaceAll("_", " ")} - contract fare ${money(receipt.review.contractFareMinor, receipt.review.currency)}`] : []),
    ...receipt.payments.map((payment) => `Online payment: ${money(payment.amountMinor, payment.currency)} - ${payment.status} - ${payment.method} - ${date(payment.date)}`),
    ...(receipt.wallet ? [`ESH trip credit: ${money(receipt.wallet.amountMinor, receipt.wallet.currency)} - ${receipt.wallet.status}`] : []),
    ...receipt.refunds.map((refund) => `Refund: ${money(refund.amountMinor, refund.currency)} - ${refund.status}`),
    ...receipt.settlements.map((item) => `Fare difference ${item.direction}: ${money(item.amountMinor, item.currency)} - ${item.status.replaceAll("_", " ")}`),
    ...receipt.disputes.map((item) => `Payment dispute: ${money(item.amountMinor, item.currency)} - ${item.status.replaceAll("_", " ")}`),
    ...(!receipt.payments.length && !receipt.wallet ? ["No payment record available. This does not confirm payment."] : []),
    "Amounts and statuses reflect recorded activity when loaded. Fare review or a balance due is not a completed charge.",
    "Trip summary; not a tax invoice. Stripe receipts remain the processor payment record."];
  return lines.join("\n");
}
