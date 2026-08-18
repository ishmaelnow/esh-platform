export type NavigationPlatform = "android" | "ios" | "web";

export function buildNavigationUrl(
  platform: NavigationPlatform,
  destination: { latitude: number; longitude: number; label?: string },
) {
  const coordinate = `${destination.latitude},${destination.longitude}`;
  if (platform === "android") {
    return `geo:0,0?q=${encodeURIComponent(`${coordinate} (${destination.label ?? "ESH destination"})`)}`;
  }
  if (platform === "ios") return `maps://?daddr=${encodeURIComponent(coordinate)}&dirflg=d`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordinate)}&travelmode=driving`;
}
