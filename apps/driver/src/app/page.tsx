"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createIsolatedBrowserSupabaseClient,
  type SupabaseAuthSession,
} from "@esh-platform/supabase";

type DriverSummary = {
  driverProfileId: string;
  driverNumber: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  status: string;
  onboardingStatus: string;
  documentCompliance: boolean;
  documents: DriverDocument[];
  notificationPreferences: {
    expirationRemindersEnabled: boolean;
  };
  vehicle: {
    vehicleId: string;
    vehicleNumber: string;
    make: string;
    model: string;
    modelYear: number;
    color: string;
    licensePlate: string;
    status: string;
    hasPhoto: boolean;
    photoStorageBucket: string | null;
    photoStoragePath: string | null;
  } | null;
};

type DriverDocument = {
  evidenceType: string;
  requiredForActivation: boolean;
  expirationRequired: boolean;
  reviewStatus: "missing" | "pending" | "approved" | "rejected" | "expired" | "expiration_missing";
  reviewNotes: string | null;
  expiresOn: string | null;
  submittedAt: string | null;
  originalFileName: string | null;
};

export default function DriverHome() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey) return null;
    return createIsolatedBrowserSupabaseClient("esh-driver-portal-auth", {
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    });
  }, [supabaseAnonKey, supabaseUrl]);
  const [session, setSession] = useState<SupabaseAuthSession | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("Sign in with the email used for your application.");
  const [summary, setSummary] = useState<DriverSummary | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [preferenceMessage, setPreferenceMessage] = useState<string | null>(null);
  const [updatingPreferences, setUpdatingPreferences] = useState(false);
  const [vehiclePhotoUrl, setVehiclePhotoUrl] = useState<string | null>(null);

  const activateAndLoad = useCallback(async () => {
    if (!supabase) {
      setMessage("Driver portal configuration is unavailable.");
      return;
    }
    setMessage("Connecting your approved driver account…");
    const activation = await supabase.rpc("activate_my_driver_account");
    if (activation.error) {
      setMessage(activation.error.message);
      return;
    }
    const result = await supabase.rpc("my_driver_portal_summary");
    if (result.error || !result.data) {
      setMessage(result.error?.message ?? "Driver profile is unavailable.");
      return;
    }
    const nextSummary = result.data as unknown as DriverSummary;
    setSummary(nextSummary);
    setVehiclePhotoUrl(null);
    if (nextSummary.vehicle?.photoStorageBucket && nextSummary.vehicle.photoStoragePath) {
      const photo = await supabase.storage
        .from(nextSummary.vehicle.photoStorageBucket)
        .createSignedUrl(nextSummary.vehicle.photoStoragePath, 600);
      if (photo.data?.signedUrl) setVehiclePhotoUrl(`${photo.data.signedUrl}&v=${Date.now()}`);
    }
    setMessage("Driver account connected.");
  }, [supabase]);

  useEffect(() => {
    if (!supabase) {
      setMessage("Driver portal configuration is unavailable.");
      return;
    }
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!session) {
      setSummary(null);
      return;
    }
    void activateAndLoad();
  }, [activateAndLoad, session]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setMessage("Driver portal configuration is unavailable.");
      return;
    }
    const redirectUrl = new URL(window.location.href);
    redirectUrl.hash = "";
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectUrl.toString(), shouldCreateUser: false },
    });
    setMessage(error ? error.message : "Check your email for the secure sign-in link.");
  }

  async function uploadEvidence(document: DriverDocument, file: File) {
    if (!summary || !supabase || !session) return;
    if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) {
      setUploadMessage("Files must be JPEG, PNG, or PDF.");
      return;
    }
    if (file.size === 0 || file.size > 5_000_000) {
      setUploadMessage("Choose a file that is 5MB or smaller.");
      return;
    }

    setUploadingType(document.evidenceType);
    setUploadMessage(`Uploading ${evidenceLabel(document.evidenceType).toLowerCase()}…`);
    const extension =
      file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    const path = [
      "driver-self-service",
      session.user.id,
      summary.driverProfileId,
      `${document.evidenceType}-${crypto.randomUUID()}.${extension}`,
    ].join("/");
    const upload = await supabase.storage
      .from("driver-application-files")
      .upload(path, file, { upsert: false });
    if (upload.error) {
      setUploadMessage(`Upload failed: ${upload.error.message}`);
      setUploadingType(null);
      return;
    }

    const submission = await supabase.rpc("submit_my_driver_evidence", {
      target_driver_profile_id: summary.driverProfileId,
      target_evidence_type: document.evidenceType,
      target_storage_path: path,
      target_original_file_name: file.name,
      target_mime_type: file.type,
      target_size_bytes: file.size,
    });
    if (submission.error) {
      setUploadMessage(`Submission failed: ${submission.error.message}`);
      setUploadingType(null);
      return;
    }

    await activateAndLoad();
    setUploadMessage(`${evidenceLabel(document.evidenceType)} submitted for review.`);
    setUploadingType(null);
  }

  async function uploadVehiclePhoto(file: File) {
    if (!summary?.vehicle || !supabase || !session) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setUploadMessage("Vehicle photo must be JPEG or PNG.");
      return;
    }
    if (file.size === 0 || file.size > 5_000_000) {
      setUploadMessage("Choose a vehicle photo that is 5MB or smaller.");
      return;
    }
    const previousPhotoUrl = vehiclePhotoUrl;
    const localPreviewUrl = URL.createObjectURL(file);
    setVehiclePhotoUrl(localPreviewUrl);
    setUploadingType("assigned_vehicle_photo");
    setUploadMessage("Uploading vehicle photo…");
    const extension = file.type === "image/png" ? "png" : "jpg";
    const path = [
      "vehicle-self-service",
      session.user.id,
      summary.vehicle.vehicleId,
      `photo-${crypto.randomUUID()}.${extension}`,
    ].join("/");
    const upload = await supabase.storage
      .from("driver-application-files")
      .upload(path, file, { upsert: false });
    if (upload.error) {
      URL.revokeObjectURL(localPreviewUrl);
      setVehiclePhotoUrl(previousPhotoUrl);
      setUploadMessage(`Vehicle photo upload failed: ${upload.error.message}`);
      setUploadingType(null);
      return;
    }
    const submission = await supabase.rpc("submit_my_vehicle_photo", {
      target_vehicle_id: summary.vehicle.vehicleId,
      target_storage_path: path,
      target_original_file_name: file.name,
      target_mime_type: file.type,
      target_size_bytes: file.size,
    });
    if (submission.error) {
      URL.revokeObjectURL(localPreviewUrl);
      setVehiclePhotoUrl(previousPhotoUrl);
      setUploadMessage(`Vehicle photo submission failed: ${submission.error.message}`);
      setUploadingType(null);
      return;
    }
    const refreshed = await supabase.rpc("my_driver_portal_summary");
    const nextSummary = refreshed.data as unknown as DriverSummary | null;
    if (
      refreshed.error ||
      !nextSummary?.vehicle ||
      nextSummary.vehicle.vehicleId !== summary.vehicle.vehicleId ||
      nextSummary.vehicle.photoStoragePath !== path
    ) {
      URL.revokeObjectURL(localPreviewUrl);
      setVehiclePhotoUrl(previousPhotoUrl);
      setUploadMessage(
        refreshed.error
          ? `Vehicle photo verification failed: ${refreshed.error.message}`
          : "Vehicle photo verification failed: the assigned vehicle did not save the new file.",
      );
      setUploadingType(null);
      return;
    }
    const savedPhoto = await supabase.storage
      .from("driver-application-files")
      .createSignedUrl(path, 600);
    if (savedPhoto.error || !savedPhoto.data?.signedUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      setVehiclePhotoUrl(previousPhotoUrl);
      setUploadMessage(
        `Vehicle photo verification failed: ${savedPhoto.error?.message ?? "saved file is unavailable"}`,
      );
      setUploadingType(null);
      return;
    }
    URL.revokeObjectURL(localPreviewUrl);
    setSummary(nextSummary);
    setVehiclePhotoUrl(`${savedPhoto.data.signedUrl}&v=${Date.now()}`);
    setUploadMessage(
      `Vehicle photo saved for ${nextSummary.vehicle.vehicleNumber}. Admin will update within 15 seconds.`,
    );
    setUploadingType(null);
  }

  async function updateExpirationReminders(enabled: boolean) {
    if (!supabase) return;
    setUpdatingPreferences(true);
    setPreferenceMessage("Saving reminder preference…");
    const result = await supabase.rpc("set_my_driver_notification_preferences", {
      expiration_reminders_enabled_value: enabled,
    });
    if (result.error) {
      setPreferenceMessage(result.error.message);
    } else {
      setSummary((current) =>
        current
          ? {
              ...current,
              notificationPreferences: {
                expirationRemindersEnabled: enabled,
              },
            }
          : current,
      );
      setPreferenceMessage(
        enabled ? "Expiration reminders enabled." : "Expiration reminders disabled.",
      );
    }
    setUpdatingPreferences(false);
  }

  return (
    <main className="shell">
      <section className="portal-card">
        <p className="eyebrow">Driver portal</p>
        <h1>ESH Platform</h1>
        {!session ? (
          <form onSubmit={(event) => void signIn(event)}>
            <label>
              Application email
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <button type="submit">Email me a sign-in link</button>
          </form>
        ) : null}
        {summary ? (
          <div className="status-grid">
            <h2>{summary.displayName}</h2>
            <p>Driver #{summary.driverNumber}</p>
            <dl>
              <div>
                <dt>Driver status</dt>
                <dd>{summary.status}</dd>
              </div>
              <div>
                <dt>Onboarding</dt>
                <dd>{summary.onboardingStatus}</dd>
              </div>
              <div>
                <dt>Document compliance</dt>
                <dd>{summary.documentCompliance ? "satisfied" : "pending"}</dd>
              </div>
            </dl>
            <section className="assigned-vehicle">
              <div>
                <p className="eyebrow">Assigned fleet vehicle</p>
                <h3>
                  {summary.vehicle
                    ? `${summary.vehicle.modelYear} ${summary.vehicle.make} ${summary.vehicle.model}`
                    : "No vehicle assigned"}
                </h3>
              </div>
              {summary.vehicle ? (
                <>
                  {vehiclePhotoUrl ? (
                    <Image
                      alt={`${summary.vehicle.make} ${summary.vehicle.model}`}
                      height={675}
                      src={vehiclePhotoUrl}
                      unoptimized
                      width={1200}
                    />
                  ) : null}
                  <dl>
                    <div>
                      <dt>Fleet number</dt>
                      <dd>{summary.vehicle.vehicleNumber}</dd>
                    </div>
                    <div>
                      <dt>Color</dt>
                      <dd>{summary.vehicle.color}</dd>
                    </div>
                    <div>
                      <dt>License plate</dt>
                      <dd>{summary.vehicle.licensePlate}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{summary.vehicle.status}</dd>
                    </div>
                  </dl>
                  <label className="upload-control">
                    <span>
                      {uploadingType === "assigned_vehicle_photo"
                        ? "Uploading vehicle photo…"
                        : summary.vehicle.hasPhoto
                          ? "Replace assigned car photo"
                          : "Upload assigned car photo"}
                    </span>
                    <input
                      accept="image/jpeg,image/png"
                      disabled={uploadingType !== null}
                      onChange={(event) => {
                        const photo = event.target.files?.[0];
                        if (photo) void uploadVehiclePhoto(photo);
                        event.target.value = "";
                      }}
                      type="file"
                    />
                  </label>
                </>
              ) : (
                <p className="document-help">
                  Your tenant administrator has not assigned a vehicle yet.
                </p>
              )}
            </section>
            <section className="documents">
              <div>
                <p className="eyebrow">Documents</p>
                <h3>Evidence status</h3>
              </div>
              <p className="document-help">
                Upload a replacement when evidence is missing, rejected, or expired. JPEG, PNG, and
                PDF files up to 5MB are accepted.
              </p>
              {uploadMessage ? <p className="upload-message">{uploadMessage}</p> : null}
              {(summary.documents ?? []).map((document) => (
                <article className="document-card" key={document.evidenceType}>
                  <div className="document-heading">
                    <strong>{evidenceLabel(document.evidenceType)}</strong>
                    <span className={`status status-${document.reviewStatus}`}>
                      {document.reviewStatus.replaceAll("_", " ")}
                    </span>
                  </div>
                  {document.originalFileName ? <span>{document.originalFileName}</span> : null}
                  {document.expiresOn ? <span>Expires {document.expiresOn}</span> : null}
                  {document.expirationRequired && !document.expiresOn ? (
                    <span>Expiration date required after approval</span>
                  ) : null}
                  {document.reviewNotes ? (
                    <p className="rejection-note">Review note: {document.reviewNotes}</p>
                  ) : null}
                  {["missing", "rejected", "expired", "expiration_missing"].includes(
                    document.reviewStatus,
                  ) ? (
                    <label className="upload-control">
                      <span>
                        {uploadingType === document.evidenceType
                          ? "Uploading…"
                          : "Choose replacement"}
                      </span>
                      <input
                        accept="image/jpeg,image/png,application/pdf"
                        disabled={uploadingType !== null}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadEvidence(document, file);
                          event.target.value = "";
                        }}
                        type="file"
                      />
                    </label>
                  ) : null}
                </article>
              ))}
            </section>
            <section className="notification-preferences">
              <div>
                <p className="eyebrow">Notifications</p>
                <h3>Email preferences</h3>
              </div>
              <label>
                <input
                  checked={summary.notificationPreferences?.expirationRemindersEnabled ?? true}
                  disabled={updatingPreferences}
                  onChange={(event) => void updateExpirationReminders(event.target.checked)}
                  type="checkbox"
                />
                Email me before required evidence expires
              </label>
              <p>Essential account, rejection, and activation notices remain enabled.</p>
              {preferenceMessage ? <p className="upload-message">{preferenceMessage}</p> : null}
            </section>
            <button
              className="secondary"
              onClick={() => void supabase?.auth.signOut()}
              type="button"
            >
              Sign out
            </button>
          </div>
        ) : null}
        <p className="summary">{message}</p>
      </section>
    </main>
  );
}

function evidenceLabel(evidenceType: string) {
  const labels: Record<string, string> = {
    personal_photo: "Personal photo",
    reference_document: "Reference document",
    vehicle_photo: "Onboarding vehicle evidence",
  };
  return labels[evidenceType] ?? evidenceType.replaceAll("_", " ");
}
