import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

export function usesAndroidDocumentCamera() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function captureAndroidDocument(): Promise<File | null> {
  if (!Capacitor.isPluginAvailable("Camera")) {
    throw new Error("Install the latest ESH Driver Android update to take photos. You can still choose a file.");
  }
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.DataUrl,
      quality: 85,
      width: 1600,
      height: 1600,
      correctOrientation: true,
      allowEditing: false,
      saveToGallery: false,
    });
    if (!photo.dataUrl?.startsWith("data:image/jpeg;base64,")) {
      throw new Error("Camera returned an unreadable photo.");
    }
    const encoded = photo.dataUrl.split(",")[1];
    if (!encoded || encoded.length > 8_000_000) throw new Error("Camera photo is unreadable or too large.");
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    return new File([bytes], "driver-camera.jpg", { type: "image/jpeg" });
  } catch (error) {
    const message = error instanceof Error ? error.message
      : typeof error === "object" && error && "message" in error ? String(error.message) : "";
    if (/cancelled|canceled/i.test(message)) return null;
    if (/permission|denied/i.test(message)) {
      throw new Error("Camera access was denied. Check Android app permissions or choose a file.");
    }
    throw new Error("Camera could not take a photo. Try again or use Choose file; existing files have not changed.");
  }
}
