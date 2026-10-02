"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { validCoordinates, type MapPoint } from "./index";

/** Display-only map: location is supplied by the existing consent and trip flows. */
export function RiderHomeMap({ accessToken, center, pickup, destination, driver, currentLocation, onLocate, locationBusy, locationNotice, recenterVersion = 0, bottomInset = 0, showTraffic = false }: {
  accessToken?: string | undefined;
  center?: { latitude: number; longitude: number } | null;
  pickup?: MapPoint | null;
  destination?: MapPoint | null;
  driver?: MapPoint | null;
  currentLocation?: { latitude: number; longitude: number; accuracy: number } | null;
  onLocate?: () => void;
  locationBusy?: boolean;
  locationNotice?: string;
  recenterVersion?: number;
  bottomInset?: number;
  showTraffic?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const cameraTarget = useRef("");
  const lastRecenter = useRef(recenterVersion);
  const [ready, setReady] = useState(false);
  const [settled, setSettled] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [trafficUnavailable, setTrafficUnavailable] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        ...(accessToken ? { accessToken } : {}), container: container.current,
        style: accessToken ? "mapbox://styles/mapbox/streets-v12" : "https://tiles.openfreemap.org/styles/liberty",
        ...(center ? { center: [center.longitude, center.latitude] as [number, number], zoom: 17 } : { zoom: 1 }),
        bearing: -32, pitch: 18, attributionControl: false,
        dragPan: true, scrollZoom: true, dragRotate: true, touchZoomRotate: true,
      });
    } catch {
      setUnavailable(true);
      return;
    }
    mapRef.current = map;
    map.on("idle", () => setSettled(true));
    map.on("movestart", () => setSettled(false));
    cameraTarget.current = "";
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container.current);
    map.addControl(new mapboxgl.AttributionControl({ compact: false }), "bottom-left");
    map.on("load", () => {
      // Keep road names and small business/transit markers; remove broad-area label clutter.
      for (const layer of map.getStyle().layers ?? []) {
        if (layer.type === "background") map.setPaintProperty(layer.id, "background-color", "#fafaf7");
        if (layer.type === "fill" && /landuse|landcover|park/.test(layer.id)) map.setPaintProperty(layer.id, "fill-color", "#f5f6f3");
        if (layer.type === "line" && /road|street|bridge|tunnel/.test(layer.id)) {
          map.setPaintProperty(layer.id, "line-color", /casing/.test(layer.id) ? "#e8eef1" : "#cddde7");
        }
        if (/rail|path_pedestrian|boundary|road_area_pattern/.test(layer.id)) map.setLayoutProperty(layer.id, "visibility", "none");
        if (layer.type === "fill" && /building/.test(layer.id)) {
          map.setPaintProperty(layer.id, "fill-color", "#f0f1ef");
          map.setPaintProperty(layer.id, "fill-outline-color", "#d1d5d5");
        }
        if (layer.type === "symbol" && /road-label|street-label|highway-name/.test(layer.id)) {
          map.setPaintProperty(layer.id, "text-color", "#777f85");
          map.setPaintProperty(layer.id, "text-halo-color", "#fff");
          map.setPaintProperty(layer.id, "text-halo-width", 1.5);
          map.setLayoutProperty(layer.id, "text-size", ["interpolate", ["linear"], ["zoom"], 13, 13, 17, 16, 20, 18]);
        }
        if (layer.type === "symbol" && /poi/.test(layer.id)) map.setLayoutProperty(layer.id, "text-size", 11);
        if (layer.id === "poi_r20") map.setLayoutProperty(layer.id, "visibility", "none");
        if (layer.type === "symbol" && /settlement|state-label|country-label|airport|^label_|shield/.test(layer.id)) map.setLayoutProperty(layer.id, "visibility", "none");
        if (layer.type === "fill-extrusion" && /building/.test(layer.id)) {
          map.setPaintProperty(layer.id, "fill-extrusion-color", "#eef0ee");
          map.setPaintProperty(layer.id, "fill-extrusion-height", 3);
          map.setPaintProperty(layer.id, "fill-extrusion-base", 0);
          map.setPaintProperty(layer.id, "fill-extrusion-opacity", .85);
          map.setLayoutProperty(layer.id, "visibility", "visible");
        }
      }
      if (map.getSource("composite")) {
        const firstLabel = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
        map.addLayer({ id: "rider-building-sides", type: "fill-extrusion", source: "composite",
          "source-layer": "building", minzoom: 15, filter: ["==", "extrude", "true"],
          paint: { "fill-extrusion-color": "#eef0ee", "fill-extrusion-height": 3,
            "fill-extrusion-base": 0, "fill-extrusion-opacity": .85 } }, firstLabel);
      }
      setReady(true);
    });
    map.on("error", (event) => {
      const error = event as typeof event & { sourceId?: string };
      if (error.sourceId === "driver-traffic" || event.error.message.includes("mapbox-traffic-v1")) setTrafficUnavailable(true);
      else setUnavailable(true);
    });
    return () => { resizeObserver.disconnect(); mapRef.current = null; map.remove(); setReady(false); };
  }, [accessToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !accessToken) return;
    if (showTraffic && !map.getSource("driver-traffic")) {
      map.addSource("driver-traffic", { type: "vector", url: "mapbox://mapbox.mapbox-traffic-v1" });
      const label = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
      map.addLayer({ id: "driver-traffic", type: "line", source: "driver-traffic", "source-layer": "traffic",
        paint: { "line-color": ["match", ["get", "congestion"], "low", "#49a97b", "moderate", "#edbc46", "heavy", "#ef8052", "severe", "#d94141", "rgba(0,0,0,0)"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 4], "line-opacity": .8 } }, label);
    }
    if (map.getLayer("driver-traffic")) map.setLayoutProperty("driver-traffic", "visibility", showTraffic ? "visible" : "none");
  }, [accessToken, ready, showTraffic]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const points = [pickup, destination, driver].filter((point): point is MapPoint => Boolean(point && validCoordinates(point.latitude, point.longitude)));
    const explicitRecenter = lastRecenter.current !== recenterVersion;
    lastRecenter.current = recenterVersion;
    const target = `${bottomInset}:` + (points.length ? JSON.stringify(points.map((point) => [point.latitude, point.longitude]))
      : currentLocation ? `location:${recenterVersion}` : `area:${center?.latitude}:${center?.longitude}`);
    const changeCamera = cameraTarget.current !== target;
    cameraTarget.current = target;
    const markers = points.map((point) => new mapboxgl.Marker({
      color: point === driver ? "#16714a" : point === destination ? "#b43737" : "#2367d1",
    }).setLngLat([point.longitude, point.latitude])
      .setPopup(new mapboxgl.Popup({ offset: 20 }).setText(point.label)).addTo(map));
    if (currentLocation && explicitRecenter) {
      map.easeTo({ center: [currentLocation.longitude, currentLocation.latitude], zoom: 17,
        offset: [0, bottomInset ? -bottomInset / 2 : map.getContainer().clientHeight * .112], duration: 0 });
    } else if (points.length > 0 && changeCamera) {
      const bounds = new mapboxgl.LngLatBounds();
      points.forEach((point) => bounds.extend([point.longitude, point.latitude]));
      const desktop = window.innerWidth >= 900;
      map.fitBounds(bounds, {
        padding: desktop ? { top: 100, bottom: bottomInset + 70, left: 100, right: 100 }
          : { top: 100, bottom: bottomInset + 60, left: 45, right: 45 },
        maxZoom: 17, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700,
      });
    } else if (!points.length && (currentLocation || center) && changeCamera) {
      const location = currentLocation ?? center;
      if (location) map.easeTo({ center: [location.longitude, location.latitude], zoom: 17, bearing: -32,
        offset: [0, bottomInset ? -bottomInset / 2 : map.getContainer().clientHeight * .112], duration: 0 });
    }
    let locationMarker: mapboxgl.Marker | null = null;
    let updateAccuracy: (() => void) | undefined;
    if (currentLocation) {
      const element = document.createElement("div");
      element.className = "rider-current-position";
      element.dataset.latitude = String(currentLocation.latitude);
      element.dataset.longitude = String(currentLocation.longitude);
      element.setAttribute("aria-label", "Your current location");
      updateAccuracy = () => {
        const metersPerPixel = 156543.03392 * Math.cos(currentLocation.latitude * Math.PI / 180) / 2 ** map.getZoom();
        const diameter = Math.max(46, Math.min(180, currentLocation.accuracy * 2 / metersPerPixel));
        element.style.setProperty("--accuracy-size", `${diameter}px`);
      };
      updateAccuracy(); map.on("zoom", updateAccuracy);
      locationMarker = new mapboxgl.Marker({ element }).setLngLat([currentLocation.longitude, currentLocation.latitude]).addTo(map);
    }
    return () => { if (updateAccuracy) map.off("zoom", updateAccuracy); markers.forEach((marker) => marker.remove()); locationMarker?.remove(); };
  }, [ready, center?.latitude, center?.longitude, pickup?.latitude, pickup?.longitude,
    destination?.latitude, destination?.longitude, driver?.latitude, driver?.longitude,
    currentLocation?.latitude, currentLocation?.longitude, currentLocation?.accuracy, recenterVersion, bottomInset]);

  return <div className="rider-map-background">
    <div className="rider-map-canvas" ref={container} role="region" aria-label="Ride map" data-map-ready={ready} data-map-idle={settled} />
    {unavailable ? <p className="map-fallback" role="status">Map unavailable. Your trip controls are still available.</p> : null}
    {showTraffic && trafficUnavailable ? <p className="map-traffic-notice" role="status">Traffic is temporarily unavailable.</p> : null}
    {locationNotice ? <p className="map-location-notice" role="status">{locationNotice}</p> : null}
    {onLocate ? <button className="map-locate" type="button" aria-label="Center on my location" disabled={locationBusy} onClick={onLocate}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /><path d="M12 2v4m0 12v4M2 12h4m12 0h4" /></svg>
    </button> : null}
  </div>;
}
