import { Capacitor } from "@capacitor/core";

export function pushSupported() {
  return !Capacitor.isNativePlatform() && typeof window !== "undefined" && window.isSecureContext
    && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function pushUnavailableMessage() {
  if (Capacitor.isNativePlatform())
    return "Browser push is not available inside the installed app. Native mobile alerts require the upcoming APNs/FCM connection; email and verified text alerts remain available.";
  if (typeof window !== "undefined" && !window.isSecureContext)
    return "Browser alerts require a secure HTTPS connection.";
  return "This browser does not support push alerts. Try the Rider portal in a current browser that supports notifications.";
}
export function vapidApplicationKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}
export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.register("/push-sw.js");
  return registration.pushManager.getSubscription();
}
