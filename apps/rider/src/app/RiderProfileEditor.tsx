"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import type { createIsolatedBrowserSupabaseClient } from "@esh-platform/supabase";
import { prepareProfilePhoto } from "../lib/profile-photo";

type Profile = { displayName: string; email: string; phone: string | null; accessibilityNotes: string | null };
export function RiderProfileEditor({ profile, client, token, tenantSlug, onSaved }: {
  profile: Profile; client: ReturnType<typeof createIsolatedBrowserSupabaseClient>;
  token: string; tenantSlug: string; onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(profile.displayName);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [notes, setNotes] = useState(profile.accessibilityNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [saveError, setSaveError] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(true);
  const [photoError, setPhotoError] = useState("");
  const [photoFeedback, setPhotoFeedback] = useState("");
  const [photoRefresh, setPhotoRefresh] = useState(0);
  const alive = useRef(true);
  const photoEndpoint = `/api/profile/photo?tenantSlug=${encodeURIComponent(tenantSlug)}`;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setName(profile.displayName); }, [profile.displayName]);
  useEffect(() => { setPhone(profile.phone ?? ""); }, [profile.phone]);
  useEffect(() => { setNotes(profile.accessibilityNotes ?? ""); }, [profile.accessibilityNotes]);
  useEffect(() => {
    const controller = new AbortController();
    setPhotoLoading(true); setPhotoError("");
    void fetch(photoEndpoint, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { url?: string | null; message?: string };
        if (!response.ok) throw new Error(data.message ?? "Photo could not be loaded.");
        if (!controller.signal.aborted) setPhotoUrl(data.url ?? null);
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setPhotoError(error instanceof Error ? error.message : "Photo could not be loaded.");
      }).finally(() => { if (!controller.signal.aborted) setPhotoLoading(false); });
    return () => controller.abort();
  }, [photoEndpoint, token, photoRefresh]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setFeedback(""); setSaveError("");
    let committed = false;
    try {
      const result = await client.rpc("update_my_rider_profile", {
        target_tenant_slug: tenantSlug, display_name_value: name.trim(), phone_value: phone.trim(),
        accessibility_notes_value: notes.trim(),
      });
      if (result.error) throw result.error;
      committed = true;
      if (!alive.current) return;
      await onSaved();
      if (alive.current) setFeedback("Profile saved.");
    } catch {
      if (alive.current) setSaveError(committed ? "Profile saved, but refreshing failed. Reopen Account to check it."
        : "Profile could not be saved. Check your connection and try again.");
    } finally { if (alive.current) setSaving(false); }
  }

  async function changePhoto(file: File | null) {
    setPhotoBusy(true); setPhotoError(""); setPhotoFeedback("");
    try {
      const form = new FormData();
      if (file) form.set("photo", await prepareProfilePhoto(file));
      if (!alive.current) return;
      const response = await fetch(photoEndpoint, {
        method: file ? "POST" : "DELETE", headers: { Authorization: `Bearer ${token}` },
        body: file ? form : null, cache: "no-store",
      });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Photo could not be updated.");
      if (alive.current) {
        if (!file) setPhotoUrl(null);
        setPhotoFeedback(file ? "Profile photo updated." : "Profile photo removed.");
        setPhotoRefresh((value) => value + 1);
      }
    } catch (error) {
      if (alive.current) setPhotoError(error instanceof Error ? error.message : "Photo could not be updated. Try again.");
    } finally { if (alive.current) setPhotoBusy(false); }
  }

  return <article className="card rider-profile-card" aria-labelledby="rider-profile-heading">
    <div><p className="kicker">Your details</p><h3 id="rider-profile-heading">Rider profile</h3>
      <p>Your details are saved with this transportation provider.</p></div>
    <div className="rider-profile-photo-row">
      {photoUrl ? <Image unoptimized width={80} height={80} className="rider-profile-avatar" src={photoUrl} alt="Your rider profile" referrerPolicy="no-referrer"
        onError={() => { setPhotoUrl(null); setPhotoError("Photo preview expired or could not be opened. Refresh to try again."); }} />
        : <span className="rider-profile-avatar rider-profile-initial" aria-label="Profile initials">{name.trim().slice(0, 1).toUpperCase() || "R"}</span>}
      <div className="rider-profile-photo-actions"><label>Profile photo <span className="field-hint">Optional</span>
        <input aria-label="Choose profile photo" type="file" accept="image/jpeg,image/png" disabled={photoBusy || photoLoading}
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void changePhoto(file); }} />
      </label><p className="field-hint">Choose a JPEG or PNG from your photos or files. A photo is never required to book. Your assigned driver can see it during your active ride.</p>
        {photoUrl ? <button type="button" className="button secondary compact" disabled={photoBusy}
          onClick={() => void changePhoto(null)}>Remove photo</button> : null}
        {photoError ? <><p className="error" role="alert">{photoError}</p><button type="button" className="button secondary compact"
          disabled={photoBusy || photoLoading} onClick={() => setPhotoRefresh((value) => value + 1)}>Refresh photo</button></> : null}
        {photoBusy || photoLoading ? <p role="status">{photoBusy ? "Updating photo…" : "Loading photo…"}</p> : null}
        {photoFeedback ? <p role="status" className="notice">{photoFeedback}</p> : null}
      </div>
    </div>
    <form className="form-grid" onSubmit={(event) => void save(event)}>
      <label>Full name<input name="profileName" autoComplete="name" required maxLength={120} value={name}
        onChange={(event) => setName(event.target.value)} disabled={saving} /></label>
      <label>Contact phone <span className="field-hint">Optional</span><input name="profilePhone" type="tel" autoComplete="tel"
        maxLength={32} value={phone} onChange={(event) => setPhone(event.target.value)} disabled={saving} />
        <span className="field-hint">Contact number only. Saving it does not verify it or change your SMS consent.</span></label>
      <label className="wide">Verified email<input type="email" readOnly value={profile.email} /></label>
      <label className="wide">Accessibility or pickup notes<textarea rows={3} maxLength={1000} value={notes}
        onChange={(event) => setNotes(event.target.value)} disabled={saving} /></label>
      <button className="button primary" disabled={saving || !name.trim()}>{saving ? "Saving profile…" : "Save profile"}</button>
      {feedback ? <p className="notice wide" role="status">{feedback}</p> : null}
      {saveError ? <p className="error wide" role="alert">{saveError}</p> : null}
    </form>
  </article>;
}
