"use client";
import { useEffect, useState } from "react";
import { receiptMoney, receiptText, type TripReceipt as Receipt } from "../lib/trip-receipt";

export function TripReceipt({ bookingId, tenantSlug, accessToken }: { bookingId: string; tenantSlug: string; accessToken: string }) {
  const [open, setOpen] = useState(false), [refresh, setRefresh] = useState(0);
  const [receipt, setReceipt] = useState<Receipt | null>(null), [loading, setLoading] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    setReceipt(null); setError(""); setNotice("");
    if (!open) return;
    const abort = new AbortController(); let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/trips/receipt?bookingId=${encodeURIComponent(bookingId)}&tenantSlug=${encodeURIComponent(tenantSlug)}`,
          { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: abort.signal });
        if (!response.ok) throw new Error("Unavailable");
        const value = await response.json() as Receipt;
        if (value.bookingId !== bookingId || !["completed", "cancelled"].includes(value.status)
          || !Array.isArray(value.payments) || !Array.isArray(value.breakdown)) throw new Error("Unavailable");
        if (alive) setReceipt(value);
      } catch { if (alive) setError("Your receipt could not be loaded. Check your connection and try again."); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; abort.abort(); };
  }, [open, refresh, bookingId, tenantSlug, accessToken]);
  async function share() {
    if (!receipt) return;
    try {
      if (navigator.share) await navigator.share({ title: "ESH trip receipt", text: receiptText(receipt) });
      else { await navigator.clipboard.writeText(receiptText(receipt)); setNotice("Receipt copied. You can paste it into a message."); }
    } catch (value) {
      if (value instanceof Error && value.name === "AbortError") return;
      try { await navigator.clipboard.writeText(receiptText(receipt)); setNotice("Receipt copied. You can paste it into a message."); }
      catch { setNotice("Sharing is unavailable here. Use Download receipt instead."); }
    }
  }
  function download() {
    if (!receipt) return;
    const url = URL.createObjectURL(new Blob([receiptText(receipt)], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `ESH-trip-${bookingId}.txt`;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const money = receiptMoney;
  return <details className="trip-receipt" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>View trip receipt</summary>
    {open ? <div className="receipt-content">
      {loading ? <p role="status">Loading your receipt...</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <button className="button secondary compact" type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh receipt</button>
      {receipt ? <>
        <h4>ESH trip receipt</h4><p>{receipt.company}</p>
        <p className="receipt-reference">Trip reference: {receipt.bookingId}</p>
        <p>{receipt.status === "completed" ? "Completed" : "Cancelled"}</p>
        <p>Booked: {new Date(receipt.createdAt).toLocaleString()}{receipt.completedAt ? ` · Completed: ${new Date(receipt.completedAt).toLocaleString()}` : ""}</p>
        <p><strong>Pickup</strong><br />{receipt.pickup}</p><p><strong>Destination</strong><br />{receipt.destination}</p>
        <dl className="receipt-lines"><div><dt>{receipt.status === "cancelled" ? "Booked fare" : "Recorded fare"}</dt>
          <dd>{receipt.fareMinor != null && receipt.currency ? money(receipt.fareMinor, receipt.currency) : "Not recorded"}</dd></div></dl>
        {receipt.quotedFareMinor != null && receipt.currency ? <>
          <h4>Upfront fare breakdown</h4>
          <dl className="receipt-lines">{receipt.breakdown.map((line) => <div key={line.label}><dt>{line.label}</dt><dd>{money(line.amountMinor, receipt.currency!)}</dd></div>)}
            <div><dt>Upfront quote</dt><dd>{money(receipt.quotedFareMinor, receipt.currency)}</dd></div></dl>
          {!receipt.breakdown.length ? <p>Itemized details are unavailable for this trip.</p> : null}
          {receipt.farePolicy ? <p>Fare policy: {({ guaranteed_upfront: "Guaranteed upfront", metered_actual: "Metered actual", protected_flexible: "Protected flexible" } as Record<string, string>)[receipt.farePolicy] ?? "Recorded fare contract"}</p> : null}
        </> : <p>Itemized details were not recorded for this trip.</p>}
        {receipt.review ? <p>Fare review: {receipt.review.status.replaceAll("_", " ")} · contract fare {money(receipt.review.contractFareMinor, receipt.review.currency)}. Review does not confirm collection or a refund.</p> : null}
        <h4>Payment activity</h4>
        {!receipt.payments.length && !receipt.wallet ? <p>No payment record available. This does not confirm payment.</p> : null}
        {receipt.payments.map((payment) => <div className="receipt-activity" key={payment.id}>
          <strong>Online payment · {money(payment.amountMinor, payment.currency)}</strong>
          <p>{payment.status.replaceAll("_", " ")} · {new Date(payment.date).toLocaleString()}</p><p>{payment.method}</p>
          {payment.receiptUrl ? <a className="text-button" target="_blank" rel="noopener noreferrer" href={payment.receiptUrl}>Open payment receipt</a> : null}
        </div>)}
        {receipt.wallet ? <div className="receipt-activity"><strong>ESH trip credit · {money(receipt.wallet.amountMinor, receipt.wallet.currency)}</strong>
          <p>{receipt.wallet.status === "restored" ? "Returned to your wallet" : receipt.wallet.status === "applied" ? "Applied to this trip" : "Reserved"}</p>
          {receipt.wallet.restoredAt ? <time>{new Date(receipt.wallet.restoredAt).toLocaleString()}</time> : null}</div> : null}
        {receipt.refunds.map((refund, index) => <div className="receipt-activity" key={`refund-${index}`}><strong>Refund · {money(refund.amountMinor, refund.currency)}</strong>
          <p>{refund.status === "succeeded" ? "Refunded" : refund.status === "pending" ? "Processing" : "Not completed"}{refund.date ? ` · ${new Date(refund.date).toLocaleString()}` : ""}</p></div>)}
        {receipt.settlements.map((item, index) => <p key={`settlement-${index}`}>Fare difference {item.direction === "refund" ? "refund" : "charge"}: {money(item.amountMinor, item.currency)} · {item.status.replaceAll("_", " ")}</p>)}
        {receipt.disputes.map((item, index) => <p key={`dispute-${index}`}>Payment dispute: {money(item.amountMinor, item.currency)} · {item.status.replaceAll("_", " ")}</p>)}
        <p>Amounts and statuses reflect recorded activity when loaded. Fare review or a balance due is not a completed charge.</p>
        <div className="receipt-actions"><button className="button primary compact" type="button" onClick={download}>Download receipt</button>
          <button className="button secondary compact" type="button" onClick={() => void share()}>Share receipt</button></div>
        {notice ? <p role="status">{notice}</p> : null}
        <p className="area">Sharing includes your trip addresses. This trip summary is not a tax invoice. Payment receipts open securely on Stripe.</p>
      </> : null}
    </div> : null}
  </details>;
}
