"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  createIsolatedBrowserSupabaseClient,
  type SupabaseAuthSession,
} from "@esh-platform/supabase";
import {
  availabilityBlockerDetails,
  availabilityErrorMessage,
  evidenceLabel,
  vehicleEvidenceLabel,
} from "../lib/availability";

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

type VehicleComplianceDocument = {
  evidenceType: string;
  requiredForService: boolean;
  expirationRequired: boolean;
  reviewStatus: "missing" | "pending" | "approved" | "rejected" | "expired" | "expiration_missing";
  reviewNotes: string | null;
  expiresOn: string | null;
  submittedAt: string | null;
  originalFileName: string | null;
};

type VehicleCompliance = {
  vehicleId: string;
  compliant: boolean;
  documents: VehicleComplianceDocument[];
};

type DriverAvailability = {
  requestedStatus: "online" | "offline";
  effectiveStatus: "online" | "offline";
  eligible: boolean;
  blockers: string[];
  statusChangedAt: string;
  selectedServiceAreaId: string | null;
  selectedServiceAreaName: string | null;
};

type DriverServiceArea = {
  serviceAreaId: string;
  name: string;
  description: string | null;
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
  coverageMode: "all_drivers" | "selected_drivers";
  assignedAt: string | null;
  selected: boolean;
};

type DriverDispatchOffer = {
  offerId: string;
  bookingId: string;
  customerName: string;
  customerPhone: string | null;
  pickupAddress: string;
  destinationAddress: string;
  notes: string | null;
  serviceAreaName: string;
  status: "pending";
  offeredAt: string;
};

type DriverTrip = {
  bookingId: string;
  customerName: string;
  customerPhone: string | null;
  pickupAddress: string;
  destinationAddress: string;
  notes: string | null;
  serviceAreaName: string;
  status: "accepted" | "arrived" | "in_progress";
};

