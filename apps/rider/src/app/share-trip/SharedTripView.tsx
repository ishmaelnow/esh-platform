"use client";
import { useEffect, useState } from "react";
import { RiderHomeMap } from "@esh-platform/maps/client";
import { readSharedTrip, shareTokenPattern, type SharedTrip } from "../../lib/trip-share";

export function SharedTripView() {
  const [trip, setTrip] = useState<SharedTrip | null>(null), [message, setMessage] = useState("Loading shared trip…"), [now, setNow] = useState(Date.now());
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!token || !shareTokenPattern.test(token)) { setMessage("This trip link is unavailable."); return; }
    let alive = true, request: AbortController | null = null, ended = false;
    const refresh = async () => {
      request?.abort();
      if (ended || document.visibilityState !== "visible" || !navigator.onLine) { setTrip(null); return; }
      const controller = new AbortController(); request = controller;
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch("/api/trips/shared", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }), cache: "no-store", signal: controller.signal });
        if (response.status === 404) { ended = true; throw new Error("ended"); }
        if (!response.ok) throw new Error("Unavailable");
        const data = readSharedTrip(await response.json());
        if (!data) throw new Error("Unavailable");
        if (alive && !controller.signal.aborted) { setTrip(data); setMessage(""); }
      } catch { if (alive && request === controller) { setTrip(null); setMessage(ended ? "This trip link has ended, expired or been stopped." : "Trip updates are temporarily unavailable. Check your connection and retry."); } }
      finally { window.clearTimeout(timeout); }
    };
    const onRefresh = () => { void refresh(); };
    const tick = window.setInterval(() => { setNow(Date.now()); }, 1000);
    const timer = window.setInterval(onRefresh, 10_000);
    document.addEventListener("visibilitychange", onRefresh); window.addEventListener("online", onRefresh); window.addEventListener("offline", onRefresh);
    const onHash = () => window.location.reload();
    window.addEventListener("hashchange", onHash);
    void refresh();
    return () => { alive = false; request?.abort(); window.clearInterval(tick); window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onRefresh); window.removeEventListener("online", onRefresh); window.removeEventListener("offline", onRefresh); window.removeEventListener("hashchange", onHash); };
  }, []);
  const visible = trip && Date.parse(trip.expiresAt) > now ? trip : null;
  const age = visible?.location ? now - Date.parse(visible.location.recordedAt) : Infinity;
  const location = age >= -30_000 && age <= 60_000 ? visible?.location : null;
  return <main className="shared-trip-page">
    <h1>ESH shared trip</h1>
    <p>Private, temporary trip updates. This is not an emergency service.</p>
    <div role="status">{visible ? <h2>{visible.status === "accepted" ? "Driver heading to pickup" : visible.status === "arrived" ? "Driver has arrived" : "Trip underway"}</h2> : <p>{message || "This trip link has expired."}</p>}</div>
    {visible ? <>
      <p>{location ? "Live shared driver location" : "Driver location is unavailable. Trip status will continue to update."}</p>
      {location ? <div className="shared-trip-map"><RiderHomeMap accessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}
        center={location} driver={{ latitude: location.latitude, longitude: location.longitude, label: "Shared driver location" }} /></div> : null}
      {location ? <p>Updated {new Date(location.recordedAt).toLocaleTimeString()}</p> : null}
      <p>Updates refresh while this page is open. Link expires {new Date(visible.expiresAt).toLocaleTimeString()}.</p>
    </> : null}
    <button className="button secondary" type="button" onClick={() => window.location.reload()}>Refresh trip</button>
  </main>;
}
