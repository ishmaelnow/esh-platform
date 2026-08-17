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
      origin: { location: { latLng: origin } },
      destination: { location: { latLng: destination } },
      travelMode: "DRIVE",
      extraComputations: ["TOLLS"],
      routeModifiers: { vehicleInfo: { emissionType: "GASOLINE" } },
    }),
  });
  if (!response.ok) throw new Error("Google toll pricing is temporarily unavailable.");
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
