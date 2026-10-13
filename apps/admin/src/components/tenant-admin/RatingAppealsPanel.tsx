"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { readRatingReviews, reviewStatus, type RatingReview } from "@esh-platform/supabase";
import { createAdminBrowserClient } from "@/lib/browser-client";

type Row = RatingReview & { appellantType: string; overall: number; comment: string | null };
export function RatingAppealsPanel({ tenantId, userId, canManage, onRefresh }: { tenantId: string; userId: string; canManage: boolean; onRefresh: () => void }) {
  const [rows, setRows] = useState<Row[]>([]), [total, setTotal] = useState(0), [filter, setFilter] = useState("submitted"), [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    let alive = true; const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 10000);
    setRows([]); setTotal(0); setLoading(true); setError("");
    void (async () => {
      try {
        const result = await createAdminBrowserClient().rpc("admin_rating_appeals", { tenant_value: tenantId, status_value: filter, offset_value: offset }).abortSignal(controller.signal);
        if (!alive) return;
        const data = result.data as { total?: unknown; appeals?: unknown } | null;
        if (result.error || !data || typeof data.total !== "number" || !Number.isInteger(data.total) || data.total<0) throw new Error("Unavailable");
        const parsed = readRatingReviews(data.appeals);
        const raw = data.appeals as Array<Record<string, unknown>>;
        const reviewed = parsed.map((row, index) => {
          const value = raw[index]!;
          if (!["rider", "driver"].includes(String(value.appellantType)) || typeof value.overall !== "number" || !Number.isInteger(value.overall) || value.overall<1 || value.overall>5 || (value.comment !== null && typeof value.comment !== "string")) throw new Error("Unavailable");
          return { ...row, appellantType: value.appellantType as string, overall: value.overall, comment: value.comment };
        });
        setRows(reviewed); setTotal(data.total);
      } catch { if (alive) setError("Rating reviews could not be loaded. Check your connection and refresh."); }
      finally { window.clearTimeout(timeout); if (alive) setLoading(false); }
    })();
    return () => { alive = false; controller.abort(); window.clearTimeout(timeout); };
  }, [tenantId, userId, filter, offset, refresh]);
  return <section className="panel-stack" aria-label="Rating review queue">
    <header className="panel-header"><h3>Rating reviews</h3><p>Review requests from Riders and Drivers. Your explanation is visible to the person who requested review.</p></header>
    <div className="button-row"><label>Review status<select value={filter} onChange={(event) => { setFilter(event.target.value); setOffset(0); }}>
      <option value="all">All reviews</option>{(["submitted", "upheld", "removed"] as const).map((status) => <option key={status} value={status}>{reviewStatus(status)}</option>)}</select></label>
      <button className="secondary-button" disabled={loading} type="button" onClick={() => setRefresh((value) => value+1)}>Refresh reviews</button></div>
    {loading ? <p role="status">Loading rating reviews…</p> : error ? <p role="alert">{error}</p> : <p>{total ? `${total} reviews · showing ${offset+1}–${offset+rows.length}` : "No rating reviews in this view."}</p>}
    {rows.map((row) => <ReviewCard key={`${userId}:${tenantId}:${row.appealId}:${row.status}`} row={row} canManage={canManage} onSaved={() => { setRefresh((value) => value+1); onRefresh(); }} />)}
    <div className="button-row"><button className="secondary-button" type="button" disabled={loading || !offset} onClick={() => setOffset((value) => Math.max(0,value-50))}>Previous reviews</button>
      <button className="secondary-button" type="button" disabled={loading || !!error || offset+50>=total} onClick={() => setOffset((value) => value+50)}>Next reviews</button></div>
  </section>;
}
function ReviewCard({ row, canManage, onSaved }: { row: Row; canManage: boolean; onSaved: () => void }) {
  const [decision, setDecision] = useState(""), [notes, setNotes] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || !canManage) return;
    setBusy(true); setError("");
    const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const result = await createAdminBrowserClient().rpc("resolve_trip_rating_appeal", { target_appeal_id: row.appealId, resolution_value: decision, resolution_notes_value: notes.trim() }).abortSignal(controller.signal);
      if (!alive.current) return;
      if (result.error || result.data !== true) throw new Error("Unavailable");
      onSaved();
    } catch { if (alive.current) setError("The decision could not be confirmed. Refresh to check for another review, or retry the same decision."); }
    finally { window.clearTimeout(timeout); if (alive.current) setBusy(false); }
  }
  return <article className="panel rating-appeal-card">
    <h4>{row.appellantType === "rider" ? "Rider" : "Driver"} request · {reviewStatus(row.status)}</h4>
    <p>Received rating: {row.overall}/5</p>{row.comment ? <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{row.comment}</p> : null}
    <p><strong>Reason for review</strong></p><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{row.reason}</p>
    <small>Trip {row.bookingId} · {new Date(row.submittedAt).toLocaleString()}</small>
    {row.status === "submitted" ? <form className="form-grid" onSubmit={(event) => void save(event)}>
      <label>Decision<select required value={decision} disabled={busy || !canManage} onChange={(event) => setDecision(event.target.value)}><option value="">Choose a decision</option><option value="upheld">Keep rating</option><option value="removed">Remove rating</option></select></label>
      <label className="wide">Explanation to requester<textarea required minLength={5} maxLength={1000} rows={3} value={notes} disabled={busy || !canManage} onChange={(event) => setNotes(event.target.value)} /></label>
      {error ? <p role="alert">{error}</p> : null}<button type="submit" disabled={busy || !canManage || !decision || notes.trim().length<5}>{busy ? "Saving…" : "Save rating decision"}</button>
    </form> : <p><strong>Admin decision:</strong> {row.resolutionNotes}</p>}
  </article>;
}
