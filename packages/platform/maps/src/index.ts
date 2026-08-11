export type MapPoint = { latitude: number; longitude: number; label: string };

export type GeocodingContext = {
  latitude: number;
  longitude: number;
  maxDistanceKm?: number;
  requireVerifiedAddress?: boolean;
  requestOrigin?: string | undefined;
};

export type AddressSuggestion = {
  mapboxId: string;
  label: string;
};

export function regionalBoundingBox(context: GeocodingContext, radiusKm: number) {
  const latitudeDelta = radiusKm / 111.32;
  const longitudeScale = Math.max(0.1, Math.cos((context.latitude * Math.PI) / 180));
  const longitudeDelta = radiusKm / (111.32 * longitudeScale);
  return [
    context.longitude - longitudeDelta,
    context.latitude - latitudeDelta,
    context.longitude + longitudeDelta,
    context.latitude + latitudeDelta,
  ].join(",");
}

export async function suggestRegionalAddresses({
  accessToken,
  context,
  query,
  radiusKm,
  sessionToken,
  types,
  signal,
}: {
  accessToken: string;
  context: GeocodingContext;
  query: string;
  radiusKm: number;
  sessionToken: string;
  types: "address" | "address,poi";
  signal?: AbortSignal;
}) {
  if (query.trim().length < 3) return [];
  const url = new URL("https://api.mapbox.com/search/searchbox/v1/suggest");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("session_token", sessionToken);
  url.searchParams.set("country", "US");
  url.searchParams.set("language", "en");
  url.searchParams.set("limit", "5");
  url.searchParams.set("types", types);
  url.searchParams.set("proximity", `${context.longitude},${context.latitude}`);
  url.searchParams.set("bbox", regionalBoundingBox(context, radiusKm));
  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) throw new Error("Address suggestions are temporarily unavailable.");
  const payload = (await response.json()) as {
    suggestions?: Array<{
      mapbox_id?: string;
      name?: string;
      full_address?: string;
      place_formatted?: string;
    }>;
  };
  return (payload.suggestions ?? []).flatMap((suggestion) => {
    if (!suggestion.mapbox_id || !suggestion.name) return [];
    const label =
      suggestion.full_address?.trim() ||
      [suggestion.name, suggestion.place_formatted].filter(Boolean).join(", ");
    return label ? [{ mapboxId: suggestion.mapbox_id, label }] : [];
  });
}

export async function retrieveAddressSuggestion({
  accessToken,
  mapboxId,
  sessionToken,
}: {
  accessToken: string;
  mapboxId: string;
  sessionToken: string;
}) {
  const url = new URL(
    `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(mapboxId)}`,
  );
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("session_token", sessionToken);
  url.searchParams.set("language", "en");
  const response = await fetch(url);
  if (!response.ok) throw new Error("The selected address could not be verified.");
  const payload = (await response.json()) as {
    features?: Array<{
      properties?: { full_address?: string; name?: string; place_formatted?: string };
    }>;
  };
  const properties = payload.features?.[0]?.properties;
  const label =
    properties?.full_address?.trim() ||
    [properties?.name, properties?.place_formatted].filter(Boolean).join(", ");
  if (!label) throw new Error("The selected address could not be verified.");
  return { mapboxId, label } satisfies AddressSuggestion;
}

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
  if (context.requireVerifiedAddress) url.searchParams.set("types", "address");
  const response = await fetch(
    url,
    context.requestOrigin ? { headers: { Referer: context.requestOrigin } } : undefined,
  );
  if (!response.ok) throw new Error("Address could not be located on the map.");
  const payload = (await response.json()) as {
    features?: Array<{
      geometry?: { coordinates?: number[] };
      properties?: {
        feature_type?: string;
        full_address?: string;
        name?: string;
        place_formatted?: string;
        match_code?: { confidence?: string };
      };
    }>;
  };
  const maximumDistance = context.maxDistanceKm ?? 800;
  for (const feature of payload.features ?? []) {
    const longitude = feature.geometry?.coordinates?.[0];
    const latitude = feature.geometry?.coordinates?.[1];
    if (typeof longitude !== "number" || typeof latitude !== "number") continue;
    if (context.requireVerifiedAddress) {
      const confidence = feature.properties?.match_code?.confidence;
      if (
        feature.properties?.feature_type !== "address" ||
        !confidence ||
        !["exact", "high", "medium"].includes(confidence)
      ) continue;
    }
    if (
      coordinateDistanceKm(context, { latitude, longitude }) <= maximumDistance
    ) {
      const formattedAddress =
        feature.properties?.full_address?.trim() ||
        [feature.properties?.name, feature.properties?.place_formatted]
          .filter(Boolean)
          .join(", ") ||
        address.trim();
      return { longitude, latitude, formattedAddress };
    }
  }
  throw new Error(
    context.requireVerifiedAddress
      ? "Enter a complete, verified street address in the selected service area."
      : "Address could not be verified near the selected service area.",
  );
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
