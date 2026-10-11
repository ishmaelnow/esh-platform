"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";
import { createNativePushController, nativePushInstallation } from "@esh-platform/supabase";
import type { NativePushState, PlatformSupabaseClient } from "@esh-platform/supabase";

export type NativePushController = ReturnType<typeof createNativePushController>;
export type NativePushViewState = NativePushState & { ready: boolean };
export function NativePushControl({ client, userId, tenantSlug, controllerRef, onOpen, onState }: {
  client: PlatformSupabaseClient; userId: string; tenantSlug: string | null;
  controllerRef: RefObject<NativePushController | null>; onOpen: (data: unknown) => void;
  onState: (value: NativePushViewState) => void;
}) {
  const open = useRef(onOpen); open.current = onOpen;
  useEffect(() => {
    let cancelled = false;
    let controller: NativePushController | null = null;
    onState({ ready: false, enabled: false, busy: true, message: "Checking device alerts…" });
    const prepare = async () => {
      if (process.env.NEXT_PUBLIC_NATIVE_PUSH_ENABLED !== "true")
        throw new Error("Mobile alerts are not available yet. Email and text settings remain available.");
      const info = await App.getInfo();
      const [major, minor, patch] = info.version.split(".").map(Number);
      const minimum = "1.0.3".split(".").map(Number);
      if (info.id !== "com.esh.rider" || !Number.isFinite(patch)
        || (major! * 10000 + minor! * 100 + patch!) < (minimum[0]! * 10000 + minimum[1]! * 100 + minimum[2]!)
        || !Capacitor.isPluginAvailable("PushNotifications"))
        throw new Error("Update ESH Rider to enable mobile alerts.");
      if (cancelled) return;
      if (Capacitor.getPlatform() === "android") await PushNotifications.createChannel({
        id: "esh_updates", name: "ESH updates", description: "Trip and account updates", importance: 4, visibility: 0 });
      if (cancelled) return;
      controller = createNativePushController({ client, product: "rider",
        platform: Capacitor.getPlatform() === "ios" ? "ios" : "android",
        installationId: nativePushInstallation("rider", localStorage), userId, tenantSlug,
        update: (value) => { if (!cancelled) onState({ ...value, ready: true }); }, open: (data) => open.current(data),
        bridge: {
          permission: async (prompt) => {
            let status = await PushNotifications.checkPermissions();
            if (prompt && (status.receive === "prompt" || status.receive === "prompt-with-rationale"))
              status = await PushNotifications.requestPermissions();
            return status.receive === "granted";
          },
          register: () => PushNotifications.register(),
          unregister: async () => {
            await PushNotifications.unregister();
            await PushNotifications.removeAllDeliveredNotifications();
          },
          onToken: (callback) => PushNotifications.addListener("registration", ({ value }) => callback(value)),
          onError: (callback) => PushNotifications.addListener("registrationError", () => callback()),
          onTap: (callback) => PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => callback(notification.data as unknown)),
          onResume: (callback) => App.addListener("appStateChange", ({ isActive }) => { if (isActive) callback(); }),
        },
      });
      controllerRef.current = controller;
      await controller.initialize();
    };
    void prepare().catch((error: unknown) => {
      if (!cancelled) onState({ ready: false, enabled: false, busy: false,
        message: error instanceof Error ? error.message : "Device alerts are unavailable." });
    });
    return () => {
      cancelled = true; controller?.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [client, controllerRef, onState, tenantSlug, userId]);
  return null;
}
