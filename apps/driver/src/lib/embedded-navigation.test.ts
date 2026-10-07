import { afterEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import { openDriverNavigation } from "./embedded-navigation";

vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: vi.fn() } }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Driver external navigation", () => {
  it.each(["Pickup", "Destination"])("opens Android maps for %s without a Mapbox plugin or token", (label) => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
    const assign = vi.fn(); vi.stubGlobal("window", { location: { assign } });
    openDriverNavigation({ latitude: 39.9526, longitude: -75.1652, label });
    expect(assign).toHaveBeenCalledWith(`geo:0,0?q=${encodeURIComponent(`39.9526,-75.1652 (${label})`)}`);
  });
  it("preserves Apple Maps routing", () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
    const assign = vi.fn(); vi.stubGlobal("window", { location: { assign } });
    openDriverNavigation({ latitude: 39.9526, longitude: -75.1652, label: "Pickup" });
    expect(assign).toHaveBeenCalledWith("maps://?daddr=39.9526%2C-75.1652&dirflg=d");
  });
});
