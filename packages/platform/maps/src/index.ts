export type MapPoint = { latitude: number; longitude: number; label: string };

export type GeocodingContext = {
  latitude: number;
  longitude: number;
  maxDistanceKm?: number;
  requestOrigin?: string | undefined;
};

export function coordinateDistanceKm(
  first: Pick<MapPoint, "latitude" | "longitude">,
  second: Pick<MapPoint, "latitude" | "longitude">,
) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(value)));
}

export async function geocodePermanentAddress(
  address: string,
  accessToken: string,
  context: GeocodingContext,
) {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", address);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("country", "us");
  url.searchParams.set("limit", "5");
  url.searchParams.set("autocomplete", "false");
  url.searchParams.set("permanent", "true");
  url.searchParams.set("proximity", `${context.longitude},${context.latitude}`);
  const response = await fetch(
    url,
    context.requestOrigin ? { headers: { Referer: context.requestOrigin } } : undefined,
  );
  if (!response.ok) throw new Error("Address could not be located on the map.");
  const payload = (await response.json()) as { features?: Array<{ geometry?: { coordinates?: number[] } }> };
  const maximumDistance = context.maxDistanceKm ?? 800;
  for (const feature of payload.features ?? []) {
    const longitude = feature.geometry?.coordinates?.[0];
    const latitude = feature.geometry?.coordinates?.[1];
    if (typeof longitude !== "number" || typeof latitude !== "number") continue;
    if (
      coordinateDistanceKm(context, { latitude, longitude }) <= maximumDistance
    ) return { longitude, latitude };
  }
  throw new Error("Address resolved too far from the selected service area.");
}

export function formatRouteDistance(meters: number) {
  return `${(meters / 1609.344).toFixed(meters < 16093.44 ? 1 : 0)} mi`;
}

export function formatRouteDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}
