export type ServiceAreaInput = {
  name: string;
  description: string | null;
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
};

export function parseServiceAreaInput(input: Record<string, unknown>): ServiceAreaInput {
  const name = text(input.name);
  const description = text(input.description) || null;
  const centerLatitude = number(input.centerLatitude);
  const centerLongitude = number(input.centerLongitude);
  const radiusKm = number(input.radiusKm);

  if (!name) throw new Error("Service area name is required.");
  if (name.length > 120) throw new Error("Service area name must be 120 characters or fewer.");
  if (description && description.length > 500)
    throw new Error("Description must be 500 characters or fewer.");
  if (centerLatitude < -90 || centerLatitude > 90)
    throw new Error("Latitude must be between -90 and 90.");
  if (centerLongitude < -180 || centerLongitude > 180)
    throw new Error("Longitude must be between -180 and 180.");
  if (radiusKm <= 0 || radiusKm > 1000)
    throw new Error("Radius must be greater than 0 and no more than 1000 km.");

  return { name, description, centerLatitude, centerLongitude, radiusKm };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isFinite(parsed))
    throw new Error("Service area coordinates and radius are required.");
  return parsed;
}
