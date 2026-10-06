import { validCoordinates } from "@esh-platform/maps";
export type PlaceKey = "home" | "work";
export type SavedPlace = { key: PlaceKey; label: string; latitude: number; longitude: number };
export const placeName = (key: PlaceKey) => key === "home" ? "Home" : "Work";
export function parseSavedPlaces(data: unknown): SavedPlace[] {
  if (!Array.isArray(data)) throw new Error("Saved addresses could not be loaded.");
  const keys = new Set<string>();
  return data.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Saved address is invalid.");
    const row = item as Partial<SavedPlace>;
    if ((row.key !== "home" && row.key !== "work") || keys.has(row.key)
      || typeof row.label !== "string" || !row.label.trim() || row.label.length > 500
      || typeof row.latitude !== "number" || typeof row.longitude !== "number"
      || !validCoordinates(row.latitude, row.longitude)) throw new Error("Saved address is invalid.");
    keys.add(row.key);
    return { key: row.key, label: row.label, latitude: row.latitude, longitude: row.longitude };
  });
}
