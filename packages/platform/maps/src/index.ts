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

export async function reverseGeocodeAddress(
  latitude: number,
  longitude: number,
  accessToken: string,
) {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/reverse");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("types", "address");
  url.searchParams.set("limit", "1");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Your current location could not be converted to an address.");
  const payload = (await response.json()) as {
    features?: Array<{
      properties?: { full_address?: string; name?: string; place_formatted?: string };
    }>;
  };
  const properties = payload.features?.[0]?.properties;
  const formattedAddress = properties?.full_address?.trim() ||
    [properties?.name, properties?.place_formatted].filter(Boolean).join(", ");
  if (!formattedAddress) throw new Error("No street address was found at your current location.");
  return { latitude, longitude, formattedAddress };
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

export type TollCollection = {
  name: string | null;
  type: string;
  latitude?: number | undefined;
  longitude?: number | undefined;
};

export type TollCatalogRow = {
  authorityCode: string;
  authorityName: string;
  facilityId: string;
  facilityCode: string;
  facility: string;
  facilityType: string;
  aliasText: string;
  mapboxType: string | null;
  rateId: string;
  vehicleClass: string;
  paymentMethod: string;
  direction: string;
  amountMinor: number;
  currencyCode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceUrl: string;
  sourceReference: string | null;
  mapboxLatitude?: number | null | undefined;
  mapboxLongitude?: number | null | undefined;
};

export type ResolvedToll = {
  authorityCode: string;
  authorityName: string;
  facilityId: string;
  facilityCode: string;
  facility: string;
  facilityType: string;
  matchedAlias: string;
  rateId: string;
  vehicleClass: string;
  paymentMethod: string;
  direction: string;
  amountMinor: number;
  currencyCode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceUrl: string;
  sourceReference: string | null;
  mapboxLatitude?: number | null | undefined;
  mapboxLongitude?: number | null | undefined;
};

const DEFAULT_TOLL_VEHICLE_CLASS = "passenger_suv";
const DEFAULT_TOLL_PAYMENT_METHOD = "default";

function normalizeTollName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function resolveTollsForRoute({
  pickup,
  destination,
  tollCollections,
  catalog,
  vehicleClass = DEFAULT_TOLL_VEHICLE_CLASS,
  paymentMethod = DEFAULT_TOLL_PAYMENT_METHOD,
}: {
  pickup: Pick<MapPoint, "longitude">;
  destination: Pick<MapPoint, "longitude">;
  tollCollections: TollCollection[];
  catalog: TollCatalogRow[];
  vehicleClass?: string;
  paymentMethod?: string;
}) {
  const direction = destination.longitude < pickup.longitude ? "westbound" : "eastbound";
  const matched = new Set<string>();
  const tolls: ResolvedToll[] = [];
  for (const collection of tollCollections) {
    const normalizedName = collection.name ? normalizeTollName(collection.name) : "";
    const match = catalog.find((candidate) => {
      if (candidate.vehicleClass !== vehicleClass || candidate.paymentMethod !== paymentMethod) return false;
      if (candidate.direction !== direction) return false;
      // Mapbox's toll metadata type is descriptive and can vary between route
      // responses. The normalized facility alias is the pricing identity; keep
      // the catalog type as metadata without making it a false-negative gate.
      const alias = normalizeTollName(candidate.aliasText);
      if (normalizedName && (normalizedName === alias || normalizedName.includes(alias))) return true;
      if (!normalizedName && Number.isFinite(collection.latitude) && Number.isFinite(collection.longitude)
        && Number.isFinite(candidate.mapboxLatitude) && Number.isFinite(candidate.mapboxLongitude)) {
        return coordinateDistanceKm(
          { latitude: collection.latitude as number, longitude: collection.longitude as number },
          { latitude: candidate.mapboxLatitude as number, longitude: candidate.mapboxLongitude as number },
        ) <= 2;
      }
      return false;
    });
    if (!match || matched.has(match.facilityId)) continue;
    matched.add(match.facilityId);
    tolls.push({
      authorityCode: match.authorityCode,
      authorityName: match.authorityName,
      facilityId: match.facilityId,
      facilityCode: match.facilityCode,
      facility: match.facility,
      facilityType: match.facilityType,
      matchedAlias: match.aliasText,
      rateId: match.rateId,
      vehicleClass: match.vehicleClass,
      paymentMethod: match.paymentMethod,
      direction: match.direction,
      amountMinor: match.amountMinor,
      currencyCode: match.currencyCode,
      effectiveFrom: match.effectiveFrom,
      effectiveTo: match.effectiveTo,
      sourceUrl: match.sourceUrl,
      sourceReference: match.sourceReference,
      mapboxLatitude: match.mapboxLatitude,
      mapboxLongitude: match.mapboxLongitude,
    });
  }
  return tolls;
}

export async function routeTripMetrics({
  accessToken,
  pickup,
  destination,
  requestOrigin,
  includeTolls = false,
}: {
  accessToken: string;
  pickup: Pick<MapPoint, "latitude" | "longitude">;
  destination: Pick<MapPoint, "latitude" | "longitude">;
  requestOrigin?: string | undefined;
  includeTolls?: boolean;
}) {
  const coordinates = `${pickup.longitude},${pickup.latitude};${destination.longitude},${destination.latitude}`;
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("overview", "false");
  url.searchParams.set("alternatives", "false");
  const response = await fetch(
    url,
    requestOrigin ? { headers: { Referer: requestOrigin } } : undefined,
  );
  if (!response.ok) throw new Error("A road-route fare estimate is temporarily unavailable.");
  const payload = (await response.json()) as { routes?: Array<{ distance?: number; duration?: number }> };
  const route = payload.routes?.[0];
  if (!route || typeof route.distance !== "number" || typeof route.duration !== "number")
    throw new Error("A road-route fare estimate is temporarily unavailable.");
  const distanceMeters = Math.round(route.distance);
  const durationSeconds = Math.round(route.duration);
  if (distanceMeters <= 0 || durationSeconds <= 0)
    throw new Error("A valid road route is required for pricing.");
  if (!includeTolls) return { distanceMeters, durationSeconds };

  // Mapbox exposes toll collection points on its non-traffic driving profile.
  // Keep the traffic-aware route as the fare route and use this metadata-only
  // request to identify preset tolls without inventing a toll amount.
  const tollUrl = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}`);
  tollUrl.searchParams.set("access_token", accessToken);
  tollUrl.searchParams.set("overview", "false");
  tollUrl.searchParams.set("steps", "true");
  tollUrl.searchParams.set("alternatives", "false");
  const tollResponse = await fetch(
    tollUrl,
    requestOrigin ? { headers: { Referer: requestOrigin } } : undefined,
  );
  if (!tollResponse.ok) throw new Error("Toll-aware road pricing is temporarily unavailable.");
  const tollPayload = (await tollResponse.json()) as {
    routes?: Array<{
      legs?: Array<{
        steps?: Array<{
          intersections?: Array<{
            location?: [number, number];
            toll_collection?: { name?: string; type?: string };
          }>;
        }>;
      }>;
    }>;
  };
  const seen = new Set<string>();
  const tollCollections: TollCollection[] = [];
  for (const leg of tollPayload.routes?.[0]?.legs ?? []) {
    for (const step of leg.steps ?? []) {
      for (const intersection of step.intersections ?? []) {
        const collection = intersection.toll_collection;
        if (!collection) continue;
        const type = collection.type?.trim() || "toll_collection";
        const name = collection.name?.trim() || null;
        const key = `${type}:${name ?? "unnamed"}`;
        if (seen.has(key)) continue;
        seen.add(key);
        tollCollections.push({
          name,
          type,
          longitude: intersection.location?.[0],
          latitude: intersection.location?.[1],
        });
      }
    }
  }
  return { distanceMeters, durationSeconds, tollCollections };
}
