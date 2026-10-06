import { describe, expect, it, vi } from "vitest";
import type { PlatformSupabaseClient } from "./index";
import { createNativePushController, nativePushInstallation, nativePushTapAllowed } from "./native-push";
import type { NativePushBridge, NativePushState } from "./native-push";

function setup(existing = false) {
  let receiveToken: (value: string) => void = () => undefined;
  let tap: (value: unknown) => void = () => undefined;
  const remove = vi.fn(() => Promise.resolve());
  const rpc = vi.fn((name: string) => Promise.resolve({ data: name === "my_native_push_enabled" ? existing : true, error: null as unknown }));
  const bridge: NativePushBridge = {
    permission: vi.fn(() => Promise.resolve(true)), unregister: vi.fn(() => Promise.resolve()),
    register: vi.fn(() => { receiveToken("fixture-device-token"); return Promise.resolve(); }),
    onToken: vi.fn((callback: (value: string) => void) => { receiveToken = callback; return Promise.resolve({ remove }); }),
    onError: vi.fn(() => Promise.resolve({ remove })),
    onTap: vi.fn((callback: (value: unknown) => void) => { tap = callback; return Promise.resolve({ remove }); }),
  };
  const states: NativePushState[] = [];
  const open = vi.fn();
  const controller = createNativePushController({ client: { rpc } as unknown as PlatformSupabaseClient, bridge,
    product: "rider", platform: "ios", installationId: "fixture-installation", userId: "fixture-user",
    tenantSlug: "fixture-provider", update: (state) => states.push(state), open });
  return { controller, rpc, bridge, states, open, remove, token: (value: string) => receiveToken(value), tap: (value: unknown) => tap(value) };
}
describe("native push consent and account scope", () => {
  it("does not prompt or register without existing opt-in", async () => {
    const f = setup(); await f.controller.initialize();
    expect(f.bridge.permission).not.toHaveBeenCalled(); expect(f.bridge.register).not.toHaveBeenCalled();
    expect(f.bridge.unregister).toHaveBeenCalled(); expect(f.states.at(-1)?.enabled).toBe(false);
    f.controller.dispose();
  });
  it("waits for server registration and binds the expected account/provider", async () => {
    const f = setup(); await f.controller.initialize(); await f.controller.setEnabled(true);
    expect(f.rpc).toHaveBeenCalledWith("set_my_native_push", expect.objectContaining({ enabled_value: true,
      owner_auth_user_value: "fixture-user", tenant_slug_value: "fixture-provider", product_value: "rider", platform_value: "ios" }));
    expect(f.states.at(-1)).toMatchObject({ enabled: true, busy: false }); f.controller.dispose();
  });
  it("restores existing consent without asking permission again", async () => {
    const f = setup(true); await f.controller.initialize();
    expect(f.bridge.permission).toHaveBeenCalledWith(false); expect(f.states.at(-1)?.enabled).toBe(true);
    f.controller.dispose();
  });
  it("refreshes an opted-in device on resume without prompting", async () => {
    const f = setup(true); let resume: () => void = () => undefined;
    f.bridge.onResume = (callback) => { resume = callback; return Promise.resolve({ remove: f.remove }); };
    await f.controller.initialize(); vi.mocked(f.bridge.register).mockClear();
    resume(); await vi.waitFor(() => expect(f.bridge.register).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(f.states.at(-1)).toMatchObject({ enabled: true, busy: false }));
    expect(f.bridge.permission).toHaveBeenLastCalledWith(false); f.controller.dispose();
  });
  it("requires explicit server acceptance before showing enabled", async () => {
    const f = setup(); await f.controller.initialize();
    f.rpc.mockResolvedValue({ data: false, error: null });
    await expect(f.controller.setEnabled(true)).rejects.toThrow("could not be registered");
    expect(f.states.at(-1)?.enabled).toBe(false); f.controller.dispose();
  });
  it("does not show enabled when the server rejects registration", async () => {
    const f = setup(); await f.controller.initialize();
    f.rpc.mockResolvedValue({ data: false, error: { message: "fixture database error" } });
    await expect(f.controller.setEnabled(true)).rejects.toThrow("could not be registered");
    expect(f.states.at(-1)?.enabled).toBe(false); expect(f.states.at(-1)?.message).not.toContain("fixture database");
    f.controller.dispose();
  });
  it("retains the blocked-permission explanation and disables the server binding", async () => {
    const f = setup(); await f.controller.initialize(); vi.mocked(f.bridge.permission).mockResolvedValue(false);
    await expect(f.controller.setEnabled(true)).rejects.toThrow("blocked");
    expect(f.states.at(-1)?.message).toContain("device settings");
    expect(f.bridge.register).not.toHaveBeenCalled(); f.controller.dispose();
  });
  it("disables server delivery before unregistering/sign-out", async () => {
    const f = setup(true); await f.controller.initialize(); vi.mocked(f.bridge.unregister).mockClear();
    await f.controller.beforeSignOut();
    expect(f.rpc).toHaveBeenLastCalledWith("set_my_native_push", expect.objectContaining({ enabled_value: false }));
    expect(f.bridge.unregister).toHaveBeenCalled(); f.controller.dispose();
  });
  it("refuses sign-out cleanup when disabling the server binding fails", async () => {
    const f = setup(true); await f.controller.initialize();
    f.rpc.mockResolvedValue({ data: false, error: { message: "offline" } });
    await expect(f.controller.beforeSignOut()).rejects.toThrow("could not be disabled");
    f.controller.dispose();
  });
  it("saves rotated tokens and ignores callbacks after disposal", async () => {
    const f = setup(true); await f.controller.initialize();
    f.token("rotated-token"); await vi.waitFor(() => expect(f.rpc).toHaveBeenLastCalledWith("set_my_native_push",
      expect.objectContaining({ token_value: "rotated-token" })));
    f.controller.dispose(); const count = f.rpc.mock.calls.length;
    f.token("late-token"); await Promise.resolve(); expect(f.rpc.mock.calls).toHaveLength(count);
    expect(f.remove).toHaveBeenCalledTimes(3);
  });
  it("ignores foreign product/provider notification taps", async () => {
    const f = setup(); await f.controller.initialize();
    f.tap({ product: "driver", tenantSlug: "fixture-provider" }); f.tap({ product: "rider", tenantSlug: "foreign-provider" });
    expect(f.open).not.toHaveBeenCalled(); f.tap({ product: "rider", tenantSlug: "fixture-provider" });
    expect(f.open).toHaveBeenCalledTimes(1); f.controller.dispose();
  });
  it("persists only a separate nonsecret installation UUID per product", () => {
    const data = new Map<string,string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key,value); } };
    const rider = nativePushInstallation("rider",storage,() => "11111111-1111-4111-8111-111111111111");
    const driver = nativePushInstallation("driver",storage,() => "22222222-2222-4222-8222-222222222222");
    expect(rider).not.toBe(driver); expect(nativePushInstallation("rider",storage)).toBe(rider);
  });
  it("rejects malformed tap data", () => {
    expect(nativePushTapAllowed(null,"rider","fixture")).toBe(false);
    expect(nativePushTapAllowed({ url: "https://foreign.example" },"driver",null)).toBe(false);
  });
});
