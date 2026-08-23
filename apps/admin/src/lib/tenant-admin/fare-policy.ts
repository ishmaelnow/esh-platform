export type FarePolicy = "guaranteed_upfront" | "metered_actual" | "protected_flexible";

export function farePolicyLabel(policy: string) {
  if (policy === "legacy_comparison") return "Legacy comparison";
  if (policy === "metered_actual") return "Metered actual fare";
  if (policy === "protected_flexible") return "Protected flexible fare";
  return "Guaranteed upfront fare";
}

export function contractFareMinor({ policy, quotedFareMinor, actualFareMinor, maximumFareMinor }: {
  policy: FarePolicy; quotedFareMinor: number; actualFareMinor: number; maximumFareMinor?: number | null;
}) {
  if (policy === "guaranteed_upfront") return quotedFareMinor;
  if (policy === "metered_actual") return actualFareMinor;
  if (actualFareMinor < quotedFareMinor) return actualFareMinor;
  return Math.min(actualFareMinor, maximumFareMinor ?? quotedFareMinor);
}
