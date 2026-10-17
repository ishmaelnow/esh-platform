"use client";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { formatRouteDistance, formatRouteDuration } from "./index";
import type { StudentStop, StudentRoadRoute } from "./student-geography";

export function StudentRouteMap({
  stops,
  route,
  accessToken,
  reviewed = false,
}: {
  stops: StudentStop[];
  route: StudentRoadRoute;
  accessToken: string;
  reviewed?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!container.current || !stops.length) return;
    setFailed(false);
    setReady(false);
    let map: mapboxgl.Map | undefined;
    try {
      map = new mapboxgl.Map({
        container: container.current,
        accessToken,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [stops[0]!.longitude, stops[0]!.latitude],
        zoom: 12,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      const bounds = new mapboxgl.LngLatBounds();
      stops.forEach((stop, i) => {
        bounds.extend([stop.longitude, stop.latitude]);
        new mapboxgl.Marker({ color: "#153258" })
          .setLngLat([stop.longitude, stop.latitude])
          .setPopup(new mapboxgl.Popup().setText(`${i + 1}. ${stop.address}`))
          .addTo(map!);
      });
      route.geometry.coordinates.forEach((point) => bounds.extend([point[0]!, point[1]!]));
      map.fitBounds(bounds, { padding: 45, maxZoom: 16 });
      map.on("error", () => setFailed(true));
      map.on("load", () => {
        map!.addSource("student-preview", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: route.geometry as GeoJSON.LineString },
        });
        map!.addLayer({
          id: "student-preview",
          type: "line",
          source: "student-preview",
          paint: { "line-color": "#153258", "line-width": 5 },
        });
        map!.once("idle", () => setReady(true));
      });
    } catch {
      setFailed(true);
    }
    return () => map?.remove();
  }, [stops, route, accessToken, attempt]);
  return (
    <div
      className="student-route-preview"
      data-map-state={failed ? "failed" : ready ? "ready" : "loading"}
    >
      <div
        ref={container}
        aria-label="Proposed student road route"
        style={{ height: 320, width: "100%" }}
      />
      {failed ? (
        <p role="status">
          Map unavailable.{" "}
          <button type="button" onClick={() => setAttempt((a) => a + 1)}>
            Retry map
          </button>
        </p>
      ) : null}
      <p>
        Proposed road route: {formatRouteDistance(route.distanceMeters)} ·{" "}
        {formatRouteDuration(route.durationSeconds)}.{" "}
        {reviewed
          ? "Reviewed loading points in the explicit plan order. Planning only; transport is not released."
          : "Stop order follows the request. Loading points need staff approval."}
      </p>
    </div>
  );
}
