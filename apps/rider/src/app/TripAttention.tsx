"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createTripAttentionController, type PlatformSupabaseClient, type TripAttentionState } from "@esh-platform/supabase";

type Model = ReturnType<typeof createTripAttentionController>;
const Attention = createContext<{ state: TripAttentionState; mark: Model["mark"] }>({
  state: { items: [], error: "" }, mark: async () => { await Promise.resolve(); },
});
export function TripAttentionProvider({ client, tenantId = null, children }: {
  client: PlatformSupabaseClient | null; tenantId?: string | null; children: ReactNode;
}) {
  const [state, setState] = useState<TripAttentionState>({ items: [], error: "" });
  const model = useRef<Model | null>(null);
  useEffect(() => {
    if (!client) return;
    const controller = createTripAttentionController(client, "rider", tenantId, setState);
    model.current = controller;
    const refresh = () => { if (document.visibilityState === "visible" && navigator.onLine) void controller.refresh(); };
    refresh();
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("online", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { controller.stop(); model.current = null; window.clearInterval(interval);
      window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [client, tenantId]);
  const mark = useCallback<Model["mark"]>(async (booking, target) => { await model.current?.mark(booking, target); }, []);
  return <Attention.Provider value={{ state, mark }}>{children}</Attention.Provider>;
}
export function AttentionBadge({ kind, bookingId, itemId }: { kind?: "messages" | "support"; bookingId?: string; itemId?: string }) {
  const { state } = useContext(Attention);
  const count = state.items.filter((item) => (!kind || item.kind === kind) && (!bookingId || item.bookingId === bookingId)
    && (!itemId || item.itemId === itemId)).reduce((total, item) => total + item.count, 0);
  return count ? <span className="trip-unread-badge" aria-label={`${count} unread update${count === 1 ? "" : "s"}`}>{count > 99 ? "99+" : count}</span> : null;
}
// Acknowledges this rendered item only after it enters the visible viewport.
export function AttentionSeen({ bookingId, messageId, caseId, version }: {
  bookingId: string; messageId?: string; caseId?: string; version?: number;
}) {
  const { mark } = useContext(Attention);
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!marker.current || typeof IntersectionObserver === "undefined") return;
    let viewed = false, intersects = false;
    const read = () => {
      if (viewed || !intersects || document.visibilityState !== "visible" || !navigator.onLine) return;
      if (messageId) { viewed = true; void mark(bookingId, { messages: [messageId] }); }
      else if (caseId && version && version > 1) { viewed = true; void mark(bookingId, { caseId, version }); }
    };
    const observer = new IntersectionObserver(([entry]) => { intersects = Boolean(entry?.isIntersecting); read(); });
    observer.observe(marker.current);
    document.addEventListener("visibilitychange", read); window.addEventListener("online", read);
    return () => { viewed = true; observer.disconnect(); document.removeEventListener("visibilitychange", read); window.removeEventListener("online", read); };
  }, [bookingId, messageId, caseId, version, mark]);
  return <span ref={marker} className="trip-read-marker" aria-hidden="true" />;
}
export function AttentionNotice() {
  const { state } = useContext(Attention);
  return state.error ? <p className="trip-unread-notice" role="status">{state.error}</p> : null;
}
export function SupportUpdates({ onOpen }: { onOpen: (bookingId: string, caseId: string) => void }) {
  const { state } = useContext(Attention);
  const items = state.items.filter((item) => item.kind === "support");
  return <><AttentionNotice />
    {items.length ? <section className="trip-unread-updates" aria-label="Unread support responses"><strong>Company responses</strong>
      {items.map((item) => <button type="button" key={item.itemId} onClick={() => onOpen(item.bookingId, item.itemId)}>
        View response · {item.itemId.slice(0, 8)} <AttentionBadge kind="support" itemId={item.itemId} />
      </button>)}</section> : null}</>;
}
