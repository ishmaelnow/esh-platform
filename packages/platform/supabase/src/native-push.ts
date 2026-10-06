import type { PlatformSupabaseClient } from "./index";

export type NativePushProduct = "rider" | "driver";
export type NativePushBridge = {
  permission: (prompt: boolean) => Promise<boolean>;
  register: () => Promise<void>;
  unregister: () => Promise<void>;
  onToken: (callback: (token: string) => void) => Promise<{ remove: () => Promise<void> }>;
  onError: (callback: () => void) => Promise<{ remove: () => Promise<void> }>;
  onTap: (callback: (data: unknown) => void) => Promise<{ remove: () => Promise<void> }>;
  onResume?: (callback: () => void) => Promise<{ remove: () => Promise<void> }>;
};
export type NativePushState = { enabled: boolean; busy: boolean; message: string };
export function nativePushTapAllowed(data: unknown, product: NativePushProduct, tenantSlug: string | null) {
  if (!data || typeof data !== "object") return false;
  const value = data as Record<string, unknown>;
  return value.product === product && (product === "driver" || value.tenantSlug === tenantSlug);
}
export function nativePushInstallation(product: NativePushProduct, storage: Pick<Storage, "getItem" | "setItem">,
  randomId: () => string = () => crypto.randomUUID()) {
  const key = `esh.${product}.native-push-installation.v1`;
  const existing = storage.getItem(key);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const id = randomId(); storage.setItem(key, id); return id;
}

// Device tokens stay in memory. Persistent storage contains only a nonsecret installation UUID.
export function createNativePushController(options: {
  client: PlatformSupabaseClient; bridge: NativePushBridge; product: NativePushProduct;
  platform: "ios" | "android"; installationId: string; userId: string; tenantSlug: string | null;
  update: (state: NativePushState) => void; open: () => void;
}) {
  const { client, bridge, product, platform, installationId, userId, tenantSlug, update } = options;
  let disposed = false; let enabled = false; let wanted = false; let busy = false;
  let message = "Device alerts are off.";
  let operation = Promise.resolve();
  let finishRegistration: ((error?: Error) => void) | null = null;
  let registrationTimer: ReturnType<typeof setTimeout> | null = null;
  const handles: Array<{ remove: () => Promise<void> }> = [];
  const report = (value: string) => { message = value; if (!disposed) update({ enabled, busy, message }); };
  const args = { product_value: product, installation_value: installationId, platform_value: platform,
    tenant_slug_value: tenantSlug, owner_auth_user_value: userId };
  const disableServer = async () => {
    const result = await client.rpc("set_my_native_push", { ...args, enabled_value: false });
    if (result.error) throw new Error("Alerts could not be disabled. Check your connection and try again.");
  };
  const tokenReceived = (token: string) => {
    operation = operation.then(async () => {
      if (disposed || !wanted) return;
      const result = await client.rpc("set_my_native_push", { ...args, enabled_value: true, token_value: token });
      if (result.error || result.data !== true) throw new Error("Device alerts could not be registered. Check your connection and try again.");
      if (disposed || !wanted) { await disableServer(); return; }
      enabled = true;
      finishRegistration?.();
      report("Device alerts are on.");
    }).catch((error: unknown) => {
      enabled = false; wanted = false;
      const failure = error instanceof Error ? error : new Error("Device alerts could not be registered.");
      finishRegistration?.(failure);
      report(failure.message);
    });
  };
  const addHandle = async (promise: Promise<{ remove: () => Promise<void> }>) => {
    const handle = await promise;
    if (disposed) await handle.remove(); else handles.push(handle);
  };
  const startRegistration = async (prompt: boolean) => {
    if (!await bridge.permission(prompt)) {
      await disableServer(); enabled = false;
      throw new Error("Notifications are blocked. Allow them in your device settings, then try again.");
    }
    if (disposed) return;
    wanted = true;
    await new Promise<void>((resolve, reject) => {
      finishRegistration = (error) => {
        if (registrationTimer) clearTimeout(registrationTimer);
        registrationTimer = null; finishRegistration = null;
        if (error) reject(error); else resolve();
      };
      registrationTimer = setTimeout(() => finishRegistration?.(new Error("Registration timed out. Check your connection or update the app, then try again.")), 15000);
      void bridge.register().catch(() => finishRegistration?.(new Error("This app could not register for notifications. Update the app and try again.")));
    });
  };
  const refresh = async () => {
    if (disposed || busy || !enabled) return;
    busy = true; report("Checking device alerts…");
    try {
      const result = await client.rpc("my_native_push_enabled", { product_value: product,
        installation_value: installationId, tenant_slug_value: tenantSlug });
      if (result.error) throw new Error("Device alert settings could not be refreshed. Check your connection.");
      if (!result.data) {
        wanted = false; enabled = false; await bridge.unregister().catch(() => undefined);
        report("Device alerts are off.");
      } else await startRegistration(false);
    } catch (error) { report(error instanceof Error ? error.message : "Device alerts could not be refreshed."); }
    finally { busy = false; report(message); }
  };
  return {
    async initialize() {
      busy = true; report("Checking device alerts…");
      try {
        await addHandle(bridge.onToken(tokenReceived));
        await addHandle(bridge.onError(() => finishRegistration?.(new Error("Device registration failed. Check your connection and try again."))));
        await addHandle(bridge.onTap((data) => {
          if (!disposed && nativePushTapAllowed(data, product, tenantSlug)) options.open();
        }));
        if (bridge.onResume) await addHandle(bridge.onResume(() => { void refresh(); }));
        if (disposed) return;
        const result = await client.rpc("my_native_push_enabled", { product_value: product,
          installation_value: installationId, tenant_slug_value: tenantSlug });
        if (result.error) throw new Error("Device alert settings are unavailable. Try again when connected.");
        if (result.data && !disposed) await startRegistration(false);
        else if (!disposed) await bridge.unregister().catch(() => undefined);
        report(enabled ? "Device alerts are on." : "Enable alerts on this device.");
      } catch (error) {
        wanted = false; enabled = false;
        report(error instanceof Error ? error.message : "Device alerts are unavailable.");
      } finally { busy = false; report(message); }
    },
    async setEnabled(value: boolean) {
      if (disposed || busy) return;
      busy = true; report(value ? "Enabling device alerts…" : "Disabling device alerts…");
      try {
        if (value) await startRegistration(true);
        else {
          wanted = false;
          await operation;
          await disableServer(); enabled = false;
          await bridge.unregister().catch(() => undefined);
        }
        report(enabled ? "Device alerts are on." : "Device alerts are off.");
      } catch (error) {
        wanted = false;
        if (value) enabled = false;
        report(error instanceof Error ? error.message : "Device alerts could not be updated.");
        throw error;
      } finally { busy = false; report(message); }
    },
    async beforeSignOut() {
      wanted = false;
      finishRegistration?.(new Error("Registration cancelled."));
      await operation;
      await disableServer(); enabled = false;
      await bridge.unregister().catch(() => undefined);
    },
    dispose() {
      disposed = true; wanted = false;
      finishRegistration?.(new Error("Registration cancelled."));
      for (const handle of handles) void handle.remove().catch(() => undefined);
    },
  };
}
