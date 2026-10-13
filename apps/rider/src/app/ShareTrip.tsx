"use client";
import { useEffect, useRef, useState } from "react";

export function ShareTrip({ bookingId, accessToken }: { bookingId: string; accessToken: string }) {
  const [active, setActive] = useState(false), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(""), [message, setMessage] = useState("");
  const current = useRef<AbortController | null>(null);
  async function request(method: "GET" | "POST" | "DELETE") {
    current.current?.abort();
    const controller = new AbortController(); current.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`/api/trips/share${method === "GET" ? `?bookingId=${encodeURIComponent(bookingId)}` : ""}`, {
        method, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, cache: "no-store",
        ...(method !== "GET" ? { body: JSON.stringify({ bookingId }) } : {}), signal: controller.signal,
      });
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json() as { active: boolean; token?: string };
      if (controller.signal.aborted) return;
      if (typeof data.active !== "boolean") throw new Error("Unavailable");
      setActive(data.active); setReady(true);
      if (!data.active) setUrl("");
      if (method === "POST" && data.token) setUrl(`${window.location.origin}/share-trip#token=${data.token}`);
      if (method === "DELETE") setMessage("Trip link stopped.");
      return data;
    } catch {
      if (current.current === controller) setMessage("Sharing could not be refreshed. Check your connection and try again.");
    } finally { window.clearTimeout(timeout); if (current.current === controller) setBusy(false); }
  }
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible" && navigator.onLine && !current.current?.signal.aborted) void request("GET"); };
    void request("GET");
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh); window.addEventListener("online", refresh);
    return () => { current.current?.abort(); current.current = null; window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh); window.removeEventListener("online", refresh); };
    // Requests are scoped by the parent's account/booking key and current access token.
  }, [bookingId, accessToken]);
  async function sendLink() {
    try {
      if (navigator.share) await navigator.share({ title: "ESH trip", text: "Follow my active trip", url });
      else { await navigator.clipboard.writeText(url); setMessage("Trip link copied. Send it to someone you trust."); }
    } catch { setMessage("Sharing was not completed. You can copy the link below."); }
  }
  return <section className="share-trip" aria-label="Share my trip">
    <details><summary>Share my trip</summary><div className="share-trip-content">
    <p>Anyone with this link can see trip status and your driver’s fresh shared location. Send it only to someone you trust. It stops when the trip ends or after four hours.</p>
    <p>{active ? "Trip link is active." : ready ? "Trip sharing is off." : "Checking trip sharing…"}</p>
    <div className="share-trip-actions">
      <button className="button secondary compact" type="button" disabled={busy} onClick={() => { setBusy(true); setMessage(""); void request("POST"); }}>{busy ? "Updating…" : active ? "Create replacement link" : "Create trip link"}</button>
      {active ? <button className="button secondary compact" type="button" disabled={busy} onClick={() => { setBusy(true); void request("DELETE"); }}>Stop sharing trip</button> : null}
      {url ? <button className="button primary compact" type="button" disabled={busy || !active} onClick={() => void sendLink()}>Share trip link</button> : null}
    </div>
    {active && !url ? <p>Your link is active on another session. Creating a replacement stops the previous link.</p> : null}
    {url && active ? <label>Copy trip link<input readOnly value={url} onFocus={(event) => event.currentTarget.select()} /></label> : null}
    {message ? <p role="status">{message}</p> : null}
    </div></details>
  </section>;
}
