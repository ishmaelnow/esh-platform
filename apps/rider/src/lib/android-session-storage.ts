import { Capacitor, registerPlugin } from "@capacitor/core";

type Vault = {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
};
const vault = registerPlugin<Vault>("RiderSessionStorage");
const rootKey = "esh-rider-portal-auth";

// Existing shells keep their established WebView storage until the native update is installed.
// iOS and ordinary browsers never switch storage or authentication behavior.
export function riderAndroidStorage() {
  if (Capacitor.getPlatform() !== "android" || !Capacitor.isPluginAvailable("RiderSessionStorage")) return undefined;
  return {
    async getItem(key: string) {
      if (key !== rootKey && key !== `${rootKey}-code-verifier`) return null;
      const { value } = await vault.get({ key });
      if (value !== null) return value;
      const legacy = window.localStorage.getItem(key);
      if (legacy !== null) {
        // Keep legacy data until durable native storage confirms the migration.
        await vault.set({ key, value: legacy });
        window.localStorage.removeItem(key);
      }
      return legacy;
    },
    async setItem(key: string, value: string) {
      await vault.set({ key, value });
      window.localStorage.removeItem(key);
    },
    async removeItem(key: string) {
      await vault.remove({ key });
      window.localStorage.removeItem(key);
    },
  };
}
