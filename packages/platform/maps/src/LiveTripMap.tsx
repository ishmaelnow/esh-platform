"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { formatRouteDistance, formatRouteDuration, type MapPoint } from "./index";

export function LiveTripMap({ accessToken, pickup, destination, driver }: {
  accessToken: string; pickup: MapPoint; destination: MapPoint; driver?: MapPoint | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [summary, setSummary] = useState<{ distance: number; duration: number; pickupDuration: number | null } | null>(null);
  const [routeUnavailable, setRouteUnavailable] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const points = driver ? [driver, pickup, destination] : [pickup, destination];
    const map = new mapboxgl.Map({ accessToken, container: container.current, style: "mapbox://styles/mapbox/streets-v12", center: [pickup.longitude, pickup.latitude], zoom: 11 });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    const bounds = new mapboxgl.LngLatBounds();
    points.forEach((point, index) => {
      bounds.extend([point.longitude, point.latitude]);
      const color = index === 0 && driver ? "#176b54" : point === pickup ? "#2367d1" : "#b43737";
      new mapboxgl.Marker({ color }).setLngLat([point.longitude, point.latitude]).setPopup(new mapboxgl.Popup({ offset: 20 }).setText(point.label)).addTo(map);
    });
    map.fitBounds(bounds, { padding: 55, maxZoom: 14 });
    map.on("load", () => { void (async () => {
      try {
        const coordinates = points.map((point) => `${point.longitude},${point.latitude}`).join(";");
        const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}`);
        url.searchParams.set("access_token", accessToken); url.searchParams.set("geometries", "geojson"); url.searchParams.set("overview", "full");
        const response = await fetch(url); if (!response.ok) throw new Error();
        const payload = (await response.json()) as { routes?: Array<{ distance: number; duration: number; geometry: GeoJSON.LineString; legs?: Array<{ duration: number }> }> };
        const route = payload.routes?.[0]; if (!route) throw new Error();
        map.addSource("trip-route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: route.geometry } });
        map.addLayer({ id: "trip-route", type: "line", source: "trip-route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#2367d1", "line-width": 5, "line-opacity": 0.8 } });
        setSummary({ distance: route.distance, duration: route.duration, pickupDuration: driver ? route.legs?.[0]?.duration ?? null : null });
      } catch { setRouteUnavailable(true); }
    })(); });
    return () => map.remove();
  }, [accessToken, destination.latitude, destination.longitude, driver?.latitude, driver?.longitude, pickup.latitude, pickup.longitude]);
  return <div className="esh-trip-map-shell"><div aria-label="Live trip map" className="esh-trip-map" ref={container} /><p className="esh-trip-map-summary">{summary ? `${summary.pickupDuration != null ? `Pickup ETA ${formatRouteDuration(summary.pickupDuration)} · ` : ""}Route ${formatRouteDuration(summary.duration)} · ${formatRouteDistance(summary.distance)}` : routeUnavailable ? "Map markers are available; road route and ETA are temporarily unavailable." : "Calculating road route and ETA…"}</p></div>;
}
