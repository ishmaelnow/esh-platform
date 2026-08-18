import { Capacitor, registerPlugin } from "@capacitor/core";
import { buildNavigationUrl, type NavigationPlatform } from "./navigation";

type EmbeddedNavigationPlugin = {
  startNavigation(options: {
    latitude: number;
    longitude: number;
    label: string;
    accessToken: string;
  }): Promise<{ started: boolean }>;
};

const EmbeddedNavigation = registerPlugin<EmbeddedNavigationPlugin>("EmbeddedNavigation");

export async function openDriverNavigation(destination: {
  latitude: number;
  longitude: number;
  label: string;
}, accessToken: string | undefined) {
  const platform = Capacitor.getPlatform() as NavigationPlatform;
  if (Capacitor.isNativePlatform() && platform === "android" && accessToken) {
    try {
      await EmbeddedNavigation.startNavigation({ ...destination, accessToken });
      return;
    } catch {
      // Keep navigation usable if an older installed APK does not contain the plugin.
    }
  }
  window.location.assign(buildNavigationUrl(platform === "ios" ? "ios" : platform === "android" ? "android" : "web", destination));
}
