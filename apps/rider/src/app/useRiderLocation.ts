"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { App } from "@capacitor/app";
import { validCoordinates } from "@esh-platform/maps";

type RiderPosition = { latitude: number; longitude: number; accuracy: number };

/** Foreground-only, in-memory position. No booking address changes or location writes. */
export function useRiderLocation(scope: string | null) {
  const [position, setPosition] = useState<RiderPosition | null>(null);
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const accept = useCallback((coords: RiderPosition) => {
    if (!validCoordinates(coords.latitude, coords.longitude) || !Number.isFinite(coords.accuracy) || coords.accuracy < 0)
      throw new Error("Your device returned an invalid location.");
    const next = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
    setPosition(next); setNotice("");
    return next;
  }, []);

  useEffect(() => {
    setTracking(false); setPosition(null); setNotice(""); setBusy(false);
    let cancelled = false;
    if (!scope) return;
    // Reuse an existing grant without opening a permission prompt on page load.
    void (async () => {
      try {
        const granted = Capacitor.isNativePlatform()
          ? await Geolocation.checkPermissions().then((p) => p.location === "granted" || p.coarseLocation === "granted")
          : await navigator.permissions?.query({ name: "geolocation" }).then((p) => p.state === "granted");
        if (!cancelled && granted) setTracking(true);
      } catch { /* Explicit location action remains available. */ }
    })();
    return () => { cancelled = true; };
  }, [scope]);

  const locate = useCallback(async () => {
    if (!scope) return null;
    setBusy(true); setNotice("");
    try {
      if (Capacitor.isNativePlatform()) {
        const permissions = await Geolocation.requestPermissions();
        if (permissions.location === "denied" && permissions.coarseLocation !== "granted") throw new Error("Location permission denied.");
      }
      const result = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 });
      if (currentScope.current !== scope) return null;
      const next = accept(result.coords);
      setTracking(true);
      return next;
    } catch {
      if (currentScope.current === scope) {
        setPosition(null); setTracking(false);
        setNotice("Location unavailable or permission denied. Showing your service area; enter your pickup address manually.");
      }
      return null;
    } finally { if (currentScope.current === scope) setBusy(false); }
  }, [scope, accept]);

  useEffect(() => {
    if (!scope || !tracking) return;
    let stop: (() => void) | undefined;
    let generation = 0;
    let nativeActive = true;
    let disposed = false;
    const refresh = () => {
      const watchGeneration = ++generation;
      stop?.(); stop = undefined;
      if (document.hidden || !nativeActive || disposed) return;
      const active = () => generation === watchGeneration && currentScope.current === scope;
      const fail = () => {
        if (!active()) return;
        setPosition(null); setTracking(false);
        setNotice("Location updates unavailable. Showing your service area; enter your pickup address manually.");
      };
      void Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 }, (update, error) => {
        if (!active()) return;
        if (error || !update) { fail(); return; }
        try { accept(update.coords); } catch { fail(); }
      }).then((id) => {
        if (!active()) void Geolocation.clearWatch({ id });
        else stop = () => { void Geolocation.clearWatch({ id }); };
      }).catch(fail);
    };
    refresh(); document.addEventListener("visibilitychange", refresh);
    const nativeListener = Capacitor.isNativePlatform() ? App.addListener("appStateChange", ({ isActive }) => {
      if (disposed) return;
      nativeActive = isActive; refresh();
    }) : null;
    if (Capacitor.isNativePlatform()) void App.getState().then(({ isActive }) => {
      if (!disposed && nativeActive !== isActive) { nativeActive = isActive; refresh(); }
    });
    return () => {
      disposed = true; ++generation; stop?.(); document.removeEventListener("visibilitychange", refresh);
      if (nativeListener) void nativeListener.then((listener) => listener.remove());
    };
  }, [scope, tracking, accept]);

  return { position, locate, busy, notice };
}
