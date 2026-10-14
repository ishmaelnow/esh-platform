"use client";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { coverageCircle, coverageRadius, type CoverageCircle } from "./service-area";

export function ServiceAreaMap({ accessToken, areas, resize }: { accessToken?: string | undefined; areas: CoverageCircle[];
  resize?: { area: CoverageCircle; disabled: boolean; onRadiusChange: (radius: number) => void } | undefined }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const resizeRef = useRef(resize); resizeRef.current = resize;
  const updatePreview = useRef<((radius: number) => void) | null>(null);
  const [preview, setPreview] = useState<{ id: string; radius: number } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [retry, setRetry] = useState(0);
  const data = JSON.stringify(areas);
  useEffect(() => {
    setState("loading");
    if (!accessToken || !container.current) { setState("failed"); return; }
    const circles = (JSON.parse(data) as CoverageCircle[]).flatMap((area) => { const shape = coverageCircle(area); return shape ? [shape] : []; });
    if (!circles.length) { setState("failed"); return; }
    let map: mapboxgl.Map | null = null;
    let alive = true;
    const timeout = window.setTimeout(() => { if (alive) setState("failed"); }, 15000);
    try {
      const first = circles[0]!.geometry.coordinates[0]![0]!;
      map = new mapboxgl.Map({ accessToken, container: container.current, style: "mapbox://styles/mapbox/streets-v12",
        center: [first[0]!, Math.max(-85, Math.min(85, first[1]!))], zoom: 9 });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      const current = map;
      mapRef.current = current;
      current.on("moveend", () => { if (alive && container.current) {
        const center = current.getCenter();
        container.current.dataset.camera = `${center.lng.toFixed(5)},${center.lat.toFixed(5)},${current.getZoom().toFixed(2)},${current.getBearing().toFixed(2)}`;
      } });
      map.on("load", () => {
        if (!alive) return;
        current.addSource("coverage", { type: "geojson", data: { type: "FeatureCollection", features: circles } });
        current.addLayer({ id: "coverage-fill", type: "fill", source: "coverage", paint: { "fill-color": ["case", ["get", "active"], "#153258", "#737d88"], "fill-opacity": 0.12 } });
        current.addLayer({ id: "coverage-outline", type: "line", source: "coverage", paint: { "line-color": ["case", ["get", "active"], "#153258", "#737d88"], "line-width": 2.5 } });
        const bounds = new mapboxgl.LngLatBounds();
        circles.forEach((circle) => circle.geometry.coordinates[0]!.forEach(([lon, lat]) => bounds.extend([lon!, Math.max(-85, Math.min(85, lat!))])));
        const fit = () => { const editing = resizeRef.current; if (editing && updatePreview.current) updatePreview.current(editing.area.radiusKm);
          else current.fitBounds(bounds, { padding: 45, maxZoom: 15, duration: 0 }); };
        current.on("resize", fit);
        current.resize(); fit(); window.clearTimeout(timeout); setState("ready");
      });
      map.on("error", () => { if (alive) setState("failed"); });
    } catch { setState("failed"); }
    return () => { alive = false; window.clearTimeout(timeout); if (mapRef.current === map) mapRef.current = null; map?.remove(); };
  }, [accessToken, data, retry]);
  const editId = resize?.area.id, latitude = resize?.area.latitude, longitude = resize?.area.longitude;
  const disabled = resize?.disabled;
  useEffect(() => {
    const map = mapRef.current, editing = resizeRef.current;
    if (state !== "ready" || !map || !editing || disabled || !coverageCircle(editing.area)) return;
    const area = editing.area;
    let radius = area.radiusKm;
    const button = document.createElement("button");
    button.type = "button"; button.className = "esh-coverage-resize-handle"; button.textContent = "↔";
    button.setAttribute("role", "slider"); button.setAttribute("aria-label", "Resize coverage radius");
    button.setAttribute("aria-valuemin", "0.01"); button.setAttribute("aria-valuemax", "1000");
    map.addSource("coverage-preview", { type: "geojson", data: coverageCircle(area)! });
    map.addLayer({ id: "coverage-preview-fill", type: "fill", source: "coverage-preview", paint: { "fill-color": "#2367d1", "fill-opacity": 0.1 } });
    map.addLayer({ id: "coverage-preview-outline", type: "line", source: "coverage-preview", paint: { "line-color": "#2367d1", "line-width": 3, "line-dasharray": [2, 2] } });
    const edge = (value: number) => coverageCircle({ ...area, radiusKm: value })!.geometry.coordinates[0]![32]!;
    const initial = edge(radius);
    const marker = new mapboxgl.Marker({ element: button, draggable: true }).setLngLat([initial[0]!, initial[1]!]).addTo(map);
    const draw = (value: number) => {
      radius = value;
      (map.getSource("coverage-preview") as mapboxgl.GeoJSONSource).setData(coverageCircle({ ...area, radiusKm: radius })!);
      button.setAttribute("aria-valuenow", String(radius)); button.setAttribute("aria-valuetext", `${radius} kilometers`);
      setPreview({ id: area.id, radius });
    };
    const position = (value: number) => {
      draw(value); const point = edge(value); marker.setLngLat([point[0]!, point[1]!]);
      const bounds = new mapboxgl.LngLatBounds();
      coverageCircle({ ...area, radiusKm: value })!.geometry.coordinates[0]!.forEach(([lon, lat]) => bounds.extend([lon!, Math.max(-85, Math.min(85, lat!))]));
      map.fitBounds(bounds, { padding: 45, maxZoom: 15, duration: 0 });
    };
    updatePreview.current = position;
    position(radius);
    button.scrollIntoView({ block: "center" }); button.focus({ preventScroll: true });
    marker.on("drag", () => { const point = marker.getLngLat(); draw(coverageRadius(area.latitude, area.longitude, point.lat, point.lng)); });
    marker.on("dragend", () => { position(radius); resizeRef.current?.onRadiusChange(radius); });
    const keyboard = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 10 : 1;
      const value = event.key === "Home" ? 0.01 : event.key === "End" ? 1000
        : ["ArrowUp", "ArrowRight"].includes(event.key) ? Math.min(1000, radius + step)
        : ["ArrowDown", "ArrowLeft"].includes(event.key) ? Math.max(0.01, radius - step) : null;
      if (value === null) return; event.preventDefault(); position(Math.round(value * 100) / 100); resizeRef.current?.onRadiusChange(Math.round(value * 100) / 100);
    };
    button.addEventListener("keydown", keyboard);
    return () => {
      updatePreview.current = null; button.removeEventListener("keydown", keyboard); marker.remove();
      if (mapRef.current === map) {
        if (map.getLayer("coverage-preview-outline")) map.removeLayer("coverage-preview-outline");
        if (map.getLayer("coverage-preview-fill")) map.removeLayer("coverage-preview-fill");
        if (map.getSource("coverage-preview")) map.removeSource("coverage-preview");
      }
    };
  }, [state, editId, latitude, longitude, disabled, data, retry]);
  useEffect(() => { const editing = resizeRef.current; if (editing && coverageCircle(editing.area)) updatePreview.current?.(editing.area.radiusKm); }, [resize?.area.radiusKm]);
  return <div>
    <div ref={container} aria-label="Service area coverage map" className="esh-service-area-map" data-map-ready={state === "ready"} />
    {resize ? <p role="status">Preview radius: {preview?.id === resize.area.id ? preview.radius : resize.area.radiusKm} km. Dashed circle is unsaved. Drag the handle or use arrow keys; Shift changes by 10 km.</p> : null}
    {state === "loading" ? <p role="status">Loading coverage map…</p> : state === "failed" ? <div><p role="status">Coverage map unavailable. Saved centers and radii remain available below.</p>
      <button type="button" className="secondary-button" onClick={() => setRetry((value) => value + 1)}>Retry coverage map</button></div> : null}
  </div>;
}
