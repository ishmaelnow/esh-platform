import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ native: vi.fn(), platform: vi.fn(), available: vi.fn(), photo: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: mocks.native, getPlatform: mocks.platform, isPluginAvailable: mocks.available } }));
vi.mock("@capacitor/camera", () => ({ Camera: { getPhoto: mocks.photo }, CameraSource: { Camera: "CAMERA" }, CameraResultType: { DataUrl: "dataUrl" } }));
import { captureAndroidDocument, usesAndroidDocumentCamera } from "./document-camera";

describe("Android document camera", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.native.mockReturnValue(true); mocks.platform.mockReturnValue("android"); mocks.available.mockReturnValue(true); });
  it("uses native capture only on installed Android", () => {
    expect(usesAndroidDocumentCamera()).toBe(true);
    mocks.platform.mockReturnValue("ios"); expect(usesAndroidDocumentCamera()).toBe(false);
    mocks.platform.mockReturnValue("android"); mocks.native.mockReturnValue(false); expect(usesAndroidDocumentCamera()).toBe(false);
  });
  it("requests only the camera, without edits or gallery saving, and returns a JPEG file", async () => {
    mocks.photo.mockResolvedValue({ dataUrl: "data:image/jpeg;base64,/9j/" });
    const file = await captureAndroidDocument();
    expect(mocks.photo).toHaveBeenCalledWith(expect.objectContaining({ source: "CAMERA", saveToGallery: false, correctOrientation: true, allowEditing: false, width: 1600 }));
    expect(file?.type).toBe("image/jpeg"); expect(file?.size).toBe(3);
  });
  it("cancellation returns no replacement", async () => {
    mocks.photo.mockRejectedValue({ message: "User cancelled photos app" });
    expect(await captureAndroidDocument()).toBeNull();
  });
  it("older shells ask for an update without opening a file picker", async () => {
    mocks.available.mockReturnValue(false);
    await expect(captureAndroidDocument()).rejects.toThrow("latest ESH Driver Android update");
    expect(mocks.photo).not.toHaveBeenCalled();
  });
  it("denial and unavailable camera report actionable errors", async () => {
    mocks.photo.mockRejectedValue(new Error("Permission denied"));
    await expect(captureAndroidDocument()).rejects.toThrow("Camera access was denied");
    mocks.photo.mockRejectedValue(new Error("Unable to resolve camera activity"));
    await expect(captureAndroidDocument()).rejects.toThrow("Camera could not take a photo");
  });
  it("does not accept absent or non-JPEG camera output", async () => {
    mocks.photo.mockResolvedValue({});
    await expect(captureAndroidDocument()).rejects.toThrow("Camera could not take a photo");
    mocks.photo.mockResolvedValue({ dataUrl: "data:application/pdf;base64,JVBERg==" });
    await expect(captureAndroidDocument()).rejects.toThrow("Camera could not take a photo");
  });
});
