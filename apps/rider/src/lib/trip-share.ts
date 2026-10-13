export type SharedTrip = { status: "accepted" | "arrived" | "in_progress"; expiresAt: string;
  location: { latitude: number; longitude: number; recordedAt: string } | null };
export function readSharedTrip(value: unknown): SharedTrip | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!["accepted", "arrived", "in_progress"].includes(String(v.status)) || typeof v.expiresAt !== "string" || !Number.isFinite(Date.parse(v.expiresAt))) return null;
  const l = v.location as SharedTrip["location"];
  const valid = l && typeof l.latitude === "number" && Number.isFinite(l.latitude) && Math.abs(l.latitude) <= 90
    && typeof l.longitude === "number" && Number.isFinite(l.longitude) && Math.abs(l.longitude) <= 180
    && typeof l.recordedAt === "string" && Number.isFinite(Date.parse(l.recordedAt));
  return { status: v.status as SharedTrip["status"], expiresAt: v.expiresAt, location: valid ? { latitude: l.latitude, longitude: l.longitude, recordedAt: l.recordedAt } : null };
}
export const shareTokenPattern = /^[A-Za-z0-9_-]{43}$/;
