"use client";

import { useCallback, useEffect, useState } from "react";

export function ApplicationInsurance({ accessToken, tenantId, applicationId, vehicleId, vehicleLabel, canManage, onOpen, onRefresh }: {
  accessToken: string; tenantId: string; applicationId: string; vehicleId: string | null;
  vehicleLabel: string | null; canManage: boolean; onOpen: (url: string) => void; onRefresh: () => void;
}) {
  const [insurance, setInsurance] = useState<{ fileName: string; linked: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const path = `/api/tenant-admin/drivers/application-insurance?tenantId=${tenantId}&applicationId=${applicationId}`;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(path, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      const result = await response.json() as { insurance?: { fileName: string; linked: boolean } | null; message?: string };
      if (!response.ok) throw new Error(result.message ?? "Unable to load insurance.");
      setInsurance(result.insurance ?? null); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Insurance is unavailable."); }
    finally { setLoading(false); }
  }, [accessToken, path]);
  useEffect(() => { void load(); }, [load]);

  async function action(open: boolean) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(open ? `${path}&open=1` : path, {
        method: open ? "GET" : "POST", headers: { Authorization: `Bearer ${accessToken}`, ...(!open ? { "Content-Type": "application/json" } : {}) },
        ...(!open ? { body: JSON.stringify({ tenantId, applicationId, vehicleId }) } : {}),
      });
      const result = await response.json() as { url?: string; message?: string };
      if (!response.ok) throw new Error(result.message ?? "Insurance action failed.");
      if (open && result.url) onOpen(result.url);
      else { await load(); onRefresh(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Insurance action failed."); }
    finally { setBusy(false); }
  }

  return <div className="onboarding-checklist">
    <strong>Vehicle insurance document</strong>
    {loading ? <span>Checking insurance…</span> : insurance ? <>
      <span>{insurance.fileName}</span>
      <span>{insurance.linked ? "Linked to vehicle insurance review. Review in Vehicles; approval and expiration checks still apply." : "Received with application. Match this policy to the assigned vehicle before linking."}</span>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void action(true)}>Open insurance</button>
      {!insurance.linked ? <>
        <span>{vehicleLabel ? `Assigned vehicle: ${vehicleLabel}` : "Approve the application and assign its vehicle before linking insurance."}</span>
        <button type="button" className="secondary-button" disabled={busy || !canManage || !vehicleId} onClick={() => void action(false)}>{busy ? "Linking…" : "Link insurance to assigned vehicle"}</button>
      </> : null}
    </> : <span>{message ? "Insurance status unavailable." : "No application insurance uploaded. Existing vehicle insurance requirements still apply."}</span>}
    {message ? <span role="alert">{message}</span> : null}
    {message ? <button className="secondary-button" type="button" disabled={busy || loading} onClick={() => void load()}>Retry insurance status</button> : null}
  </div>;
}
