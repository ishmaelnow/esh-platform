"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { locationErrorMessage } from "../lib/location";

/** Map-only GPS never enables sharing or writes a coordinate to the server. */
export function useDriverMapLocation(scope: string | null) {
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recenterVersion, setRecenterVersion] = useState(0);
  const [watchGranted, setWatchGranted] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setLocation(null); setNotice(null); setWatchGranted(false); setBusy(false);
    if (!scope) return;
    let active = true;
    let permission: PermissionStatus | undefined;
    const update = () => {
      if (!active || !permission) return;
      setWatchGranted(permission.state === "granted");
      if (permission.state === "denied") { setLocation(null); setNotice("Location permission is blocked. Allow location in device settings; your operating area is shown instead."); }
    };
    void navigator.permissions?.query({ name: "geolocation" }).then((result) => {
      if (!active) return;
      permission = result; update(); permission.addEventListener("change", update);
    }).catch(() => { /* Explicit locate still works when permission queries are unsupported. */ });
    return () => { active = false; generation.current++; permission?.removeEventListener("change", update); };
  }, [scope]);
  useEffect(() => {
    if (!scope || !watchGranted || !navigator.geolocation) return;
    let watch: number | undefined;
    const stop = () => { if (watch !== undefined) navigator.geolocation.clearWatch(watch); watch = undefined; };
    const start = () => {
      stop();
      if (document.hidden) return;
      watch = navigator.geolocation.watchPosition((position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }); setNotice(null);
      }, (error) => { setLocation(null); setNotice(locationErrorMessage(error)); }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
    };
    start(); document.addEventListener("visibilitychange", start);
    return () => { stop(); document.removeEventListener("visibilitychange", start); };
  }, [scope, watchGranted]);
  const locate = useCallback(() => {
    if (!scope) return;
    if (!navigator.geolocation) { setNotice("Location is unavailable on this device. Your operating area is shown instead."); return; }
    const current = generation.current;
    setBusy(true); setNotice("Finding your location…");
    navigator.geolocation.getCurrentPosition((position) => {
      if (current !== generation.current) return;
      setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
      setWatchGranted(true); setRecenterVersion((value) => value + 1); setNotice(null); setBusy(false);
    }, (error) => { if (current !== generation.current) return; setLocation(null); setNotice(`${locationErrorMessage(error)} Your operating area remains available.`); setBusy(false); },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }, [scope]);
  return { location, notice, busy, recenterVersion, locate };
}
