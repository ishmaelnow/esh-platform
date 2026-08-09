export type MapPoint = { latitude: number; longitude: number; label: string };

export async function geocodePermanentAddress(address: string, accessToken: string, requestOrigin?: string) {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", address);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("country", "us");
  url.searchParams.set("limit", "1");
  url.searchParams.set("autocomplete", "false");
  url.searchParams.set("permanent", "true");
  const response = await fetch(url, requestOrigin ? { headers: { Referer: requestOrigin } } : undefined);
  if (!response.ok) throw new Error("Address could not be located on the map.");
  const payload = (await response.json()) as { features?: Array<{ geometry?: { coordinates?: number[] } }> };
  const coordinates = payload.features?.[0]?.geometry?.coordinates;
  const longitude = coordinates?.[0];
  const latitude = coordinates?.[1];
  if (typeof longitude !== "number" || typeof latitude !== "number") throw new Error("Address could not be located on the map.");
  return { longitude, latitude };
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
