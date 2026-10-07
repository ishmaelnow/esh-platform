import { Capacitor } from "@capacitor/core";
import { buildNavigationUrl, type NavigationPlatform } from "./navigation";

export function openDriverNavigation(destination: {
  latitude: number;
  longitude: number;
  label: string;
}) {
  const platform = Capacitor.getPlatform() as NavigationPlatform;
  // Use installed navigation apps on both mobile platforms; no native Mapbox token is needed.
  window.location.assign(buildNavigationUrl(platform === "ios" ? "ios" : platform === "android" ? "android" : "web", destination));
}
