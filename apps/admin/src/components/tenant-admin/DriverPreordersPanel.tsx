"use client";
import { useEffect, useState } from "react";
import { createAdminBrowserClient } from "@/lib/browser-client";

type Reservation = { bookingId: string; driverName: string; status: string; reason: string | null; reservedAt: string };
export function DriverPreordersPanel({ tenantId, userId }: { tenantId: string; userId: string }) {
  const [rows, setRows] = useState<Reservation[] | null>(null);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setRows(null); setError(false);
    const load = async () => {
      const result = await createAdminBrowserClient().rpc("admin_driver_preorders", { tenant_value: tenantId });
      if (!active) return;
      if (result.error || !Array.isArray(result.data)) { setError(true); return; }
      setRows(result.data as unknown as Reservation[]); setError(false);
    };
    void load().catch(() => { if (active) setError(true); });
    const interval = window.setInterval(() => { void load().catch(() => { if (active) setError(true); }); }, 15_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [tenantId, userId, refresh]);
  return <section className="panel">
    <h3>Driver preorders</h3>
    <p>Advance reservations leave the Rider booking scheduled. The reserved Driver must be online and eligible at dispatch time, then confirm the normal timed offer.</p>
    <button className="secondary-button" type="button" onClick={() => setRefresh((value) => value + 1)}>Refresh preorders</button>
    {error ? <p className="form-error" role="alert">Preorder history unavailable. Refresh to retry; existing rows may be out of date.</p>
      : rows === null ? <p>Loading reservations…</p> : rows.length === 0 ? <p>No preorder reservations.</p> : null}
    {rows?.map((row) => <article className="data-card" key={`${row.bookingId}:${row.reservedAt}`}>
      <strong>{row.driverName}</strong><p>Booking {row.bookingId.slice(0, 8)} · {row.status}</p>
      {row.reason ? <p>{row.reason}</p> : null}
    </article>)}
  </section>;
}
