"use client";
import { useEffect, useRef, useState } from "react";
import { createTripMessageController, type TripMessageState, type PlatformSupabaseClient } from "@esh-platform/supabase";

// Product presentation stays local; privacy, retries and transport are shared.
export function TripMessages({ client, bookingId, role }: { client: PlatformSupabaseClient; bookingId: string; role: "rider" | "driver" }) {
  const [open, setOpen] = useState(false);
  return <details className="trip-messages" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Trip messages</summary>
    {open ? <Conversation key={bookingId + role} client={client} bookingId={bookingId} role={role} /> : null}
  </details>;
}
function Conversation({ client, bookingId, role }: { client: PlatformSupabaseClient; bookingId: string; role: "rider" | "driver" }) {
  const [state, setState] = useState<TripMessageState>({ messages: [], loading: true, sending: false, error: null, draft: "" });
  const controller = useRef<ReturnType<typeof createTripMessageController> | null>(null);
  useEffect(() => {
    const model = createTripMessageController(client, bookingId, role, setState);
    controller.current = model;
    void model.refresh();
    const refresh = () => { if (document.visibilityState === "visible") void model.refresh(); };
    const interval = window.setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => { model.stop(); controller.current = null; window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("online", refresh); };
  }, [client, bookingId, role]);
  return <div>
    <p>Private to you and your {role === "rider" ? "assigned Driver" : "Rider"} during this ride. Messages are removed when the trip or assignment ends. Drivers: reply only when safely stopped.</p>
    <button type="button" className="secondary" onClick={() => { void controller.current?.refresh(); }}>Refresh messages</button>
    {state.loading ? <p role="status">Loading messages...</p> : null}
    {state.error ? <p role="alert">{state.error}</p> : null}
    <ol className="trip-message-list" aria-label="Trip conversation">
      {state.messages.map((message) => <li key={message.messageId} className={message.senderRole === role ? "is-own" : ""}>
        <strong>{message.senderRole === role ? "You" : role === "rider" ? "Driver" : "Rider"}</strong>
        <p>{message.body}</p><time dateTime={message.sentAt}>{new Date(message.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
      </li>)}
    </ol>
    {!state.loading && !state.error && state.messages.length === 0 ? <p>No messages yet.</p> : null}
    {state.messages.length === 100 ? <p>Showing the latest 100 messages.</p> : null}
    <form onSubmit={(event) => { event.preventDefault(); void controller.current?.send(); }}>
      <label>Message<textarea aria-label="Trip message" maxLength={1000} rows={2} value={state.draft} disabled={state.sending}
        onChange={(event) => controller.current?.draft(event.target.value)} /></label>
      <button className="primary" type="submit" disabled={state.loading || state.sending || !state.draft.trim()}>{state.sending ? "Sending..." : "Send message"}</button>
    </form>
  </div>;
}
