import { coordinateDistanceKm, validCoordinates } from "./index";

export type StudentStop = {
  address: string;
  latitude: number;
  longitude: number;
  addressLatitude: number;
  addressLongitude: number;
  accuracy: string;
  pointSource: "routable" | "address";
  loadingInstructions: string;
  safetyStatus: "unreviewed";
};
export type StudentRoadRoute = {
  geometry: { type: "LineString"; coordinates: number[][] };
  distanceMeters: number;
  durationSeconds: number;
};

// Student-only adapter: existing two-point booking helpers keep their behavior.
export async function resolveStudentStop(
  address: string,
  hint: { latitude: number; longitude: number },
  loadingInstructions: string,
  token: string,
  signal: AbortSignal,
  origin?: string,
) {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  Object.entries({
    q: address,
    access_token: token,
    country: "us",
    types: "address",
    limit: "5",
    autocomplete: "false",
    permanent: "true",
    proximity: `${hint.longitude},${hint.latitude}`,
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    ...(origin ? { headers: { Referer: origin } } : {}),
  });
  if (!response.ok) throw Error("Address verification unavailable");
  const payload = (await response.json()) as {
    features?: Array<{
      geometry?: { coordinates?: number[] };
      properties?: {
        full_address?: string;
        feature_type?: string;
        match_code?: { confidence?: string };
        coordinates?: {
          accuracy?: string;
          routable_points?: Array<{ name?: string; latitude?: number; longitude?: number }>;
        };
      };
    }>;
  };
  for (const feature of payload.features ?? []) {
    const p = feature.properties;
    const [longitude, latitude] = feature.geometry?.coordinates ?? [];
    if (
      p?.feature_type !== "address" ||
      !["exact", "high"].includes(p.match_code?.confidence ?? "") ||
      !["rooftop", "parcel", "point"].includes(p.coordinates?.accuracy ?? "") ||
      !validCoordinates(latitude, longitude) ||
      !p.full_address ||
      p.full_address.length > 400 ||
      coordinateDistanceKm(hint, { latitude, longitude: longitude! }) > 0.25
    )
      continue;
    const road = p.coordinates?.routable_points?.find(
      (r) =>
        r.name === "default" &&
        validCoordinates(r.latitude, r.longitude) &&
        coordinateDistanceKm(
          { latitude, longitude: longitude! },
          { latitude: r.latitude, longitude: r.longitude! },
        ) <= 0.25,
    );
    return {
      address: p.full_address,
      latitude: road?.latitude ?? latitude,
      longitude: road?.longitude ?? longitude!,
      addressLatitude: latitude,
      addressLongitude: longitude!,
      accuracy: p.coordinates!.accuracy!,
      pointSource: road ? "routable" : "address",
      loadingInstructions,
      safetyStatus: "unreviewed",
    } satisfies StudentStop;
  }
  throw Error("Select a precise street address; broad or uncertain locations cannot be used");
}

export async function studentRoadRoute(
  stops: StudentStop[],
  token: string,
  signal: AbortSignal,
  origin?: string,
): Promise<StudentRoadRoute> {
  if (
    stops.length < 2 ||
    stops.length > 21 ||
    stops.some((s) => !validCoordinates(s.latitude, s.longitude))
  )
    throw Error("Invalid stops");
  const coordinates = stops.map((s) => `${s.longitude},${s.latitude}`).join(";");
  // driving supports all 21 intake stops; traffic profile has a smaller waypoint limit.
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}`);
  Object.entries({
    access_token: token,
    geometries: "geojson",
    overview: "full",
    alternatives: "false",
    steps: "false",
    approaches: stops.map(() => "curb").join(";"),
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    ...(origin ? { headers: { Referer: origin } } : {}),
  });
  if (!response.ok) throw Error("Road route unavailable");
  const payload = (await response.json()) as {
    routes?: Array<{
      geometry?: StudentRoadRoute["geometry"];
      distance?: number;
      duration?: number;
    }>;
    waypoints?: Array<{ distance?: number }>;
  };
  const route = payload.routes?.[0];
  if (
    !route?.geometry ||
    route.geometry.type !== "LineString" ||
    route.geometry.coordinates.length < 2 ||
    route.geometry.coordinates.length > 50000 ||
    route.geometry.coordinates.some((p) => p.length !== 2 || !validCoordinates(p[1], p[0])) ||
    !Number.isFinite(route.distance) ||
    !Number.isFinite(route.duration) ||
    route.distance! <= 0 ||
    route.duration! <= 0 ||
    payload.waypoints?.length !== stops.length ||
    payload.waypoints.some((w) => !Number.isFinite(w.distance) || w.distance! > 100)
  )
    throw Error("No road route sufficiently close to the selected stops");
  return {
    geometry: route.geometry,
    distanceMeters: Math.round(route.distance!),
    durationSeconds: Math.round(route.duration!),
  };
}
