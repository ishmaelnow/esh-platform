"use client";
import { useEffect, useState } from "react";
import type { PlatformSupabaseClient } from "@esh-platform/supabase";
import { DriverTripSupport } from "./DriverTripSupport";
type Trip = { bookingId: string; pickupAddress: string; destinationAddress: string; status: string; finishedAt: string };
export function DriverSupportHistory({ client, earnings }: { client: PlatformSupabaseClient; earnings: Record<string, string> }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    setTrips([]); setLoading(true); setError("");
    void Promise.resolve(client.rpc("my_driver_support_trips")).then(({ data, error: failed }) => {
      if (!alive) return;
      if (failed || !Array.isArray(data) || data.some((trip) => !trip || typeof trip !== "object" || Array.isArray(trip)
        || !["bookingId", "pickupAddress", "destinationAddress", "finishedAt"].every((key) => typeof trip[key] === "string")
        || typeof trip.status !== "string" || !["completed", "cancelled"].includes(trip.status))) throw new Error("History unavailable");
      setTrips(data as Trip[]);
    }).catch(() => { if (alive) setError("Recent orders could not be loaded. Check your connection and refresh."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [client, refresh]);
  return <>
    <p className="document-help">Your latest 50 completed or cancelled orders. Current assignments are in Dispatch.</p>
    <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh orders</button>
    {loading ? <p role="status">Loading recent orders…</p> : error ? <p role="alert">{error}</p> : !trips.length ? <p>No completed or cancelled orders yet.</p> : null}
    {trips.map((trip) => <article className="document-card" key={trip.bookingId}>
      <strong>{trip.pickupAddress}</strong><span>To {trip.destinationAddress}</span>
      <span>{trip.status === "completed" ? "Completed" : "Cancelled · Booked"} · {new Date(trip.finishedAt).toLocaleString()}</span>
      {earnings[trip.bookingId] ? <span>{earnings[trip.bookingId]} recorded earnings</span> : null}
      <DriverTripSupport client={client} bookingId={trip.bookingId} />
    </article>)}
  </>;
}
