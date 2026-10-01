import { NextResponse } from "next/server";
import { geocodePermanentAddress, resolveTollsForRoute, routeTripMetrics, validCoordinates } from "@esh-platform/maps";
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient, type Json } from "@esh-platform/supabase";
import { loadTollCatalog } from "../../../../lib/toll-pricing";
import { estimateGoogleToll } from "../../../../lib/google-tolls";
import { resolveRideCoverage, type CoverageArea } from "../../../../lib/service-coverage";

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required.");
    const body = (await request.json()) as Record<string, unknown>;
    const tenantSlug = requiredText(body.tenantSlug, "Tenant");
    const requestedAreaId = typeof body.serviceAreaId === "string" ? body.serviceAreaId : "";
    const pickupAddress = requiredText(body.pickupAddress, "Pickup address");
    const destinationAddress = requiredText(body.destinationAddress, "Destination address");
    const serviceType = ["standard", "larger", "premium", "accessible"].includes(String(body.serviceType)) ? String(body.serviceType) : "standard";
    const authenticated = createAuthenticatedSupabaseClient(authorization.slice(7));
    const portalResult = await authenticated.rpc("my_rider_portal", { target_tenant_slug: tenantSlug });
    if (portalResult.error || !portalResult.data) throw portalResult.error ?? new Error("Rider profile is unavailable.");
    const portal = portalResult.data as unknown as { profile: { riderProfileId: string } | null; serviceAreas: Array<{ serviceAreaId: string }> };
    if (!portal.profile) throw new Error("Create your Rider profile before requesting a fare.");
    const authorizedIds = portal.serviceAreas.map((area) => area.serviceAreaId);
    if (requestedAreaId && !authorizedIds.includes(requestedAreaId)) throw new Error("Service area is unavailable.");
    const areas = await Promise.all((requestedAreaId ? [requestedAreaId] : authorizedIds).map(async (id) => {
      const { data, error } = await authenticated.rpc("my_rider_service_area_context", {
        target_tenant_slug: tenantSlug, target_service_area_id: id,
      });
      if (error || !data) throw error ?? new Error("Service coverage is unavailable.");
      return { ...(data as unknown as CoverageArea), serviceAreaId: id };
    }));
    if (!areas.length) throw new Error("No service coverage is available for this provider.");
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!mapboxToken) throw new Error("Trip pricing maps are temporarily unavailable.");
    const pickupHint = body.pickupCoordinates as { latitude?: unknown; longitude?: unknown } | undefined;
    const destinationHint = body.destinationCoordinates as { latitude?: unknown; longitude?: unknown } | undefined;
    if (!requestedAreaId && (!validCoordinates(pickupHint?.latitude, pickupHint?.longitude) || !validCoordinates(destinationHint?.latitude, destinationHint?.longitude)))
      throw new Error("Choose verified pickup and destination addresses before reviewing your fare.");
    // Client coordinates bias disambiguation only. Permanent server geocoding determines coverage.
    const pickupContext = validCoordinates(pickupHint?.latitude, pickupHint?.longitude)
      ? { latitude: pickupHint.latitude, longitude: pickupHint.longitude as number } : areas[0]!;
    const destinationContext = validCoordinates(destinationHint?.latitude, destinationHint?.longitude)
      ? { latitude: destinationHint.latitude, longitude: destinationHint.longitude as number } : areas[0]!;
    const [pickup, destination] = await Promise.all([
      geocodePermanentAddress(pickupAddress, mapboxToken, {
        ...pickupContext, maxDistanceKm: requestedAreaId ? areas[0]!.radiusKm : 800, requireVerifiedAddress: true,
        requestOrigin: request.headers.get("origin") ?? undefined,
      }),
      geocodePermanentAddress(destinationAddress, mapboxToken, {
        ...destinationContext, requestOrigin: request.headers.get("origin") ?? undefined,
      }),
    ]);
    const area = resolveRideCoverage(areas, pickup, destination);
    const serviceAreaId = area.serviceAreaId;
    const route = await routeTripMetrics({
      accessToken: mapboxToken, pickup, destination,
      requestOrigin: request.headers.get("origin") ?? undefined,
      includeTolls: true,
    });
    const tollCollections = route.tollCollections ?? [];
    const service = createServiceSupabaseClient();
    const catalog = await loadTollCatalog(service);
    const tolls = resolveTollsForRoute({ pickup, destination, tollCollections, catalog });
    let quoteTolls: Array<{ amountMinor: number; [key: string]: unknown }> = tolls.map((toll) => ({ ...toll }));
    if (tollCollections.length > 0 && tolls.length === 0 && process.env.GOOGLE_MAPS_API_KEY) {
      const googleToll = await estimateGoogleToll(process.env.GOOGLE_MAPS_API_KEY, pickup, destination);
      if (googleToll) quoteTolls = [googleToll];
    }
    if (tollCollections.length > 0 && quoteTolls.length === 0) {
      const detectedFacilities = tollCollections
        .map((collection) => collection.name ? `${collection.name} (${collection.type})` : `unnamed (${collection.type})`)
        .join(", ");
      throw new Error(`This route uses a toll facility that is not yet configured for pricing. Detected: ${detectedFacilities}.`);
    }
    const tollAmountMinor = quoteTolls.reduce((total: number, toll) => total + toll.amountMinor, 0);
    const quoteResult = await service.rpc("create_rider_price_quote_with_service_type", {
      target_rider_profile_id: portal.profile.riderProfileId,
      target_service_area_id: serviceAreaId,
      pickup_address_value: pickup.formattedAddress,
      destination_address_value: destination.formattedAddress,
      pickup_latitude_value: pickup.latitude,
      pickup_longitude_value: pickup.longitude,
      destination_latitude_value: destination.latitude,
      destination_longitude_value: destination.longitude,
      route_distance_meters_value: route.distanceMeters,
      route_duration_seconds_value: route.durationSeconds,
      toll_amount_minor_value: tollAmountMinor,
      toll_snapshot_value: quoteTolls as unknown as Json,
      service_type_value: serviceType,
    }) as unknown as { data: unknown; error: { message: string } | null };
    const { data, error } = quoteResult;
    if (error || !data) throw new Error(error?.message ?? "Fare quote could not be created.");
    const quote = data as unknown as { currencyCode: string };
    const currency = await service.from("currency_codes").select("fraction_digits")
      .eq("currency_code", quote.currencyCode).single();
    if (currency.error || !currency.data) throw currency.error ?? new Error("Fare currency is unavailable.");
    const currencyData = currency.data as unknown as { fraction_digits: number };
    return NextResponse.json({ ...(data as Record<string, unknown>), serviceAreaId, fractionDigits: currencyData.fraction_digits });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Fare quote could not be created." },
      { status: 400 },
    );
  }
}
