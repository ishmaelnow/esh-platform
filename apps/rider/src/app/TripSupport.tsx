"use client";
import { useEffect, useRef, useState } from "react";
import { createRiderSupportController, supportCategoryLabel, supportStatusLabel,
  type PlatformSupabaseClient, type SupportCategory, type SupportState } from "@esh-platform/supabase";

export function TripSupport({ client, bookingId }: { client: PlatformSupabaseClient; bookingId: string }) {
  const [open, setOpen] = useState(false);
  return <details className="trip-support" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Get help</summary>
    {open ? <SupportForm key={bookingId} client={client} bookingId={bookingId} /> : null}
  </details>;
}
function SupportForm({ client, bookingId }: { client: PlatformSupabaseClient; bookingId: string }) {
  const [state, setState] = useState<SupportState>({ cases: [], loading: true, sending: false, ready: false, error: "", message: "" });
  const [category, setCategory] = useState<SupportCategory>("trip_issue");
  const [description, setDescription] = useState("");
  const model = useRef<ReturnType<typeof createRiderSupportController> | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const controller = createRiderSupportController(client, bookingId, setState);
    model.current = controller;
    void controller.refresh();
    const refresh = () => { if (document.visibilityState === "visible") void controller.refresh(); };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { mounted.current = false; controller.stop(); model.current = null;
      window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [client, bookingId]);
  const available = (["trip_issue", "lost_item"] as const).filter((item) => !state.cases.some((report) => report.category === item));
  const selected = available.includes(category) ? category : available[0];
  return <div className="trip-support-content">
    <p>Report a trip issue or a lost item to your transportation company. This is not an emergency service. For immediate danger, contact local emergency services.</p>
    <p>Reports are private to you and authorized company staff. Do not include payment details or identity documents. Check here for responses; no automatic email, SMS, or device alert is sent.</p>
    <button className="button secondary compact" type="button" disabled={state.loading || state.sending} onClick={() => void model.current?.refresh()}>Refresh reports</button>
    {state.loading ? <p role="status">Loading reports…</p> : null}
    {state.error ? <p role="alert" className="error">{state.error}</p> : null}
    {state.message ? <p role="status">{state.message}</p> : null}
    {state.cases.map((report) => <article className="support-report" key={report.caseId}>
      <h4>{supportCategoryLabel(report.category)} · {supportStatusLabel(report.status)}</h4>
      <p className="support-text">{report.description}</p>
      <small>Reference {report.caseId.slice(0, 8)} · {new Date(report.createdAt).toLocaleString()}</small>
      {report.updates.map((update, index) => <div key={index}><strong>Company response · {supportStatusLabel(update.status)}</strong>
        <p className="support-text">{update.response}</p><time>{new Date(update.createdAt).toLocaleString()}</time></div>)}
      {!report.updates.length ? <p>Awaiting a response from your transportation company.</p> : null}
    </article>)}
    {selected ? <form onSubmit={(event) => { event.preventDefault(); const controller = model.current;
      if (controller) void controller.send(selected, description).then((sent) => { if (sent && mounted.current) setDescription(""); }); }}>
      <label>Report type<select value={selected} disabled={state.sending} onChange={(event) => setCategory(event.target.value as SupportCategory)}>
        {available.map((value) => <option value={value} key={value}>{supportCategoryLabel(value)}</option>)}
      </select></label>
      <label>{selected === "lost_item" ? "What did you leave behind?" : "How can we help?"}
        <textarea rows={4} required minLength={10} maxLength={2000} value={description} disabled={state.sending}
          onChange={(event) => setDescription(event.target.value)} /></label>
      <button className="button primary" type="submit" disabled={!state.ready || state.loading || state.sending || description.trim().length < 10}>
        {state.sending ? "Submitting…" : "Submit report"}</button>
    </form> : <p>Both report types have been submitted for this trip.</p>}
  </div>;
}
