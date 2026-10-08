import { beforeEach, describe, expect, it, vi } from "vitest";
import { driverCallbackReceipt } from "./consumed-auth-callback";
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } });
});
describe("Driver consumed sign-in callbacks", () => {
  it("recognizes replay across reload without persisting credentials", async () => {
    const url = "com.esh.driver://auth/callback#access_token=private-token&refresh_token=private-refresh";
    const receipt = await driverCallbackReceipt(url);
    expect(receipt.consumed).toBe(false);
    receipt.commit();
    expect((await driverCallbackReceipt(url)).consumed).toBe(true);
    expect(JSON.stringify([...values.values()])).not.toContain("private");
    expect((await driverCallbackReceipt(`${url}-new`)).consumed).toBe(false);
  });
  it("does not consume a failed or unfinished callback", async () => {
    const url = "com.esh.driver://auth/callback?code=one-time-code";
    await driverCallbackReceipt(url);
    expect((await driverCallbackReceipt(url)).consumed).toBe(false);
  });
});
