export function locationErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = Number(error.code);
    if (code === 1)
      return "Location permission was denied. Allow precise location in browser settings and try again.";
    if (code === 2)
      return "Your device could not determine its location. Check GPS and network settings.";
    return "Location request timed out. Move to an open area and try again.";
  }
  return error instanceof Error ? error.message : "Location could not be shared.";
}

export function locationFreshness(recordedAt: string, now = Date.now()) {
  const ageSeconds = Math.max(0, Math.round((now - Date.parse(recordedAt)) / 1000));
  return { ageSeconds, fresh: ageSeconds <= 60 };
}
