import { coordinateDistanceKm, validCoordinates } from "@esh-platform/maps";

export type CoverageArea = { serviceAreaId: string; latitude: number; longitude: number; radiusKm: number };
type Coordinates = { latitude?: number; longitude?: number };

/** Preserve the existing pickup-radius and 800km destination geocoding contract. */
export function resolveRideCoverage(areas: CoverageArea[], pickup: Coordinates, destination: Coordinates) {
  if (!validCoordinates(pickup.latitude, pickup.longitude) || !validCoordinates(destination.latitude, destination.longitude))
    throw new Error("Choose verified pickup and destination addresses before reviewing your fare.");
  const from = { latitude: pickup.latitude, longitude: pickup.longitude! };
  const to = { latitude: destination.latitude, longitude: destination.longitude! };
  const candidates = areas.filter((area) => validCoordinates(area.latitude, area.longitude) &&
    Number.isFinite(area.radiusKm) && area.radiusKm > 0 && coordinateDistanceKm(area, from) <= area.radiusKm &&
    coordinateDistanceKm(area, to) <= 800);
  candidates.sort((a, b) => coordinateDistanceKm(a, from) - coordinateDistanceKm(b, from) || a.serviceAreaId.localeCompare(b.serviceAreaId));
  if (!candidates[0]) throw new Error("This trip is outside your provider’s service coverage. Choose another pickup or destination.");
  return candidates[0];
}
