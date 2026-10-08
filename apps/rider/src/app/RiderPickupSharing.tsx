"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { validCoordinates } from "@esh-platform/maps";
import type { PlatformSupabaseClient } from "@esh-platform/supabase";

export function RiderPickupSharing({ client, bookingId }: { client: PlatformSupabaseClient; bookingId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  const generation = useRef(0);
  useEffect(() => {
    let disposed = false;
    void client.rpc("my_rider_pickup_sharing", { target_booking_id: bookingId }).then((result) => {
      if (!disposed) { setEnabled(typeof result.data === "boolean" && !result.error ? result.data : null);
        if (result.error) setNotice("Sharing status unavailable. Try again."); }
    });
    const listener = Capacitor.isNativePlatform() ? App.addListener("appStateChange", ({ isActive }) => { active.current = isActive; }) : null;
    if (Capacitor.isNativePlatform()) void App.getState().then(({ isActive }) => { if (!disposed) active.current = isActive; });
    return () => { disposed = true; ++generation.current; if (listener) void listener.then((value) => value.remove()); };
  }, [client, bookingId]);
  const publish = useCallback(async (request: number) => {
    if (request !== generation.current || document.hidden || !active.current) return;
    const point = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 12000 });
    if (request !== generation.current || document.hidden || !active.current) return;
    if (!validCoordinates(point.coords.latitude, point.coords.longitude) || !Number.isFinite(point.timestamp)
      || !Number.isFinite(point.coords.accuracy) || point.coords.accuracy < 0) throw new Error("Valid location unavailable");
    const result = await client.rpc("update_my_rider_pickup_location", { target_booking_id: bookingId,
      latitude_value: point.coords.latitude, longitude_value: point.coords.longitude,
      accuracy_meters_value: point.coords.accuracy, recorded_at_value: new Date(point.timestamp).toISOString() });
    if (result.error) {
      const consent = await client.rpc("my_rider_pickup_sharing", { target_booking_id: bookingId });
      if (request === generation.current && !consent.error && consent.data === false) setEnabled(false);
      throw new Error("Location update failed");
    }
    if (request === generation.current) setNotice("Sharing while this app is open. Stops when the trip starts.");
  }, [client, bookingId]);
  useEffect(() => {
    if (!enabled) return;
    const request = generation.current;
    let running = false;
    const update = async () => {
      if (running) return;
      running = true;
      try { await publish(request); } catch {
        if (request === generation.current) setNotice("Location update unavailable. Your driver will not see an outdated live position.");
      } finally { running = false; }
    };
    void update();
    const timer = window.setInterval(() => void update(), 10000);
    return () => { window.clearInterval(timer); ++generation.current; };
    // The generation guards pending GPS work when sharing stops or this trip leaves the screen.
  }, [enabled, bookingId, client, publish]);
  const change = async () => {
    if (busy) return;
    setBusy(true); setNotice("");
    ++generation.current;
    try {
      if (enabled === null) {
        const result = await client.rpc("my_rider_pickup_sharing", { target_booking_id: bookingId });
        if (result.error || typeof result.data !== "boolean") throw new Error();
        setEnabled(result.data); return;
      }
      if (!enabled && Capacitor.isNativePlatform()) {
        const permission = await Geolocation.requestPermissions();
        if (permission.location !== "granted" && permission.coarseLocation !== "granted") throw new Error();
      }
      const result = await client.rpc("set_my_rider_pickup_sharing", { target_booking_id: bookingId, enabled_value: !enabled });
      if (result.error || typeof result.data !== "boolean") throw new Error();
      setEnabled(result.data);
      if (!result.data) setNotice("Location sharing is off.");
    } catch { setNotice("Could not change sharing. Check location permission and connection, then try again."); }
    finally { setBusy(false); }
  };
  return <div className="rider-pickup-sharing">
    <p>Optional: only your assigned driver can see your current position before pickup. Your pickup address stays the same.</p>
    <button className="button secondary" type="button" disabled={busy} aria-pressed={enabled === null ? undefined : enabled} onClick={() => void change()}>
      {busy ? "Updating sharing…" : enabled === null ? "Refresh location sharing" : enabled ? "Stop sharing my location" : "Share my location with my driver"}
    </button>
    {notice ? <p role="status">{notice}</p> : null}
  </div>;
}
