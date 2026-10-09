"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlatformSupabaseClient } from "@esh-platform/supabase";

export type Preorder = {
  bookingId: string; reservationId?: string; scheduledPickupAt: string; dispatchReadyAt: string;
  serviceAreaName: string; pickupAddress?: string; destinationAddress?: string;
  fareAmountMinor: number | null; fareCurrencyCode: string | null;
};
export type Preorders = {
  receiveWhileOffline: boolean; timeZone: string | null; assignedCount: number; newCount: number;
  assigned: Preorder[]; new: Preorder[];
};
export function readPreorders(value: unknown): Preorders {
  if (!value || typeof value !== "object") throw new Error("Preorders unavailable.");
  const data = value as Preorders;
  if (typeof data.receiveWhileOffline !== "boolean" || !Number.isInteger(data.assignedCount) || data.assignedCount < 0
    || !Number.isInteger(data.newCount) || data.newCount < 0 || !Array.isArray(data.assigned) || !Array.isArray(data.new)
    || [...data.assigned, ...data.new].some((item) => !item || typeof item.bookingId !== "string"
      || typeof item.serviceAreaName !== "string" || !Number.isFinite(Date.parse(item.scheduledPickupAt))
      || !Number.isFinite(Date.parse(item.dispatchReadyAt))
      || (item.fareAmountMinor !== null && (!Number.isSafeInteger(item.fareAmountMinor) || item.fareAmountMinor < 0))
      || (item.fareCurrencyCode !== null && !/^[A-Z]{3}$/.test(item.fareCurrencyCode)))) throw new Error("Preorders unavailable.");
  if (data.timeZone !== null && typeof data.timeZone !== "string") throw new Error("Preorders unavailable.");
  new Intl.DateTimeFormat(undefined, { ...(data.timeZone ? { timeZone: data.timeZone } : {}) });
  return data;
}
export function preorderTime(value: string, timeZone: string | null) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZoneName: "short", ...(timeZone ? { timeZone } : {}) }).format(new Date(value));
}
export function useDriverPreorders(client: PlatformSupabaseClient | null, owner: string | null) {
  const [data, setData] = useState<Preorders | null>(null);
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scope = useRef(owner); scope.current = owner;
  const requests = useRef(0);
  const mutation = useRef(false);
  const epoch = useRef(0);
  const refresh = useCallback(async () => {
    if (!client || !owner || mutation.current) return;
    const request = ++requests.current;
    try {
      const result = await client.rpc("my_driver_preorders");
      if (scope.current !== owner || request !== requests.current) return;
      if (result.error) throw result.error;
      setData(readPreorders(result.data)); setLoadedOwner(owner); setError(null);
    } catch {
      if (scope.current === owner && request === requests.current) {
        setError("Preorders could not be refreshed. Check your connection and try again.");
      }
    }
  }, [client, owner]);
  useEffect(() => {
    setData(null); setLoadedOwner(null); setError(null); setMessage(null); setBusy(false); mutation.current = false;
    void refresh();
    const resume = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", resume);
    const interval = window.setInterval(resume, 15_000);
    return () => { requests.current++; epoch.current++; window.clearInterval(interval); document.removeEventListener("visibilitychange", resume); };
  }, [refresh]);
  const act = async (action: "reserve" | "release" | "offline", value: string | boolean) => {
    if (!client || !owner || mutation.current) return;
    const operationEpoch = epoch.current;
    mutation.current = true; requests.current++; setBusy(true); setMessage(null);
    try {
      const result = action === "offline"
        ? await client.rpc("set_my_driver_preorder_settings", { enabled_value: value as boolean })
        : action === "reserve"
          ? await client.rpc("reserve_my_driver_preorder", { booking_value: value as string })
          : await client.rpc("release_my_driver_preorder", { booking_value: value as string });
      if (scope.current !== owner || epoch.current !== operationEpoch) return;
      if (result.error) throw result.error;
      setMessage(action === "reserve" ? "Preorder reserved. Be online before its dispatch time."
        : action === "release" ? "Reservation released. The Rider's booking remains scheduled."
          : "Offline preorder alert preference saved. Your availability is unchanged.");
    } catch (failure) {
      if (scope.current === owner && epoch.current === operationEpoch) setMessage(failure && typeof failure === "object" && "message" in failure
        ? String(failure.message) : "The change could not be confirmed. Refresh before trying again.");
    } finally {
      if (scope.current === owner && epoch.current === operationEpoch) { mutation.current = false; setBusy(false); await refresh(); }
    }
  };
  return { data: loadedOwner === owner ? data : null, error, message, busy, refresh, act };
}

