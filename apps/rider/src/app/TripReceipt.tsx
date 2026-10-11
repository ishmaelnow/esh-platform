"use client";
import { useEffect, useState } from "react";
import { receiptSummary, receiptText, type TripReceipt as Receipt } from "../lib/trip-receipt";

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
      if (navigator.share) await navigator.share({ title: "ESH RECEIPT", text: receiptText(receipt) });
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
    const link = document.createElement("a"); link.href = url; link.download = "ESH-receipt.txt";
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <details className="trip-receipt" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>View trip receipt</summary>
    {open ? <div className="receipt-content">
      {loading ? <p role="status">Loading your receipt...</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <button className="button secondary compact" type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh receipt</button>
      {receipt ? <>
        <h4>ESH RECEIPT</h4>
        <dl className="receipt-lines">{receiptSummary(receipt).map((line, index) => <div key={`${line.label}-${index}`}>
          <dt>{line.label}</dt><dd>{line.value}</dd>
        </div>)}</dl>
        <div className="receipt-actions"><button className="button primary compact" type="button" onClick={download}>Download receipt</button>
          <button className="button secondary compact" type="button" onClick={() => void share()}>Share receipt</button></div>
        {notice ? <p role="status">{notice}</p> : null}
      </> : null}
    </div> : null}
  </details>;
}
