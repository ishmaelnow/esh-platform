import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { tripPhotoResponse } from "./trip-photo";

const rpc = vi.fn(), sign = vi.fn(), getUser = vi.fn(), storage = vi.fn(() => ({ createSignedUrl: sign }));
const authenticated = vi.fn(() => ({ auth: { getUser }, rpc }) as unknown as SupabaseClient<Database>);
const service = vi.fn(() => ({ storage: { from: storage } }) as unknown as SupabaseClient<Database>);
const clients = { authenticated, service };
const bookingId = "90000000-0000-4000-8000-000000000001";
const metadata = { tenant: "tenant", rider: "rider", assignment: "driver", photo: { bucket: "driver-application-files", path: "tenant/user/photo.jpg" } };
const request = (auth = "Bearer fixture") => new Request(`https://app.test/api/trips/photo?bookingId=${bookingId}&role=driver&path=other`, { headers: { Authorization: auth } });
beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { email_confirmed_at: "2026-10-10" } }, error: null });
  rpc.mockResolvedValue({ data: metadata, error: null });
  sign.mockResolvedValue({ data: { signedUrl: "https://storage.test/signed" }, error: null });
});
describe("active-trip private profile photo signing", () => {
  it("requires verified authentication and a booking UUID before privileged access", async () => {
    expect((await tripPhotoResponse(request(""), "rider", clients)).status).toBe(401);
    expect((await tripPhotoResponse(new Request("https://app.test/?bookingId=bad", { headers: { Authorization: "Bearer fixture" } }), "rider", clients)).status).toBe(400);
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await tripPhotoResponse(request(), "rider", clients)).status).toBe(401);
    expect(service).not.toHaveBeenCalled();
  });
  it("uses server role, owned RPC metadata and sixty-second links without caching or paths", async () => {
    const response = await tripPhotoResponse(request(), "rider", clients);
    expect(rpc).toHaveBeenCalledWith("my_trip_participant_photo", { booking_value: bookingId, role_value: "rider" });
    expect(sign).toHaveBeenCalledWith("tenant/user/photo.jpg", 60);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ url: "https://storage.test/signed", expiresIn: 60 });
  });
  it("never signs an unauthorized or unavailable photo", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "private detail" } });
    const denied = await tripPhotoResponse(request(), "rider", clients);
    expect(denied.status).toBe(403); expect(await denied.text()).not.toContain("private detail");
    rpc.mockResolvedValueOnce({ data: { ...metadata, photo: null }, error: null });
    expect(await (await tripPhotoResponse(request(), "rider", clients)).json()).toEqual({ url: null });
    expect(service).not.toHaveBeenCalled();
  });
  it("rejects wrong buckets, empty paths and traversal", async () => {
    for (const photo of [{ bucket: "other", path: "tenant/file" }, { bucket: "driver-application-files", path: " " }, { bucket: "driver-application-files", path: "tenant/../id" }]) {
      rpc.mockResolvedValueOnce({ data: { ...metadata, photo }, error: null });
      expect(await (await tripPhotoResponse(request(), "rider", clients)).json()).toEqual({ url: null });
    }
    expect(service).not.toHaveBeenCalled();
  });
  it("signs an owned legacy Driver path without accepting the request's path override", async () => {
    rpc.mockResolvedValue({ data: { ...metadata, photo: { bucket: "driver-application-files", path: "legacy-app/profile/image.jpg" } }, error: null });
    expect(await (await tripPhotoResponse(request(), "rider", clients)).json()).toEqual({ url: "https://storage.test/signed", expiresIn: 60 });
    expect(sign).toHaveBeenCalledWith("legacy-app/profile/image.jpg", 60);
    expect(sign).not.toHaveBeenCalledWith("other", 60);
  });
  it("rejects a changed assignment, closed ride, or removed photo during signing", async () => {
    for (const current of [{ data: { ...metadata, assignment: "replacement" }, error: null }, { data: null, error: {} }, { data: { ...metadata, photo: null }, error: null }]) {
      rpc.mockResolvedValueOnce({ data: metadata, error: null }).mockResolvedValueOnce(current);
      expect(await (await tripPhotoResponse(request(), "rider", clients)).json()).toEqual({ url: null });
    }
  });
  it("signs Rider photos only in the exact tenant/profile namespace", async () => {
    rpc.mockResolvedValue({ data: { ...metadata, photo: { bucket: "rider-profile-photos", path: "tenant/rider/photo.jpg" } }, error: null });
    expect((await tripPhotoResponse(request(), "driver", clients)).status).toBe(200);
    expect(storage).toHaveBeenCalledWith("rider-profile-photos");
    rpc.mockResolvedValueOnce({ data: { ...metadata, photo: { bucket: "rider-profile-photos", path: "tenant/other/photo.jpg" } }, error: null });
    expect(await (await tripPhotoResponse(request(), "driver", clients)).json()).toEqual({ url: null });
  });
  it("falls back safely on signing errors and missing server configuration", async () => {
    sign.mockResolvedValueOnce({ data: null, error: {} });
    expect(await (await tripPhotoResponse(request(), "rider", clients)).json()).toEqual({ url: null });
    service.mockImplementationOnce(() => { throw new Error("secret configuration detail"); });
    const response = await tripPhotoResponse(request(), "rider", clients);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret");
  });
});
