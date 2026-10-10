"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { readSupportCases, supportCategoryLabel, supportStatusLabel, type SupportCase, type SupportStatus } from "@esh-platform/supabase";
import { createAdminBrowserClient } from "@/lib/browser-client";

export function TripSupportPanel({ tenantId, userId, canManage }: { tenantId: string; userId: string; canManage: boolean }) {
  const [rows, setRows] = useState<SupportCase[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("all");
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setRows([]); setTotal(0); setLoading(true); setError("");
    async function load() {
      try {
        const result = await createAdminBrowserClient().rpc("admin_trip_support", { tenant_value: tenantId, status_value: filter, offset_value: offset });
        if (!active) return;
        if (result.error || !result.data || typeof result.data !== "object" || Array.isArray(result.data)) throw new Error("Support queue unavailable");
        const value = result.data;
        if (typeof value.total !== "number" || !Number.isInteger(value.total) || value.total < 0) throw new Error("Invalid queue");
        setRows(readSupportCases(value.cases)); setTotal(value.total);
      } catch { if (active) setError("Support reports could not be loaded. Check your connection and refresh."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [tenantId, userId, filter, offset, refresh]);
  return <section className="panel-stack">
    <header className="panel-header"><h2>Trip support</h2><p>Review Rider trip issues and lost items. Replies below are visible to the Rider. This queue does not process refunds or notify Drivers.</p></header>
    <div className="button-row">
      <label>Report status<select value={filter} onChange={(event) => { setFilter(event.target.value); setOffset(0); }}>
        <option value="all">All reports</option>{(["open", "in_review", "resolved"] as const).map((value) => <option value={value} key={value}>{supportStatusLabel(value)}</option>)}
      </select></label>
      <button className="secondary-button" disabled={loading} type="button" onClick={() => setRefresh((value) => value + 1)}>Refresh reports</button>
    </div>
    {loading ? <p role="status">Loading reports…</p> : error ? <p className="form-error" role="alert">{error}</p>
      : rows.length === 0 ? <p>No reports in this view.</p> : <p>{total} reports · showing {offset + 1}–{Math.min(offset + rows.length, total)}</p>}
    {rows.map((report) => <ReviewCard key={`${userId}:${tenantId}:${report.caseId}:${report.version}`} report={report} canManage={canManage}
      onSaved={() => setRefresh((value) => value + 1)} />)}
    <div className="button-row">
      <button className="secondary-button" type="button" disabled={loading || offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 50))}>Previous reports</button>
      <button className="secondary-button" type="button" disabled={loading || !!error || offset + 50 >= total} onClick={() => setOffset((value) => value + 50)}>Next reports</button>
    </div>
  </section>;
}
function ReviewCard({ report, canManage, onSaved }: { report: SupportCase; canManage: boolean; onSaved: () => void }) {
  const [status, setStatus] = useState<SupportStatus>(report.status);
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !canManage) return;
    setBusy(true); setError("");
    try {
      const result = await createAdminBrowserClient().rpc("review_trip_support", {
        case_value: report.caseId, status_value: status, response_value: response.trim(), version_value: report.version,
      });
      if (!alive.current) return;
      if (result.error || result.data !== true) throw new Error("Support review unavailable");
      onSaved();
    } catch { if (alive.current) setError("The update could not be confirmed. Refresh to check for another review, or retry the same response."); }
    finally { if (alive.current) setBusy(false); }
  }
  return <article className="panel support-review">
    <h3>{supportCategoryLabel(report.category)} · {supportStatusLabel(report.status)}</h3>
    <p><strong>{report.riderName}</strong> · Reference {report.caseId.slice(0, 8)}</p>
    <p>{report.pickupAddress} → {report.destinationAddress}</p>
    <small>Booking {report.bookingId} · submitted {new Date(report.createdAt).toLocaleString()}</small>
    <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{report.description}</p>
    {report.updates.map((update, index) => <div key={index}><strong>{supportStatusLabel(update.status)} · {new Date(update.createdAt).toLocaleString()}</strong>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{update.response}</p></div>)}
    <form className="form-grid" onSubmit={(event) => void save(event)}>
      <label>Status<select value={status} disabled={busy || !canManage} onChange={(event) => setStatus(event.target.value as SupportStatus)}>
        {(["open", "in_review", "resolved"] as const).map((value) => <option value={value} key={value}>{supportStatusLabel(value)}</option>)}
      </select></label>
      <label className="wide">Reply to Rider<textarea required maxLength={2000} rows={3} value={response} disabled={busy || !canManage}
        onChange={(event) => setResponse(event.target.value)} /></label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button disabled={busy || !canManage || !response.trim()} type="submit">{busy ? "Saving…" : "Save response"}</button>
    </form>
  </article>;
}
