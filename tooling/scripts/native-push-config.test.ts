import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { validateFirebaseConfig } = require("./native-push-config.cjs");
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");
const config = (product: string) => ({ project_info: { project_id: "esh-platform-609d3" },
  client: [{ client_info: { mobilesdk_app_id: "fixture-app-id",
    android_client_info: { package_name: `com.esh.${product}` } } }] });

describe("native Firebase build configuration", () => {
  it.each(["rider", "driver"])("accepts the correct %s client", (product) => {
    expect(validateFirebaseConfig(encode(config(product)), product)).toEqual(config(product));
  });
  it("rejects swapped product files", () => {
    expect(() => validateFirebaseConfig(encode(config("driver")), "rider")).toThrow("match");
  });
  it("retains only the intended client in a multi-app project configuration", () => {
    const value = config("rider"); value.client.push(...config("driver").client);
    expect(validateFirebaseConfig(encode(value), "driver")).toEqual(config("driver"));
  });
  it("rejects another project", () => {
    const value = config("rider"); value.project_info.project_id = "foreign-project";
    expect(() => validateFirebaseConfig(encode(value), "rider")).toThrow("different project");
  });
  it("rejects server credentials without exposing them", () => {
    expect(() => validateFirebaseConfig(encode({ type: "service_account", private_key: "fixture-secret" }), "driver"))
      .toThrow("server credential");
  });
  it.each([undefined, "invalid!", Buffer.from("{").toString("base64")])("rejects missing or malformed configuration", (value) => {
    expect(() => validateFirebaseConfig(value, "rider")).toThrow();
  });
  it("rejects unknown products", () => {
    expect(() => validateFirebaseConfig(encode(config("rider")), "community")).toThrow("rider or driver");
  });
});
