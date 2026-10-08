"use client";

import { useEffect, useState } from "react";
import type { PlatformSupabaseClient } from "@esh-platform/supabase";
import { validCoordinates, type MapPoint } from "@esh-platform/maps";
import { LiveTripMap } from "@esh-platform/maps/client";
import { openDriverNavigation } from "../lib/embedded-navigation";

type SharedPosition = { latitude: number; longitude: number; accuracyMeters: number; recordedAt: string };
export function DriverRiderLocation({ client, bookingId, status, accessToken, pickup, destination, driver }: {
  client: PlatformSupabaseClient; bookingId: string; status: string; accessToken?: string | undefined;
  pickup: MapPoint | null; destination: MapPoint | null; driver: MapPoint | null;
}) {
  const [position, setPosition] = useState<SharedPosition | null>(null);
  useEffect(() => {
    let disposed = false;
    let request = 0;
    const refresh = async () => {
      const version = ++request;
      const result = await client.rpc("my_driver_rider_pickup_location", { target_booking_id: bookingId });
      if (disposed || version !== request) return;
      const point = result.data as SharedPosition | null;
      const age = Date.now() - Date.parse(point?.recordedAt ?? "");
      setPosition(!result.error && point && validCoordinates(point.latitude, point.longitude)
        && Number.isFinite(age) && age >= -30000 && age <= 60000 ? point : null);
    };
    setPosition(null);
    if (!["accepted", "arrived"].includes(status)) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { disposed = true; ++request; window.clearInterval(timer); };
  }, [client, bookingId, status]);
  const visible = ["accepted", "arrived"].includes(status) && position
    && Date.now() - Date.parse(position.recordedAt) <= 60000 ? position : null;
  return <>
    {["accepted", "arrived"].includes(status) ? <div className="driver-rider-location" aria-label="Passenger location">
      {visible ? <><strong>Passenger is sharing their current location</strong>
        <span>Accuracy ±{Math.round(visible.accuracyMeters)} m · updated {new Date(visible.recordedAt).toLocaleTimeString()}</span>
        <span>This is separate from the booked pickup address.</span>
        <button className="secondary" type="button" onClick={() => openDriverNavigation({ ...visible, label: "Passenger shared location" })}>View shared passenger location</button>
      </> : <span>No current passenger location shared. Use the booked pickup address.</span>}
    </div> : null}
    {accessToken && pickup && destination ? <LiveTripMap accessToken={accessToken} pickup={pickup} destination={destination}
      driver={driver} passenger={visible ? { ...visible, label: "Passenger shared location" } : null}
      tripStarted={status === "in_progress"} showPickupEta={status === "accepted"} /> : null}
  </>;
}
