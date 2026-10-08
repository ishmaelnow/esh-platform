import { validCoordinates } from "@esh-platform/maps";

export type TripLocation = { bookingId: string; latitude: number; longitude: number; accuracyMeters: number; recordedAt: string; fresh: boolean };
export function currentTripLocation(status: string, location: TripLocation | undefined, now: number) {
  if (!location || !["accepted", "arrived", "in_progress"].includes(status)
    || !validCoordinates(location.latitude, location.longitude)) return null;
  const age = now - Date.parse(location.recordedAt);
  return { ...location, fresh: location.fresh && Number.isFinite(age) && age >= -30_000 && age <= 60_000 };
}
export function trackingMessage(status: string) {
  switch (status) {
    case "accepted": return "Your driver is on the way";
    case "arrived": return "Your driver has arrived";
    case "in_progress": return "On your way to your destination";
    case "offered": return "Waiting for a driver to accept";
    default: return "Finding your driver";
  }
}
export function trackingMapPoint(status: string, location: TripLocation | undefined, now: number) {
  const current = currentTripLocation(status, location, now);
  return current?.fresh ? { latitude: current.latitude, longitude: current.longitude, label: "Driver live location" } : null;
}
