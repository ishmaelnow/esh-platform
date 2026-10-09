import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Association = { relation: string[]; target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] } };
describe("Driver Android verified sign-in links", () => {
  it("trusts the verified Codemagic APK signer for the Driver package, separately from Rider", () => {
    const driver = JSON.parse(readFileSync(new URL("../../public/.well-known/assetlinks.json", import.meta.url), "utf8")) as Association[];
    const rider = JSON.parse(readFileSync(new URL("../../../rider/public/.well-known/assetlinks.json", import.meta.url), "utf8")) as Association[];
    const signer = "8E:0A:3D:FB:CB:B6:0A:9A:51:34:6F:63:35:CE:81:AE:DB:3C:71:A6:47:7F:0E:5E:23:60:9E:4F:07:B8:03:1B";
    expect(driver).toHaveLength(1);
    expect(driver[0].relation).toContain("delegate_permission/common.handle_all_urls");
    expect(driver[0].target.namespace).toBe("android_app");
    expect(driver[0].target.package_name).toBe("com.esh.driver");
    expect(driver[0].target.sha256_cert_fingerprints).toContain(signer);
    expect(rider[0].target.package_name).toBe("com.esh.rider");
    expect(rider[0].target.sha256_cert_fingerprints).toContain(signer);
  });
});
