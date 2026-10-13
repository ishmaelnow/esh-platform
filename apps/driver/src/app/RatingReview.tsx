"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import { readRatingReviews, reviewStatus, type RatingReview as Review, type PlatformSupabaseClient } from "@esh-platform/supabase";

const Context = createContext<{ rows: Review[]; ready: boolean; busy: boolean; submit: (id: string, reason: string) => Promise<boolean> } | null>(null);
export function RatingReviews({ client, role, tenantSlug, children, onRefresh }: {
  client: PlatformSupabaseClient; role: "rider" | "driver"; tenantSlug?: string; children: ReactNode; onRefresh: () => void;
}) {
  const [rows, setRows] = useState<Review[]>([]), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const alive = useRef(false);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    setReady(false);
    try {
      const result = role === "rider" ? await client.rpc("my_rider_rating_appeals", { target_tenant_slug: tenantSlug ?? "" }).abortSignal(controller.signal)
        : await client.rpc("my_driver_rating_appeals").abortSignal(controller.signal);
      if (!alive.current || request.current !== controller) return false;
      if (result.error) throw new Error("Unavailable");
      setRows(readRatingReviews(result.data)); setReady(true); setError(""); return true;
    } catch { if (alive.current && request.current === controller) setError("Rating reviews could not be loaded. Refresh to try again."); }
    finally { window.clearTimeout(timeout); }
  }, [client, role, tenantSlug]);
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; request.current?.abort(); }; }, [load]);
  async function submit(id: string, reason: string) {
    if (!ready || busy) return false;
    setBusy(true); setError("");
    const controller = new AbortController(); request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const result = role === "rider" ? await client.rpc("submit_my_rider_rating_appeal", { target_tenant_slug: tenantSlug ?? "", target_booking_id: id, reason_value: reason.trim() }).abortSignal(controller.signal)
        : await client.rpc("submit_my_driver_rating_appeal", { target_booking_id: id, reason_value: reason.trim() }).abortSignal(controller.signal);
      if (!alive.current) return false;
      if (result.error || typeof result.data !== "string") throw new Error("Unavailable");
      const confirmed = await load(); if (!alive.current) return false; onRefresh(); return confirmed === true;
    } catch { if (alive.current) setError("Your review request could not be confirmed. Refresh to check, or retry the same request."); return false; }
    finally { window.clearTimeout(timeout); if (alive.current) setBusy(false); }
  }
  return <Context.Provider value={{ rows, ready, busy, submit }}>
    <div className="rating-review-controls">
      <button type="button" disabled={busy} onClick={() => { void load(); onRefresh(); }}>Refresh rating reviews</button>
      {!ready && !error ? <p role="status">Loading rating reviews…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
    {children}
  </Context.Provider>;
}
export function RatingReview({ bookingId, received }: { bookingId: string; received: boolean }) {
  const context = useContext(Context), [reason, setReason] = useState("");
  if (!context) return null;
  const row = context.rows.find((item) => item.bookingId === bookingId);
  async function send(event: FormEvent) { event.preventDefault(); if (context && await context.submit(bookingId, reason)) setReason(""); }
  if (row) return <section className="rating-review" aria-label="Rating review">
    <strong>{reviewStatus(row.status)}</strong><p className="rating-review-text">{row.reason}</p>
    {row.resolutionNotes ? <><strong>Admin decision</strong><p className="rating-review-text">{row.resolutionNotes}</p></> : <p>Your company is reviewing your request.</p>}
  </section>;
  return received ? <details className="rating-review"><summary>Request review</summary>
    <p>Ask your transportation company to review the rating you received. This does not change your own submitted rating.</p>
    <form onSubmit={(event) => void send(event)}>
      <label>Reason for review<textarea required minLength={10} maxLength={1000} rows={3} value={reason} disabled={context.busy} onChange={(event) => setReason(event.target.value)} /></label>
      <button type="submit" disabled={!context.ready || context.busy || reason.trim().length < 10}>{context.busy ? "Submitting…" : "Submit review request"}</button>
    </form>
  </details> : null;
}