export function DriverPreorders({ model, onDispatch }: {
  model: ReturnType<typeof useDriverPreorders>; onDispatch: () => void;
}) {
  const [tab, setTab] = useState<"assigned" | "new">("assigned");
  const { data, error, message, busy } = model;
  const cards = data?.[tab] ?? [];
  return <>
    <label className="preorder-setting">Receive while offline<input type="checkbox" role="switch"
      checked={data?.receiveWhileOffline ?? false} disabled={!data || busy || Boolean(error)}
      onChange={(event) => { void model.act("offline", event.target.checked); }} aria-describedby="preorder-offline-help" /></label>
    <p className="preorder-help" id="preorder-offline-help">Receive new preorder alerts while Offline. Device alerts or email must also be enabled. Your availability stays unchanged.</p>
    <div className="preorder-tabs" role="tablist" aria-label="Preorders">
      {([['assigned', 'Assigned to me', data?.assignedCount], ['new', 'New', data?.newCount]] as const).map(([id, label, count]) =>
        <button type="button" role="tab" aria-selected={tab === id} aria-controls="preorder-content" id={`preorder-${id}`}
          key={id} onClick={() => setTab(id)}>{label} <span>{count ?? "—"}</span></button>)}
    </div>
    <button className="secondary preorder-refresh" type="button" disabled={busy} onClick={() => { void model.refresh(); }}>Refresh preorders</button>
    {message ? <p className="upload-message" role="status">{message}</p> : null}
    {error ? <p className="upload-message" role="alert">{error} Existing details may be out of date.</p> : null}
    <div id="preorder-content" role="tabpanel" aria-labelledby={`preorder-${tab}`} aria-busy={busy}>
      {!data ? <div className="preorder-empty"><h2>{error ? "Preorders unavailable" : "Loading preorders…"}</h2></div>
        : cards.length === 0 ? <div className="preorder-empty"><svg viewBox="0 0 80 64" aria-hidden="true"><rect x="12" y="8" width="48" height="36" rx="6" /><rect x="20" y="18" width="48" height="36" rx="6" /><path d="M30 30h28M30 40h18" /></svg>
          <h2>{tab === "assigned" ? "You don’t have any preorders" : "No available preorders"}</h2>
          <p>{tab === "new" ? "Eligible scheduled trips in your selected operating area will appear here." : "Reserve an available trip from New."}</p></div>
          : cards.map((card) => <article className="preorder-card" key={card.bookingId}>
            <h2>{preorderTime(card.scheduledPickupAt, data.timeZone)}</h2>
            <p>{card.serviceAreaName}</p>
            {tab === "assigned" ? <p><strong>Pickup:</strong> {card.pickupAddress}<br /><strong>Destination:</strong> {card.destinationAddress}</p>
              : <p>Exact addresses are available after reservation.</p>}
            <p>Trip fare: {card.fareAmountMinor === null || !card.fareCurrencyCode ? "Unavailable"
              : new Intl.NumberFormat(undefined, { style: "currency", currency: card.fareCurrencyCode }).format(card.fareAmountMinor / 100)}</p>
            <p>Be online by {preorderTime(card.dispatchReadyAt, data.timeZone)}. You must confirm the timed offer when dispatch starts.</p>
            <button type="button" className={tab === "assigned" ? "secondary" : "primary"}
              disabled={busy || Boolean(error)} onClick={() => { void model.act(tab === "assigned" ? "release" : "reserve", card.bookingId); }}>
              {busy ? "Saving…" : tab === "assigned" ? "Release reservation" : "Reserve trip"}</button>
          </article>)}
      {data && data[tab].length < (tab === "assigned" ? data.assignedCount : data.newCount)
        ? <p className="preorder-help">Showing the next 100 trips. More will appear as these leave the list.</p> : null}
    </div>
    <button className="secondary" type="button" onClick={onDispatch}>View current offers and trips</button>
  </>;
}