type DriverDispatch = {
  offers: DriverDispatchOffer[];
  trips: DriverTrip[];
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
  const [vehiclePhotoError, setVehiclePhotoError] = useState(false);
  const [vehiclePhotoMessage, setVehiclePhotoMessage] = useState<string | null>(null);
  const [vehicleCompliance, setVehicleCompliance] = useState<VehicleCompliance | null>(null);
  const [availability, setAvailability] = useState<DriverAvailability | null>(null);
  const [updatingAvailability, setUpdatingAvailability] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);
  const [serviceAreas, setServiceAreas] = useState<DriverServiceArea[]>([]);
  const [updatingServiceArea, setUpdatingServiceArea] = useState(false);
  const [serviceAreaMessage, setServiceAreaMessage] = useState<string | null>(null);
  const automaticAreaAttempt = useRef<string | null>(null);
  const [dispatch, setDispatch] = useState<DriverDispatch>({ offers: [], trips: [] });
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchMessage, setDispatchMessage] = useState<string | null>(null);

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
    const compliance = await supabase.rpc("my_assigned_vehicle_compliance");
    setVehicleCompliance(
      compliance.error || !compliance.data
        ? null
        : (compliance.data as unknown as VehicleCompliance),
    );
    const availabilityResult = await supabase.rpc("my_driver_availability");
    setAvailability(
      availabilityResult.error || !availabilityResult.data
        ? null
        : (availabilityResult.data as unknown as DriverAvailability),
    );
    const serviceAreaResult = await supabase.rpc("my_driver_service_areas");
    if (serviceAreaResult.error || !serviceAreaResult.data) {
      setServiceAreas([]);
      setServiceAreaMessage(
        serviceAreaResult.error
          ? `Service areas could not be loaded: ${serviceAreaResult.error.message}`
          : "Service areas could not be loaded.",
      );
    } else {
      setServiceAreas(serviceAreaResult.data as unknown as DriverServiceArea[]);
      setServiceAreaMessage(null);
    }
    const dispatchResult = await supabase.rpc("my_driver_dispatch");
    if (!dispatchResult.error && dispatchResult.data) {
      setDispatch(dispatchResult.data as unknown as DriverDispatch);
    }
    setVehiclePhotoUrl(null);
    setVehiclePhotoError(false);
    setVehiclePhotoMessage(null);
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
      setServiceAreas([]);
      setDispatch({ offers: [], trips: [] });
      return;
    }
    void activateAndLoad();
  }, [activateAndLoad, session]);

  useEffect(() => {
    const bucket = summary?.vehicle?.photoStorageBucket;
    const path = summary?.vehicle?.photoStoragePath;
    if (!supabase || !session || !bucket || !path) {
      if (!summary?.vehicle?.hasPhoto) setVehiclePhotoUrl(null);
      return;
    }

    const client = supabase;
    const photoBucket = bucket;
    const photoPath = path;
    let active = true;
    let objectUrl: string | null = null;
    async function refreshVehiclePhoto() {
      const photo = await withTimeout(
        client.storage.from(photoBucket).createSignedUrl(photoPath, 600),
        10_000,
      );
      if (!active) return;
      if (photo && !photo.error && photo.data?.signedUrl) {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
        setVehiclePhotoError(false);
        setVehiclePhotoMessage(null);
        setVehiclePhotoUrl(`${photo.data.signedUrl}&v=${Date.now()}`);
        return;
      }

      const fallback = await withTimeout(
        client.storage.from(photoBucket).download(photoPath),
        10_000,
      );
      if (!active) return;
      if (!fallback || fallback.error || !fallback.data) {
        setVehiclePhotoUrl(null);
        setVehiclePhotoError(true);
        setVehiclePhotoMessage(
          fallback?.error?.message ??
            photo?.error?.message ??
            "The photo request timed out. Refresh the page to try again.",
        );
        return;
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(fallback.data);
      setVehiclePhotoError(false);
      setVehiclePhotoMessage(null);
      setVehiclePhotoUrl(objectUrl);
    }

    void refreshVehiclePhoto();
    const interval = window.setInterval(() => void refreshVehiclePhoto(), 8 * 60 * 1000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshVehiclePhoto();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [session, summary?.vehicle, supabase]);

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
    setVehiclePhotoError(false);
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
    setVehiclePhotoError(false);
    setVehiclePhotoUrl(`${savedPhoto.data.signedUrl}&v=${Date.now()}`);
    setUploadMessage(
      `Vehicle photo saved for ${nextSummary.vehicle.vehicleNumber}. Admin will update within 15 seconds.`,
    );
    setUploadingType(null);
  }

  async function uploadVehicleEvidence(document: VehicleComplianceDocument, file: File) {
    if (!summary?.vehicle || !supabase || !session) return;
    if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) {
      setUploadMessage("Vehicle documents must be JPEG, PNG, or PDF.");
      return;
    }
    if (file.size < 1 || file.size > 5_000_000) {
      setUploadMessage("Choose a vehicle document that is 5MB or smaller.");
      return;
    }
    setUploadingType(`vehicle_${document.evidenceType}`);
    setUploadMessage(`Uploading ${vehicleEvidenceLabel(document.evidenceType).toLowerCase()}…`);
    const extension =
      file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    const path = [
      "vehicle-compliance",
      session.user.id,
      summary.vehicle.vehicleId,
      `${document.evidenceType}-${crypto.randomUUID()}.${extension}`,
    ].join("/");
    const upload = await supabase.storage
      .from("driver-application-files")
      .upload(path, file, { upsert: false });
    if (upload.error) {
      setUploadMessage(`Vehicle document upload failed: ${upload.error.message}`);
      setUploadingType(null);
      return;
    }
    const submission = await supabase.rpc("submit_my_vehicle_evidence", {
      target_vehicle_id: summary.vehicle.vehicleId,
      target_evidence_type: document.evidenceType,
      target_storage_path: path,
      target_original_file_name: file.name,
      target_mime_type: file.type,
      target_size_bytes: file.size,
    });
    if (submission.error) {
      setUploadMessage(`Vehicle document submission failed: ${submission.error.message}`);
      setUploadingType(null);
      return;
    }
    const compliance = await supabase.rpc("my_assigned_vehicle_compliance");
    if (!compliance.error && compliance.data)
      setVehicleCompliance(compliance.data as unknown as VehicleCompliance);
    setUploadMessage(`${vehicleEvidenceLabel(document.evidenceType)} submitted for review.`);
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

  async function updateAvailability(targetStatus: "online" | "offline") {
    if (!supabase) return;
    setUpdatingAvailability(true);
    setAvailabilityMessage(
      targetStatus === "online" ? "Checking service eligibility…" : "Going offline…",
    );
    const result = await supabase.rpc("set_my_driver_availability", {
      target_status: targetStatus,
    });
    if (result.error || !result.data) {
      setAvailabilityMessage(
        result.error
          ? availabilityErrorMessage(result.error.message)
          : "Availability could not be updated.",
      );
    } else {
      const next = result.data as unknown as DriverAvailability;
      setAvailability(next);
      setAvailabilityMessage(
        next.effectiveStatus === "online"
          ? "You are online and ready for service."
          : "You are offline.",
      );
    }
    setUpdatingAvailability(false);
  }

  const selectServiceArea = useCallback(
    async (serviceAreaId: string, automatic = false) => {
      if (!supabase || !serviceAreaId) return;
      setUpdatingServiceArea(true);
      setServiceAreaMessage(automatic ? "Selecting your only available area…" : "Saving area…");
      const result = await supabase.rpc("set_my_driver_service_area", {
        target_service_area_id: serviceAreaId,
      });
      if (result.error || !result.data) {
        setServiceAreaMessage(result.error?.message ?? "Service area could not be selected.");
      } else {
        setServiceAreas(result.data as unknown as DriverServiceArea[]);
        const availabilityResult = await supabase.rpc("my_driver_availability");
        if (!availabilityResult.error && availabilityResult.data) {
          setAvailability(availabilityResult.data as unknown as DriverAvailability);
        }
        setServiceAreaMessage(
          automatic ? "Your only available area was selected." : "Operating area selected.",
        );
      }
      setUpdatingServiceArea(false);
    },
    [supabase],
  );

  useEffect(() => {
    const soleArea = serviceAreas.length === 1 ? serviceAreas[0] : undefined;
    if (
      soleArea &&
      !soleArea.selected &&
      availability?.requestedStatus === "offline" &&
      !updatingServiceArea &&
      automaticAreaAttempt.current !== soleArea.serviceAreaId
    ) {
      automaticAreaAttempt.current = soleArea.serviceAreaId;
      void selectServiceArea(soleArea.serviceAreaId, true);
    }
  }, [availability?.requestedStatus, selectServiceArea, serviceAreas, updatingServiceArea]);

  async function respondToOffer(offerId: string, response: "accepted" | "declined") {
    if (!supabase) return;
    setDispatchBusy(true);
    setDispatchMessage(response === "accepted" ? "Accepting trip…" : "Declining trip…");
    const result = await supabase.rpc("respond_my_dispatch_offer", {
      target_offer_id: offerId,
      target_response: response,
    });
    if (result.error || !result.data) {
      setDispatchMessage(result.error?.message ?? "Offer response failed.");
    } else {
      setDispatch(result.data as unknown as DriverDispatch);
      setDispatchMessage(response === "accepted" ? "Trip accepted." : "Trip declined.");
    }
    setDispatchBusy(false);
  }

  async function refreshDispatch() {
    if (!supabase) return;
    setDispatchBusy(true);
    setDispatchMessage("Checking for trip updates…");
    const result = await supabase.rpc("my_driver_dispatch");
    if (result.error || !result.data) {
      setDispatchMessage(result.error?.message ?? "Dispatch could not be refreshed.");
    } else {
      setDispatch(result.data as unknown as DriverDispatch);
      setDispatchMessage("Dispatch updated.");
    }
    setDispatchBusy(false);
  }

  async function advanceTrip(bookingId: string, action: "arrive" | "start" | "complete") {
    if (!supabase) return;
    setDispatchBusy(true);
    setDispatchMessage("Updating trip…");
    const result = await supabase.rpc("advance_my_trip", {
      target_booking_id: bookingId,
      target_action: action,
    });
    if (result.error || !result.data) {
      setDispatchMessage(result.error?.message ?? "Trip could not be updated.");
    } else {
      setDispatch(result.data as unknown as DriverDispatch);
      setDispatchMessage(action === "complete" ? "Trip completed." : "Trip updated.");
    }
    setDispatchBusy(false);
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
            <section className="availability-card">
              <div className="availability-heading">
                <div>
                  <p className="eyebrow">Availability</p>
                  <h3>
                    {availability?.effectiveStatus === "online"
                      ? "You are online"
                      : "You are offline"}
                  </h3>
                </div>
                <span
                  className={`availability-indicator ${
                    availability?.effectiveStatus === "online" ? "online" : "offline"
                  }`}
                >
                  {availability?.effectiveStatus ?? "offline"}
                </span>
              </div>
              {serviceAreas.length > 0 ? (
                <label>
                  Active operating area
                  <select
                    disabled={updatingServiceArea || availability?.requestedStatus === "online"}
                    onChange={(event) => void selectServiceArea(event.target.value)}
                    value={
                      serviceAreas.find((area) => area.selected)?.serviceAreaId ??
                      availability?.selectedServiceAreaId ??
                      ""
                    }
                  >
                    <option value="" disabled>
                      Select where you will operate
                    </option>
                    {serviceAreas.map((area) => (
                      <option key={area.serviceAreaId} value={area.serviceAreaId}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="eligibility-blockers">
                  No active service area is currently available to your driver account. Contact your
                  tenant administrator.
                </p>
              )}
              {availability?.requestedStatus === "online" ? (
                <p className="document-help">Go offline before changing your operating area.</p>
              ) : null}
              {serviceAreaMessage ? <p className="upload-message">{serviceAreaMessage}</p> : null}
              {availability && !availability.eligible ? (
                <div className="eligibility-blockers">
                  <strong>Complete these before going online:</strong>
                  <ul>
                    {availability.blockers
                      .flatMap((blocker) =>
                        blocker === "service_area_not_selected" && serviceAreas.length === 0
                          ? ["Tenant administrator must make an active service area available"]
                          : availabilityBlockerDetails(
                              blocker,
                              summary.documents,
                              vehicleCompliance?.documents ?? [],
                            ),
                      )
                      .map((blocker, index) => (
                        <li key={`${blocker}-${index}`}>{blocker}</li>
                      ))}
                  </ul>
                </div>
              ) : (
                <p className="document-help">
                  {availability?.selectedServiceAreaName
                    ? `Going online tells your tenant administrator you are ready in ${availability.selectedServiceAreaName}. `
                    : "Going online tells your tenant administrator you are ready for service. "}
                  Location sharing is not enabled.
                </p>
              )}
              <button
                className={availability?.effectiveStatus === "online" ? "secondary" : undefined}
                disabled={
                  updatingAvailability ||
                  (!availability?.eligible && availability?.requestedStatus !== "online")
                }
                onClick={() =>
                  void updateAvailability(
                    availability?.requestedStatus === "online" ? "offline" : "online",
                  )
                }
                type="button"
              >
                {updatingAvailability
                  ? "Updating…"
                  : availability?.requestedStatus === "online"
                    ? "Go offline"
                    : "Go online"}
              </button>
              {availabilityMessage ? <p className="upload-message">{availabilityMessage}</p> : null}
            </section>
            <section className="documents">
              <div>
                <p className="eyebrow">Dispatch</p>
                <h3>
                  {dispatch.offers.length > 0
                    ? "New trip offer"
                    : dispatch.trips.length > 0
                      ? "Active trip"
                      : "No active trip"}
                </h3>
              </div>
              <button
                className="secondary"
                disabled={dispatchBusy}
                onClick={() => void refreshDispatch()}
                type="button"
              >
                Refresh dispatch
              </button>
              {dispatch.offers.map((offer) => (
                <article className="document-card" key={offer.offerId}>
                  <div className="document-heading">
                    <strong>{offer.serviceAreaName}</strong>
                    <span className="status status-pending">offer</span>
                  </div>
                  <span>Customer: {offer.customerName}</span>
                  {offer.customerPhone ? <span>Contact: {offer.customerPhone}</span> : null}
                  <span>Pickup: {offer.pickupAddress}</span>
                  <span>Destination: {offer.destinationAddress}</span>
                  {offer.notes ? <span>Notes: {offer.notes}</span> : null}
                  <div className="row-actions">
                    <button
                      disabled={dispatchBusy}
                      onClick={() => void respondToOffer(offer.offerId, "accepted")}
                      type="button"
                    >
                      Accept trip
                    </button>
                    <button
                      className="secondary"
                      disabled={dispatchBusy}
                      onClick={() => void respondToOffer(offer.offerId, "declined")}
                      type="button"
                    >
                      Decline
                    </button>
                  </div>
                </article>
              ))}
              {dispatch.trips.map((trip) => (
                <article className="document-card" key={trip.bookingId}>
                  <div className="document-heading">
                    <strong>{trip.serviceAreaName}</strong>
                    <span className="status status-approved">
                      {trip.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <span>Customer: {trip.customerName}</span>
                  {trip.customerPhone ? <span>Contact: {trip.customerPhone}</span> : null}
                  <span>Pickup: {trip.pickupAddress}</span>
                  <span>Destination: {trip.destinationAddress}</span>
                  {trip.notes ? <span>Notes: {trip.notes}</span> : null}
                  <button
                    disabled={dispatchBusy}
                    onClick={() =>
                      void advanceTrip(
                        trip.bookingId,
                        trip.status === "accepted"
                          ? "arrive"
                          : trip.status === "arrived"
                            ? "start"
                            : "complete",
                      )
                    }
                    type="button"
                  >
                    {trip.status === "accepted"
                      ? "Mark arrived"
                      : trip.status === "arrived"
                        ? "Start trip"
                        : "Complete trip"}
                  </button>
                </article>
              ))}
              {dispatch.offers.length === 0 && dispatch.trips.length === 0 ? (
                <p className="document-help">
                  Trip offers from your tenant dispatcher will appear here.
                </p>
              ) : null}
              {dispatchMessage ? <p className="upload-message">{dispatchMessage}</p> : null}
            </section>
            <section className="documents">
              <div>
                <p className="eyebrow">Service areas</p>
                <h3>
                  {serviceAreas.length > 0 ? "Available operating areas" : "No area available"}
                </h3>
              </div>
              {serviceAreas.length > 0 ? (
                serviceAreas.map((area) => (
                  <article className="document-card" key={area.serviceAreaId}>
                    <div className="document-heading">
                      <strong>{area.name}</strong>
                      <span className="status status-approved">
                        {area.selected ? "selected" : "available"}
                      </span>
                    </div>
                    {area.description ? <span>{area.description}</span> : null}
                    <span>
                      Center {area.centerLatitude}, {area.centerLongitude} · {area.radiusKm} km
                      radius
                    </span>
                    <span>
                      {area.coverageMode === "all_drivers"
                        ? "Available to all active tenant drivers"
                        : "Access granted by your tenant administrator"}
                    </span>
                  </article>
                ))
              ) : (
                <p className="document-help">
                  Your tenant does not currently have an active service area available to you.
                  Location sharing is not enabled.
                </p>
              )}
            </section>
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
                    // eslint-disable-next-line @next/next/no-img-element -- signed and blob URLs bypass optimization
                    <img
                      alt={`${summary.vehicle.make} ${summary.vehicle.model}`}
                      onError={() => setVehiclePhotoError(true)}
                      onLoad={() => setVehiclePhotoError(false)}
                      src={vehiclePhotoUrl}
                    />
                  ) : null}
                  {vehiclePhotoError ? (
                    <p className="rejection-note">
                      The assigned vehicle photo could not be displayed
                      {vehiclePhotoMessage ? `: ${vehiclePhotoMessage}` : "."}
                    </p>
                  ) : null}
                  {!vehiclePhotoUrl && !summary.vehicle.hasPhoto ? (
                    <p className="document-help">
                      No photo is saved for this assigned vehicle yet.
                    </p>
                  ) : null}
                  {!vehiclePhotoUrl && summary.vehicle.hasPhoto ? (
                    <p className="document-help">Loading the assigned vehicle photo…</p>
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
            {summary.vehicle && vehicleCompliance ? (
              <section className="documents">
                <div>
                  <p className="eyebrow">Vehicle compliance</p>
                  <h3>{vehicleCompliance.compliant ? "Ready for service" : "Action required"}</h3>
                </div>
                <p className="document-help">
                  Keep the documents for your assigned vehicle current. Replacements are reviewed by
                  the tenant administrator.
                </p>
                {(vehicleCompliance.documents ?? []).map((document) => (
                  <article className="document-card" key={document.evidenceType}>
                    <div className="document-heading">
                      <strong>{vehicleEvidenceLabel(document.evidenceType)}</strong>
                      <span className={`status status-${document.reviewStatus}`}>
                        {document.reviewStatus.replaceAll("_", " ")}
                      </span>
                    </div>
                    <span>
                      {document.requiredForService ? "Required for service" : "Optional"}
                      {document.expirationRequired ? " · expiration required" : ""}
                    </span>
                    {document.originalFileName ? <span>{document.originalFileName}</span> : null}
                    {document.expiresOn ? <span>Expires {document.expiresOn}</span> : null}
                    {document.reviewNotes ? (
                      <p className="rejection-note">Review note: {document.reviewNotes}</p>
                    ) : null}
                    {["missing", "rejected", "expired", "expiration_missing"].includes(
                      document.reviewStatus,
                    ) ? (
                      <label className="upload-control">
                        <span>
                          {uploadingType === `vehicle_${document.evidenceType}`
                            ? "Uploading…"
                            : document.reviewStatus === "missing"
                              ? "Upload document"
                              : "Choose replacement"}
                        </span>
                        <input
                          accept="image/jpeg,image/png,application/pdf"
                          disabled={uploadingType !== null}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadVehicleEvidence(document, file);
                            event.target.value = "";
                          }}
                          type="file"
                        />
                      </label>
                    ) : null}
                  </article>
                ))}
              </section>
            ) : null}
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

async function withTimeout<T>(request: PromiseLike<T>, timeoutMs: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(request),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
  ]);
}
