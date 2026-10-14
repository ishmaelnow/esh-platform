import { validCoordinates } from "./index";
export type CoverageCircle = { id: string; name: string; latitude: number; longitude: number; radiusKm: number; active: boolean };

export function coverageRadius(latitude: number, longitude: number, handleLatitude: number, handleLongitude: number) {
  const rad = Math.PI / 180;
  const a = Math.sin((handleLatitude - latitude) * rad / 2) ** 2
    + Math.cos(latitude * rad) * Math.cos(handleLatitude * rad) * Math.sin((handleLongitude - longitude) * rad / 2) ** 2;
  return Math.round(Math.min(1000, Math.max(0.01, 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a)))))) * 100) / 100;
}

export function coverageCircle(area: CoverageCircle): GeoJSON.Feature<GeoJSON.Polygon> | null {
  if (!validCoordinates(area.latitude, area.longitude) || !Number.isFinite(area.radiusKm) || area.radiusKm < 0.01 || area.radiusKm > 1000) return null;
  const rad = Math.PI / 180, latitude = area.latitude * rad, longitude = area.longitude * rad;
  const distance = area.radiusKm / 6371; // Same spherical radius as existing database boundary checks.
  const ring: number[][] = [];
  for (let i = 0; i < 128; i++) {
    const bearing = 2 * Math.PI * i / 128;
    const lat = Math.asin(Math.sin(latitude) * Math.cos(distance) + Math.cos(latitude) * Math.sin(distance) * Math.cos(bearing));
    const lon = longitude + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(latitude), Math.cos(distance) - Math.sin(latitude) * Math.sin(lat));
    ring.push([lon / rad, lat / rad]);
  }
  ring.push([...ring[0]!]);
  return { type: "Feature", properties: { id: area.id, name: area.name, active: area.active }, geometry: { type: "Polygon", coordinates: [ring] } };
}
