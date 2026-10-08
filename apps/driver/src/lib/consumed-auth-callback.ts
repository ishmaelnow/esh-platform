const storageKey = "esh-driver-consumed-auth-callbacks";

// Persist only SHA-256 fingerprints, never magic links or credentials. Android
// can retain an Activity's original launch intent across WebView reloads.
export async function driverCallbackReceipt(url: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const read = (): string[] => {
    try {
      const value: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && /^[a-f0-9]{64}$/.test(item)).slice(-16) : [];
    } catch { return []; }
  };
  return {
    consumed: read().includes(fingerprint),
    commit() {
      window.localStorage.setItem(storageKey, JSON.stringify([...read().filter((item) => item !== fingerprint), fingerprint].slice(-16)));
    },
  };
}
