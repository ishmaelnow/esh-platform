"use client";

import { useEffect, useState } from "react";

export function TripParticipantPhoto({ bookingId, name, accessToken }: {
  bookingId: string; name: string; accessToken: string;
}) {
  const key = `${bookingId}:${name}:${accessToken}`;
  const [photo, setPhoto] = useState<{ key: string; url: string; expires: number } | null>(null);
  useEffect(() => {
    let alive = true;
    let request: AbortController | null = null;
    const refresh = () => {
      request?.abort();
      setPhoto(null);
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const controller = new AbortController(); request = controller;
      void fetch(`/api/trips/photo?bookingId=${encodeURIComponent(bookingId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { url?: unknown };
        if (alive && !controller.signal.aborted && typeof data.url === "string" && data.url.startsWith("https://")) {
          setPhoto({ key, url: data.url, expires: Date.now() + 55_000 });
        }
      }).catch(() => undefined);
    };
    refresh();
    const interval = window.setInterval(refresh, 45_000);
    const expire = window.setInterval(() => setPhoto((value) => value && value.expires <= Date.now() ? null : value), 1000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh); window.addEventListener("offline", refresh);
    return () => {
      alive = false; request?.abort(); window.clearInterval(interval); window.clearInterval(expire);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh);
    };
  }, [key, bookingId, accessToken]);
  const url = photo?.key === key && photo.expires > Date.now() ? photo.url : null;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join("").toUpperCase() || "?";
  return <span className="trip-participant" aria-label={name}>
    <span className="trip-participant-avatar" aria-hidden="true">
      {/* Private signed URLs bypass image optimization and are never persisted. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setPhoto(null)} /> : initials}
    </span><strong>{name}</strong>
  </span>;
}

