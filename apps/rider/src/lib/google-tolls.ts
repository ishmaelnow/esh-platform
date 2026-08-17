export type GoogleTollEstimate = {
  source: "google_routes";
  provider: "Google Routes API";
  facility: "Google estimated toll";
  amountMinor: number;
  currencyCode: string;
  estimated: true;
  sourceUrl: string;
};

type Point = { latitude: number; longitude: number };

function moneyToMinor(money: { currencyCode?: string; units?: string; nanos?: number }) {
  if (money.currencyCode !== "USD") return null;
  const units = Number(money.units ?? "0");
  const nanos = Number(money.nanos ?? 0);
  if (!Number.isSafeInteger(units) || !Number.isFinite(nanos) || nanos < 0 || nanos >= 1_000_000_000) return null;
  const amountMinor = units * 100 + Math.round(nanos / 10_000_000);
  return Number.isSafeInteger(amountMinor) && amountMinor > 0 ? amountMinor : null;
}

export async function estimateGoogleToll(apiKey: string, origin: Point, destination: Point) {
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
      "x-goog-fieldmask": "routes.travelAdvisory.tollInfo",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
      destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
      travelMode: "DRIVE",
      extraComputations: ["TOLLS"],
      routeModifiers: { vehicleInfo: { emissionType: "GASOLINE" } },
    }),
  });
  if (!response.ok) {
    let googleStatus: string | undefined;
    let googleMessage: string | undefined;
    try {
      const errorPayload = await response.json() as { error?: { status?: string; message?: string } };
      googleStatus = errorPayload.error?.status;
      googleMessage = errorPayload.error?.message;
    } catch {
      // Keep the client-facing error generic if Google does not return JSON.
    }
    console.error("Google Routes toll request failed", {
      httpStatus: response.status,
      googleStatus,
      googleMessage,
    });
    const providerCode = googleStatus ? ` ${googleStatus}` : "";
    const detail = googleMessage ? `: ${googleMessage.slice(0, 240)}` : "";
    throw new Error(`Google toll pricing is temporarily unavailable (${response.status}${providerCode})${detail}`);
  }
  const payload = await response.json() as {
    routes?: Array<{ travelAdvisory?: { tollInfo?: { estimatedPrice?: Array<{ currencyCode?: string; units?: string; nanos?: number }> } } }>;
  };
  const prices = payload.routes?.[0]?.travelAdvisory?.tollInfo?.estimatedPrice ?? [];
  const amounts = prices.map(moneyToMinor);
  if (amounts.some((amount) => amount === null)) throw new Error("Google returned an unavailable toll estimate.");
  const amountMinor = amounts.reduce<number>((total, amount) => total + (amount ?? 0), 0);
  return amountMinor > 0 ? {
    source: "google_routes" as const,
    provider: "Google Routes API" as const,
    facility: "Google estimated toll" as const,
    amountMinor,
    currencyCode: "USD",
    estimated: true as const,
    sourceUrl: "https://developers.google.com/maps/documentation/routes/calculate_toll_fees",
  } satisfies GoogleTollEstimate : null;
}
