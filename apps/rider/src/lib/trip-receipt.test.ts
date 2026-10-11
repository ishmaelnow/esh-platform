import { describe, expect, it } from "vitest";
import { quoteBreakdown, receiptMoney, receiptText, safeStripeReceipt, type TripReceipt } from "./trip-receipt";
const snapshot = { baseFareMinor: 200, perMileMinor: 100, perMinuteMinor: 20, minimumFareMinor: 500, tollAmountMinor: 600, serviceTypeSurchargeMinor: 100 };
describe("recorded trip receipts", () => {
  it("balances immutable quote components including minimum, tolls and vehicle option", () => {
    const lines = quoteBreakdown(snapshot, 1609, 60, 1200);
    expect(lines.find((line) => line.label === "Minimum fare adjustment")?.amountMinor).toBe(180);
    expect(lines.reduce((total, line) => total + line.amountMinor, 0)).toBe(1200);
    for (const invalid of [null, {}, { ...snapshot, perMileMinor: "100" }, { ...snapshot, baseFareMinor: -1 }])
      expect(quoteBreakdown(invalid, 1609, 60, 1200)).toEqual([]);
    expect(quoteBreakdown(snapshot, 1609, 60, 1201)).toEqual([]);
  });
  it("uses currency minor units including zero and three decimal currencies", () => {
    expect(receiptMoney(1234, "USD")).toContain("12.34");
    expect(receiptMoney(1234, "JPY")).toContain("1,234");
    expect(receiptMoney(1234, "KWD")).toContain("1.234");
  });
  it("allows only HTTPS processor receipt links", () => {
    expect(safeStripeReceipt("https://pay.stripe.com/receipts/test")).toBeTruthy();
    for (const url of ["javascript:alert(1)", "https://stripe.com.evil.test/receipt", "https://user@pay.stripe.com/receipt", "http://pay.stripe.com/receipt", null])
      expect(safeStripeReceipt(url)).toBeNull();
  });
  it("exports recorded status without claiming an unpriced or uncollected trip was paid", () => {
    const receipt: TripReceipt = { bookingId: "trip", company: "TEST company", status: "cancelled", createdAt: "2026-10-10T12:00:00Z", completedAt: null,
      pickup: "TEST pickup", destination: "TEST destination", currency: null, fareMinor: null, quotedFareMinor: null, farePolicy: null,
      breakdown: [], payments: [], refunds: [], wallet: null, settlements: [], disputes: [], review: null };
    expect(receiptText(receipt)).toContain("Fare: Not recorded");
    expect(receiptText(receipt)).toContain("No payment record available");
    const split = { ...receipt, currency: "USD", fareMinor: 1200, payments: [{ id: "payment", amountMinor: 900, currency: "USD", status: "refunded", date: receipt.createdAt,
      method: "VISA ending in 4242", receiptUrl: "https://pay.stripe.com/receipts/test" }], wallet: { amountMinor: 300, currency: "USD", status: "restored", restoredAt: receipt.createdAt },
      refunds: [{ amountMinor: 900, currency: "USD", status: "succeeded", date: receipt.createdAt }],
      settlements: [{ amountMinor: 100, currency: "USD", direction: "charge", status: "balance_due" }] };
    expect(receiptText(split)).toContain("Booked fare: $12.00");
    expect(receiptText(split)).toContain("ESH trip credit: $3.00 - restored");
    expect(receiptText(split)).toContain("balance due");
    expect(receiptText(split)).not.toContain("pay.stripe.com");
  });
});
