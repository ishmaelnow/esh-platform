import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ platform: "android", available: true,
  get: vi.fn(), set: vi.fn(), remove: vi.fn() }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => mocks.platform, isPluginAvailable: () => mocks.available },
  registerPlugin: () => ({ get: mocks.get, set: mocks.set, remove: mocks.remove }),
}));
import { riderAndroidStorage } from "./android-session-storage";
const key = "esh-rider-portal-auth";
let legacy: Map<string, string>;
beforeEach(() => {
  vi.clearAllMocks(); mocks.platform = "android"; mocks.available = true;
  mocks.get.mockResolvedValue({ value: null }); mocks.set.mockResolvedValue(undefined); mocks.remove.mockResolvedValue(undefined);
  legacy = new Map();
  vi.stubGlobal("window", { localStorage: {
    getItem: (name: string) => legacy.get(name) ?? null,
    removeItem: (name: string) => legacy.delete(name),
  } });
});
describe("Android Rider session persistence", () => {
  it("preserves iOS, browser and older-shell storage", () => {
    mocks.platform = "ios"; expect(riderAndroidStorage()).toBeUndefined();
    mocks.platform = "web"; expect(riderAndroidStorage()).toBeUndefined();
    mocks.platform = "android"; mocks.available = false; expect(riderAndroidStorage()).toBeUndefined();
  });
  it("recovers native session independently of cleared WebView storage", async () => {
    mocks.get.mockResolvedValue({ value: "native-session" });
    expect(await riderAndroidStorage()!.getItem(key)).toBe("native-session");
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("migrates existing session and PKCE verifier only after a confirmed native write", async () => {
    legacy.set(key, "legacy-session");
    expect(await riderAndroidStorage()!.getItem(key)).toBe("legacy-session");
    expect(mocks.set).toHaveBeenCalledWith({ key, value: "legacy-session" }); expect(legacy.has(key)).toBe(false);
    const verifier = `${key}-code-verifier`; legacy.set(verifier, "verifier");
    expect(await riderAndroidStorage()!.getItem(verifier)).toBe("verifier");
  });
  it("retains old data on save failure and never silently treats vault failure as signed-out", async () => {
    legacy.set(key, "legacy-session"); mocks.set.mockRejectedValue(new Error("Save failed"));
    await expect(riderAndroidStorage()!.getItem(key)).rejects.toThrow("Save failed"); expect(legacy.get(key)).toBe("legacy-session");
    mocks.get.mockRejectedValue(new Error("Read failed"));
    await expect(riderAndroidStorage()!.getItem(key)).rejects.toThrow("Read failed");
  });
  it("updates rotated sessions and removes both stores on explicit sign-out", async () => {
    legacy.set(key, "old"); await riderAndroidStorage()!.setItem(key,"rotated");
    expect(mocks.set).toHaveBeenCalledWith({key,value:"rotated"}); expect(legacy.has(key)).toBe(false);
    legacy.set(key,"old"); await riderAndroidStorage()!.removeItem(key);
    expect(mocks.remove).toHaveBeenCalledWith({key}); expect(legacy.has(key)).toBe(false);
    expect(await riderAndroidStorage()!.getItem("other-app")).toBeNull();
  });
});
