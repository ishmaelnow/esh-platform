"use client";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { coverageCircle, type CoverageCircle } from "./service-area";

export function ServiceAreaMap({ accessToken, areas }: { accessToken?: string | undefined; areas: CoverageCircle[] }) {
  const container = useRef<HTMLDivElement>(null);
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
        const fit = () => current.fitBounds(bounds, { padding: 45, maxZoom: 15, duration: 0 });
        current.on("resize", fit);
        current.resize(); fit(); window.clearTimeout(timeout); setState("ready");
      });
      map.on("error", () => { if (alive) setState("failed"); });
    } catch { setState("failed"); }
    return () => { alive = false; window.clearTimeout(timeout); map?.remove(); };
  }, [accessToken, data, retry]);
  return <div>
    <div ref={container} aria-label="Service area coverage map" className="esh-service-area-map" data-map-ready={state === "ready"} />
    {state === "loading" ? <p role="status">Loading coverage map…</p> : state === "failed" ? <div><p role="status">Coverage map unavailable. Saved centers and radii remain available below.</p>
      <button type="button" className="secondary-button" onClick={() => setRetry((value) => value + 1)}>Retry coverage map</button></div> : null}
  </div>;
}
