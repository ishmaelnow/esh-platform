"use client";

import { useEffect, useState } from "react";
import { formatRouteDuration, validCoordinates } from "@esh-platform/maps";
import { trackingMessage, type TripLocation } from "../lib/trip-tracking";
import { TripParticipantPhoto } from "./TripParticipantPhoto";

export function RiderTripTracking({ booking, location, accessToken, sessionToken, onOpen }: {
  booking: { bookingId: string; status: string; pickupLatitude?: number | null; pickupLongitude?: number | null;
    destinationLatitude?: number | null; destinationLongitude?: number | null; driver: { displayName: string } | null };
  location: TripLocation | null; accessToken?: string | undefined; sessionToken?: string | undefined; onOpen?: () => void;
}) {
  const targetLatitude = booking.status === "in_progress" ? booking.destinationLatitude : booking.pickupLatitude;
  const targetLongitude = booking.status === "in_progress" ? booking.destinationLongitude : booking.pickupLongitude;
  const canEstimate = Boolean(accessToken && location?.fresh && ["accepted", "in_progress"].includes(booking.status)
    && validCoordinates(targetLatitude, targetLongitude));
  const key = `${booking.bookingId}:${booking.status}:${location?.recordedAt}:${location?.latitude}:${location?.longitude}:${targetLatitude}:${targetLongitude}:${canEstimate}`;
  const [estimate, setEstimate] = useState<{ key: string; seconds: number | null } | null>(null);
  useEffect(() => {
    if (!canEstimate || !location) return;
    const controller = new AbortController();
    let mounted = true;
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${location.longitude},${location.latitude};${targetLongitude},${targetLatitude}`);
    url.searchParams.set("access_token", accessToken!);
    void fetch(url, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Route unavailable");
      const payload = await response.json() as { routes?: { duration: number }[] };
      const seconds = payload.routes?.[0]?.duration;
      if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) throw new Error("Route unavailable");
      if (!controller.signal.aborted) setEstimate({ key, seconds });
    }).catch(() => { if (mounted) setEstimate({ key, seconds: null }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { mounted = false; controller.abort(); window.clearTimeout(timeout); };
  }, [key, canEstimate, accessToken, location?.latitude, location?.longitude, targetLatitude, targetLongitude]);
  const seconds = estimate?.key === key ? estimate.seconds : null;
  return <section className={`rider-trip-tracking${onOpen ? " tracking-home" : ""}`} aria-label="Current ride tracking">
    <div role="status"><strong>{trackingMessage(booking.status)}</strong>
      {booking.driver ? <div>{sessionToken && ["accepted", "arrived", "in_progress"].includes(booking.status)
        ? <TripParticipantPhoto bookingId={booking.bookingId} name={booking.driver.displayName} accessToken={sessionToken} />
        : <p>{booking.driver.displayName}</p>}</div> : null}
      {location ? <p>{location.fresh ? "Live driver location" : "Last known driver location"} · {Number.isFinite(Date.parse(location.recordedAt)) ? new Date(location.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Update time unavailable"}</p>
        : ["accepted", "arrived", "in_progress"].includes(booking.status) ? <p>Driver location is unavailable. Trip updates will continue.</p> : null}
      {seconds !== null && canEstimate ? <p><strong>{booking.status === "in_progress" ? "Destination" : "Pickup"} ETA: about {formatRouteDuration(seconds)}</strong></p>
        : ["accepted", "in_progress"].includes(booking.status) ? <p>{canEstimate && estimate?.key !== key ? "Updating ETA…" : "ETA unavailable"}</p> : null}
    </div>
    {onOpen ? <button className="button primary compact" onClick={onOpen}>Track ride</button> : null}
  </section>;
}
