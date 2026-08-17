"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  createIsolatedBrowserSupabaseClient,
  type SupabaseAuthSession,
} from "@esh-platform/supabase";
import { LiveTripMap } from "@esh-platform/maps/client";
import {
  availabilityBlockerDetails,
  availabilityErrorMessage,
  evidenceLabel,
  vehicleEvidenceLabel,
} from "../lib/availability";
import { offerCountdownLabel, offerSecondsRemaining } from "../lib/dispatch";
import { buildEarningsStatement, earningsStatementCsv } from "../lib/earnings-statement";
import { locationErrorMessage } from "../lib/location";
import { currentPushSubscription, pushSupported, vapidApplicationKey } from "../lib/push";

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
  expiresAt: string;
  fareCurrencyCode: string | null;
  fareAmountMinor: number | null;
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
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  fareCurrencyCode: string | null;
  fareAmountMinor: number | null;
};

type DriverDispatch = {
  offers: DriverDispatchOffer[];
  trips: DriverTrip[];
};

type DriverLocationSharing = {
  sharingEnabled: boolean;
  consentedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  recordedAt: string | null;
};
type TripRating = { overall: number; criteria: Record<string, number>; comment: string | null; submittedAt: string };
type ReputationTrip = { bookingId: string; completedAt: string; pickupAddress: string; destinationAddress: string; subjectName: string; canSubmit: boolean; submittedRating: TripRating | null; receivedRating: TripRating | null };
type DriverWalletTrip = { bookingId: string; completedAt: string; pickupAddress: string; destinationAddress: string; fareAmountMinor: number; earningsAmountMinor: number; platformFeeMinor: number; shareBasisPoints: number; paymentCollected: boolean; transferStatus: "pending" | "succeeded" | "failed" | "reversed" | null; earningsReversed: boolean; earningsReversalReason: string | null };
type DriverWallet = { currencyCode: string; balanceMinor: number; pendingMinor: number; availableMinor: number; paidMinor: number; trips: DriverWalletTrip[] };
type DriverPayoutAccount = { exists: boolean; onboardingStatus: "not_started" | "details_required" | "under_review" | "enabled" | "restricted"; detailsSubmitted: boolean; payoutsEnabled: boolean; transfersCapabilityStatus: string | null; requirementsCurrentlyDue: string[]; disabledReason: string | null; updatedAt: string | null };
type DriverBankPayout = { payoutId: string; status: "pending" | "in_transit" | "paid" | "failed" | "canceled"; currencyCode: string; amountMinor: number; automatic: boolean; method: string | null; expectedArrivalAt: string | null; failureCode: string | null; failureMessage: string | null; providerCreatedAt: string; paidAt: string | null; failedAt: string | null; reconciliationStatus: "pending" | "matched" | "partial" | "unmatched" | "unsupported_manual" | "failed"; matchedAmountMinor: number; unmatchedAmountMinor: number; reconciliationError: string | null; reconciledAt: string | null; allocations: Array<{ bookingId: string; amountMinor: number; transferredAt: string | null }> };
type SmsSettings = { enabled: boolean; maskedPhone: string | null; verifiedAt: string | null };

type DriverPortalTab =
  | "overview"
  | "dispatch"
  | "earnings"
  | "location"
  | "reputation"
  | "service_areas"
  | "documents"
  | "vehicle";

const tripSoundPreferenceKey = "esh-driver-trip-sounds-enabled";

export default function DriverHome() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
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
  const [earningsUpdatesEnabled, setEarningsUpdatesEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [smsSettings, setSmsSettings] = useState<SmsSettings>({ enabled: false, maskedPhone: null, verifiedAt: null });
  const [smsPhone, setSmsPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsPending, setSmsPending] = useState(false);
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsFeedback, setSmsFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [vehiclePhotoUrl, setVehiclePhotoUrl] = useState<string | null>(null);
  const [vehiclePhotoError, setVehiclePhotoError] = useState(false);
  const [vehiclePhotoMessage, setVehiclePhotoMessage] = useState<string | null>(null);
  const [vehicleCompliance, setVehicleCompliance] = useState<VehicleCompliance | null>(null);
  const [availability, setAvailability] = useState<DriverAvailability | null>(null);
  const [updatingAvailability, setUpdatingAvailability] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);
  const [locationSharing, setLocationSharing] = useState<DriverLocationSharing | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [updatingLocation, setUpdatingLocation] = useState(false);
  const [locationPermission, setLocationPermission] = useState<
    PermissionState | "unsupported" | "unknown"
  >("unknown");
  const [serviceAreas, setServiceAreas] = useState<DriverServiceArea[]>([]);
  const [updatingServiceArea, setUpdatingServiceArea] = useState(false);
  const [serviceAreaMessage, setServiceAreaMessage] = useState<string | null>(null);
  const automaticAreaAttempt = useRef<string | null>(null);
  const [dispatch, setDispatch] = useState<DriverDispatch>({ offers: [], trips: [] });
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchMessage, setDispatchMessage] = useState<string | null>(null);
  const [reputationTrips, setReputationTrips] = useState<ReputationTrip[]>([]);
  const [wallet, setWallet] = useState<DriverWallet | null>(null);
  const [payoutAccount, setPayoutAccount] = useState<DriverPayoutAccount | null>(null);
  const [bankPayouts, setBankPayouts] = useState<DriverBankPayout[]>([]);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState<string | null>(null);
  const [statementStartDate, setStatementStartDate] = useState(() => firstDayOfCurrentMonth());
  const [statementEndDate, setStatementEndDate] = useState(() => localDateValue(new Date()));
  const [activeTab, setActiveTab] = useState<DriverPortalTab>("overview");
  const [dispatchNow, setDispatchNow] = useState(() => Date.now());
  const [tripSoundsEnabled, setTripSoundsEnabled] = useState(false);
  const [tripSoundMessage, setTripSoundMessage] = useState<string | null>(null);
  const knownDispatchOfferIds = useRef<Set<string>>(new Set());
  const processedAuthCallbacks = useRef(new Set<string>());
  const earningsStatement = useMemo(() => buildEarningsStatement(
    wallet?.trips ?? [], bankPayouts, { startDate: statementStartDate, endDate: statementEndDate },
  ), [bankPayouts, statementEndDate, statementStartDate, wallet?.trips]);

  const downloadEarningsStatement = useCallback(() => {
    if (!wallet) return;
    const csv = earningsStatementCsv(earningsStatement, wallet.currencyCode);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `esh-earnings-${statementStartDate}-to-${statementEndDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [earningsStatement, statementEndDate, statementStartDate, wallet]);

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
    const locationResult = await supabase.rpc("my_driver_location_sharing");
    setLocationSharing(
      locationResult.error || !locationResult.data
        ? null
        : (locationResult.data as unknown as DriverLocationSharing),
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
      const nextDispatch = dispatchResult.data as unknown as DriverDispatch;
      setDispatch(nextDispatch);
      knownDispatchOfferIds.current = new Set(nextDispatch.offers.map(({ offerId }) => offerId));
    }
    const reputationResult = await supabase.rpc("my_driver_reputation");
    setReputationTrips(reputationResult.error ? [] : (reputationResult.data as unknown as ReputationTrip[]));
    const walletResult = await supabase.rpc("my_driver_wallet");
    setWallet(walletResult.error || !walletResult.data ? null : (walletResult.data as unknown as DriverWallet));
    const payoutResult = await supabase.rpc("my_driver_payout_account");
    setPayoutAccount(payoutResult.error || !payoutResult.data ? null : (payoutResult.data as unknown as DriverPayoutAccount));
    const bankPayoutResult = await supabase.rpc("my_driver_bank_payouts");
    setBankPayouts(bankPayoutResult.error ? [] : (bankPayoutResult.data as unknown as DriverBankPayout[]));
    const earningsPreferenceResult = await supabase.rpc("my_driver_earnings_notification_preferences");
    if (!earningsPreferenceResult.error && earningsPreferenceResult.data)
      setEarningsUpdatesEnabled((earningsPreferenceResult.data as { earningsUpdatesEnabled: boolean }).earningsUpdatesEnabled);
    const smsResult = await supabase.rpc("my_driver_sms_notification_settings");
    if (!smsResult.error && smsResult.data) setSmsSettings(smsResult.data as unknown as SmsSettings);
    setVehiclePhotoUrl(null);
    setVehiclePhotoError(false);
    setVehiclePhotoMessage(null);
    setMessage("Driver account connected.");
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !Capacitor.isNativePlatform()) return;
    let cancelled = false;
    let listener: { remove: () => Promise<void> } | null = null;
    const handleCallback = async (url: string) => {
      if (cancelled || processedAuthCallbacks.current.has(url)) return;
      processedAuthCallbacks.current.add(url);
      const callback = new URL(url);
      const callbackError = callback.searchParams.get("error_description") ?? callback.searchParams.get("error");
      if (callbackError) {
        setMessage(`Sign-in could not be completed: ${callbackError}`);
        return;
      }
      const code = callback.searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) setMessage(`Sign-in could not be completed: ${exchangeError.message}`);
        return;
      }
      const hash = new URLSearchParams(callback.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (!accessToken || !refreshToken) return;
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) setMessage(`Sign-in could not be completed: ${sessionError.message}`);
    };
    void App.addListener("appUrlOpen", ({ url }) => void handleCallback(url)).then((handle) => {
      listener = handle;
      void App.getLaunchUrl().then((launch) => {
        if (launch?.url) void handleCallback(launch.url);
      });
    });
    return () => {
      cancelled = true;
      if (listener) void listener.remove();
    };
  }, [supabase]);

  useEffect(() => {
    if (!summary?.driverProfileId) return;
    void currentPushSubscription().then((subscription) => setPushEnabled(Boolean(subscription))).catch(() => undefined);
  }, [summary?.driverProfileId]);

  async function setDriverPush(enabled: boolean) {
    if (!supabase || !summary) return;
    setPushBusy(true); setPreferenceMessage(null);
    try {
      if (!pushSupported()) throw new Error("This browser does not support push notifications.");
      const existing = await currentPushSubscription();
      if (!enabled) {
        if (existing) {
          const disabled = await supabase.rpc("disable_my_push_subscription", { endpoint_value: existing.endpoint });
          if (disabled.error) throw disabled.error;
          await existing.unsubscribe();
        }
        setPushEnabled(false); setPreferenceMessage("Device alerts disabled on this browser."); return;
      }
      if (!vapidPublicKey) throw new Error("Device alerts are not configured for this Driver app.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted.");
      const registration = await navigator.serviceWorker.register("/push-sw.js");
      const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true,
        applicationServerKey: vapidApplicationKey(vapidPublicKey) });
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys.auth) throw new Error("Browser push keys are unavailable.");
      const saved = await supabase.rpc("register_my_driver_push_subscription", {
        endpoint_value: subscription.endpoint, p256dh_key_value: json.keys.p256dh,
        auth_key_value: json.keys.auth, user_agent_value: navigator.userAgent,
      });
      if (saved.error) throw saved.error;
      setPushEnabled(true); setPreferenceMessage("Device alerts enabled on this browser.");
    } catch (value) {
      setPreferenceMessage(value instanceof Error ? value.message : "Device alerts could not be updated.");
    } finally { setPushBusy(false); }
  }

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "earnings")
      setActiveTab("earnings");
  }, []);

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
    setTripSoundsEnabled(window.localStorage.getItem(tripSoundPreferenceKey) === "true");
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocationPermission("unsupported");
      return;
    }
    if (!("permissions" in navigator)) {
      setLocationPermission("unknown");
      return;
    }
    let active = true;
    let permission: PermissionStatus | null = null;
    const updatePermission = () => {
      if (active && permission) setLocationPermission(permission.state);
    };
    void navigator.permissions.query({ name: "geolocation" }).then((result) => {
      if (!active) return;
      permission = result;
      updatePermission();
      permission.addEventListener("change", updatePermission);
    });
    return () => {
      active = false;
      permission?.removeEventListener("change", updatePermission);
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setSummary(null);
      setServiceAreas([]);
      setDispatch({ offers: [], trips: [] });
      setReputationTrips([]);
      setWallet(null);
      setPayoutAccount(null);
      setBankPayouts([]);
      setLocationSharing(null);
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
    const redirectUrl = Capacitor.isNativePlatform()
      ? "https://driver.eshapp.com/auth/callback"
      : (() => {
          const url = new URL(window.location.href);
          url.hash = "";
          return url.toString();
        })();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectUrl, shouldCreateUser: false },
    });
    setMessage(error ? error.message : "Check your email for the secure sign-in link.");
  }

  async function openPayoutRoute(path: "onboarding" | "dashboard") {
    if (!session) return;
    setPayoutBusy(true); setPayoutMessage(null);
    try {
      const response = await fetch(`/api/payouts/${path}`, { method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` } });
      const result = await response.json() as { url?: string; message?: string };
      if (!response.ok || !result.url) throw new Error(result.message ?? "Stripe payout setup is unavailable.");
      if (path === "dashboard") {
        const opened = window.open(result.url, "_blank", "noopener,noreferrer");
        if (!opened) throw new Error("Allow pop-ups to open your Stripe payout account in a new tab.");
        setPayoutBusy(false);
      } else {
        window.location.assign(result.url);
      }
    } catch (value) { setPayoutMessage(value instanceof Error ? value.message : "Stripe payout setup is unavailable."); setPayoutBusy(false); }
  }

  async function transferEarnings(bookingId: string) {
    if (!session) return;
    setPayoutBusy(true); setPayoutMessage(null);
    try {
      const response = await fetch("/api/payouts/transfer", { method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }) });
      const result = await response.json() as { transferred?: boolean; message?: string };
      if (!response.ok || !result.transferred) throw new Error(result.message ?? "Earnings transfer failed.");
      setPayoutMessage("Earnings transferred to your Stripe payout balance.");
      await activateAndLoad();
    } catch (value) { setPayoutMessage(value instanceof Error ? value.message : "Earnings transfer failed."); }
    setPayoutBusy(false);
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

  async function updateEarningsUpdates(enabled: boolean) {
    if (!supabase) return;
    setUpdatingPreferences(true); setPreferenceMessage("Saving earnings email preference…");
    const result = await supabase.rpc("set_my_driver_earnings_notification_preferences", { earnings_updates_enabled_value: enabled });
    if (result.error) setPreferenceMessage(result.error.message);
    else { setEarningsUpdatesEnabled(enabled); setPreferenceMessage(enabled ? "Earnings update emails enabled." : "Earnings update emails disabled."); }
    setUpdatingPreferences(false);
  }

  async function updateDriverSms(action: "start" | "check" | "disable") {
    if (!session || !supabase) return;
    setSmsBusy(true); setSmsFeedback(null);
    try {
      if (action === "disable") {
        const result = await supabase.rpc("disable_my_driver_sms_notifications");
        if (result.error) throw result.error;
        setSmsSettings((current) => ({ ...current, enabled: false })); setSmsPending(false);
        setSmsFeedback({ kind: "success", message: "Text alerts disabled." }); return;
      }
      const response = await fetch("/api/notifications/sms", { method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, phone: smsPhone, code: smsCode }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "SMS verification failed.");
      if (action === "start") { setSmsPending(true); setSmsFeedback({ kind: "success", message: "Verification code sent. Check this phone for the SMS. Standard message rates may apply." }); }
      else { setSmsPending(false); setSmsCode(""); setSmsSettings({ enabled: true, maskedPhone: `••••${smsPhone.replace(/\D/g, "").slice(-4)}`, verifiedAt: new Date().toISOString() }); setSmsFeedback({ kind: "success", message: "Phone verified and transactional text alerts enabled." }); }
    } catch (error) { setSmsFeedback({ kind: "error", message: error instanceof Error ? error.message : "SMS verification failed." }); }
    finally { setSmsBusy(false); }
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
      if (targetStatus === "offline") {
        setLocationSharing((current) =>
          current
            ? {
                ...current,
                sharingEnabled: false,
                latitude: null,
                longitude: null,
                accuracyMeters: null,
                recordedAt: null,
              }
            : current,
        );
        setLocationMessage("Location sharing stopped because you went offline.");
      }
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

  const submitLocation = useCallback(
    async (position: GeolocationPosition) => {
      if (!supabase) return;
      const result = await supabase.rpc("update_my_driver_location", {
        latitude_value: position.coords.latitude,
        longitude_value: position.coords.longitude,
        accuracy_meters_value: position.coords.accuracy,
        recorded_at_value: new Date(position.timestamp).toISOString(),
      });
      if (result.error || !result.data) {
        setLocationMessage(result.error?.message ?? "Location could not be updated.");
      } else {
        setLocationSharing(result.data as unknown as DriverLocationSharing);
        setLocationMessage("Live location shared securely.");
      }
    },
    [supabase],
  );

  async function enableLocationSharing() {
    if (!supabase) return;
    if (!("geolocation" in navigator)) {
      setLocationMessage("This browser does not support location services.");
      return;
    }
    setUpdatingLocation(true);
    setLocationMessage("Requesting precise location permission…");
    try {
      const position = await currentPosition();
      setLocationPermission("granted");
      const result = await supabase.rpc("set_my_driver_location_sharing", {
        enabled_value: true,
      });
      if (result.error) throw result.error;
      setLocationSharing(result.data as unknown as DriverLocationSharing);
      await submitLocation(position);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        Number(error.code) === 1
      )
        setLocationPermission("denied");
      setLocationMessage(locationErrorMessage(error));
    } finally {
      setUpdatingLocation(false);
    }
  }

  async function disableLocationSharing() {
    if (!supabase) return;
    setUpdatingLocation(true);
    const result = await supabase.rpc("set_my_driver_location_sharing", {
      enabled_value: false,
    });
    if (result.error || !result.data) {
      setLocationMessage(result.error?.message ?? "Location sharing could not be stopped.");
    } else {
      setLocationSharing(result.data as unknown as DriverLocationSharing);
      setLocationMessage("Location sharing stopped and the current coordinate was cleared.");
    }
    setUpdatingLocation(false);
  }

  useEffect(() => {
    if (!locationSharing?.sharingEnabled || availability?.requestedStatus !== "online") return;
    let lastSentAt = 0;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (Date.now() - lastSentAt < 10_000) return;
        lastSentAt = Date.now();
        void submitLocation(position);
      },
      (error) => setLocationMessage(locationErrorMessage(error)),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [availability?.requestedStatus, locationSharing?.sharingEnabled, submitLocation]);

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

  useEffect(() => {
    if (!supabase || !session) return;
    const interval = window.setInterval(() => {
      void supabase.rpc("my_driver_dispatch").then((result) => {
        if (!result.error && result.data) {
          const nextDispatch = result.data as unknown as DriverDispatch;
          const newOffers = nextDispatch.offers.filter(
            ({ offerId }) => !knownDispatchOfferIds.current.has(offerId),
          );
          nextDispatch.offers.forEach(({ offerId }) => knownDispatchOfferIds.current.add(offerId));
          setDispatch(nextDispatch);
          if (newOffers.length > 0 && tripSoundsEnabled) {
            void playTripOfferSound().catch(() => {
              setTripSoundMessage(
                "A new offer arrived, but the browser blocked sound. Use Test sound to restore it.",
              );
            });
          }
        }
      });
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [session, supabase, tripSoundsEnabled]);

  useEffect(() => {
    if (dispatch.offers.length === 0) return;
    setDispatchNow(Date.now());
    const interval = window.setInterval(() => setDispatchNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [dispatch.offers.length]);

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

  async function enableTripSounds() {
    try {
      await playTripOfferSound();
      window.localStorage.setItem(tripSoundPreferenceKey, "true");
      setTripSoundsEnabled(true);
      setTripSoundMessage("Trip sounds enabled on this browser.");
    } catch {
      setTripSoundMessage("This browser could not enable trip sounds.");
    }
  }

  function disableTripSounds() {
    window.localStorage.setItem(tripSoundPreferenceKey, "false");
    setTripSoundsEnabled(false);
    setTripSoundMessage("Trip sounds disabled.");
  }

  async function testTripSound() {
    try {
      await playTripOfferSound();
      setTripSoundMessage("Test sound played.");
    } catch {
      setTripSoundMessage("The browser blocked the test sound.");
    }
  }

  async function refreshDispatch() {
    if (!supabase) return;
    setDispatchBusy(true);
    setDispatchMessage("Checking for trip updates…");
    const result = await supabase.rpc("my_driver_dispatch");
    if (result.error || !result.data) {
      setDispatchMessage(result.error?.message ?? "Dispatch could not be refreshed.");
    } else {
      const nextDispatch = result.data as unknown as DriverDispatch;
      const newOffers = nextDispatch.offers.filter(
        ({ offerId }) => !knownDispatchOfferIds.current.has(offerId),
      );
      nextDispatch.offers.forEach(({ offerId }) => knownDispatchOfferIds.current.add(offerId));
      setDispatch(nextDispatch);
      if (newOffers.length > 0 && tripSoundsEnabled) {
        try {
          await playTripOfferSound();
        } catch {
          setTripSoundMessage(
            "A new offer arrived, but the browser blocked sound. Use Test sound to restore it.",
          );
        }
      }
      setDispatchMessage("Dispatch updated.");
    }
    setDispatchBusy(false);
  }

  async function submitTripRating(event: FormEvent<HTMLFormElement>, bookingId: string) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const score = (name: string) => Number(form.get(name));
    const commentEntry = form.get("comment");
    setDispatchBusy(true); setDispatchMessage("Submitting private rating…");
    const result = await supabase.rpc("submit_my_driver_trip_rating", {
      target_booking_id: bookingId, overall_rating_value: score("overall"),
      communication_rating_value: score("communication"), readiness_rating_value: score("readiness"),
      respect_rating_value: score("respect"), comment_value: typeof commentEntry === "string" ? commentEntry : "",
    });
    if (result.error) setDispatchMessage(result.error.message);
    else { setDispatchMessage("Your private trip rating was submitted."); await activateAndLoad(); }
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
      if (action === "complete") {
        const reportedDistance = window.prompt("Optional: enter the completed route distance in miles for Admin review. Leave blank to skip.");
        if (reportedDistance?.trim()) {
          const miles = Number(reportedDistance);
          const meters = Number.isFinite(miles) && miles > 0 ? Math.round(miles * 1609.344) : 0;
          if (meters > 0) {
            const adjustment = await supabase.rpc("submit_my_trip_distance_adjustment", {
              target_booking_id: bookingId,
              actual_distance_meters_value: meters,
            });
            if (adjustment.error) setDispatchMessage(`Trip completed, but distance review was not submitted: ${adjustment.error.message}`);
            else setDispatchMessage("Trip completed. Distance submitted for Admin review.");
          }
        }
        if (session) await fetch("/api/notifications/deliver", {
          method: "POST", headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => undefined);
        const walletResult = await supabase.rpc("my_driver_wallet");
        setWallet(walletResult.error || !walletResult.data ? null : (walletResult.data as unknown as DriverWallet));
        setLocationSharing((current) =>
          current
            ? {
                ...current,
                sharingEnabled: false,
                latitude: null,
                longitude: null,
                accuracyMeters: null,
                recordedAt: null,
              }
            : current,
        );
        setLocationMessage("Location sharing stopped when the trip completed.");
      }
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
            <nav className="driver-tabs" aria-label="Driver portal sections">
              {[
                { key: "overview" as const, label: "Overview" },
                {
                  key: "dispatch" as const,
                  label:
                    dispatch.offers.length > 0
                      ? `Dispatch (${dispatch.offers.length})`
                      : "Dispatch",
                },
                { key: "location" as const, label: "Location" },
                { key: "earnings" as const, label: "Earnings" },
                { key: "reputation" as const, label: "Reputation" },
                { key: "service_areas" as const, label: "Service Areas" },
                { key: "documents" as const, label: "Documents" },
                { key: "vehicle" as const, label: "Vehicle Compliance" },
              ].map((tab) => (
                <button
                  aria-current={activeTab === tab.key ? "page" : undefined}
                  className={activeTab === tab.key ? "active" : "secondary"}
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            {dispatch.offers.length > 0 && activeTab !== "dispatch" ? (
              <div className="dispatch-alert" role="status">
                <strong>New trip offer</strong>
                <span>A time-sensitive offer is waiting. Open Dispatch before it expires.</span>
                <button onClick={() => setActiveTab("dispatch")} type="button">
                  View offer
                </button>
              </div>
            ) : null}
            {activeTab === "overview" ? (
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
                    No active service area is currently available to your driver account. Contact
                    your tenant administrator.
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
                    Live location remains off until you explicitly enable it in the Location tab.
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
                {availabilityMessage ? (
                  <p className="upload-message">{availabilityMessage}</p>
                ) : null}
              </section>
            ) : null}
            {activeTab === "location" ? (
              <section className="availability-card">
                <div className="availability-heading">
                  <div>
                    <p className="eyebrow">Location</p>
                    <h3>Live location sharing</h3>
                  </div>
                  <span
                    className={`availability-indicator ${locationSharing?.sharingEnabled ? "online" : "offline"}`}
                  >
                    {locationSharing?.sharingEnabled ? "sharing" : "off"}
                  </span>
                </div>
                <p className="document-help">
                  Share only your current coordinate with tenant dispatch. Your Rider can see it
                  only after you accept their active trip. ESH does not store your route history.
                </p>
                <dl className="location-details">
                  <div>
                    <dt>Availability</dt>
                    <dd>{availability?.requestedStatus === "online" ? "Online" : "Offline"}</dd>
                  </div>
                  <div>
                    <dt>Operating area</dt>
                    <dd>{availability?.selectedServiceAreaName ?? "Not selected"}</dd>
                  </div>
                  <div>
                    <dt>Browser permission</dt>
                    <dd>{locationPermissionLabel(locationPermission)}</dd>
                  </div>
                  <div>
                    <dt>Last update</dt>
                    <dd>
                      {locationSharing?.recordedAt
                        ? new Date(locationSharing.recordedAt).toLocaleString()
                        : "No coordinate shared"}
                    </dd>
                  </div>
                  <div>
                    <dt>Accuracy</dt>
                    <dd>
                      {locationSharing?.accuracyMeters === null ||
                      locationSharing?.accuracyMeters === undefined
                        ? "Unavailable"
                        : `±${Math.round(locationSharing.accuracyMeters)} m`}
                    </dd>
                  </div>
                  <div>
                    <dt>Automatic stop</dt>
                    <dd>Going offline or ending a trip clears the current coordinate</dd>
                  </div>
                </dl>
                {availability?.requestedStatus !== "online" ? (
                  <p className="eligibility-blockers">
                    Go online from Overview before enabling live location.
                  </p>
                ) : null}
                {locationPermission === "denied" ? (
                  <p className="eligibility-blockers">
                    Location permission is blocked. Allow precise location for driver.eshapp.com in
                    your browser settings, then return here.
                  </p>
                ) : null}
                <div className="row-actions">
                  <button
                    className={locationSharing?.sharingEnabled ? "secondary" : undefined}
                    disabled={
                      updatingLocation ||
                      (!locationSharing?.sharingEnabled &&
                        (availability?.requestedStatus !== "online" ||
                          locationPermission === "unsupported"))
                    }
                    onClick={() =>
                      locationSharing?.sharingEnabled
                        ? void disableLocationSharing()
                        : void enableLocationSharing()
                    }
                    type="button"
                  >
                    {updatingLocation
                      ? "Updating…"
                      : locationSharing?.sharingEnabled
                        ? "Stop sharing location"
                        : "Enable live location"}
                  </button>
                  {locationSharing?.latitude !== null &&
                  locationSharing?.latitude !== undefined &&
                  locationSharing.longitude !== null ? (
                    <a
                      className="button secondary"
                      href={`https://www.openstreetmap.org/?mlat=${locationSharing.latitude}&mlon=${locationSharing.longitude}#map=16/${locationSharing.latitude}/${locationSharing.longitude}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View current location
                    </a>
                  ) : null}
                </div>
                {locationMessage ? <p className="upload-message">{locationMessage}</p> : null}
              </section>
            ) : null}
            {activeTab === "dispatch" ? (
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
                <div className="sound-controls">
                  <div>
                    <strong>Trip offer sound</strong>
                    <span>{tripSoundsEnabled ? "Enabled on this browser" : "Disabled"}</span>
                  </div>
                  <div className="row-actions">
                    <button
                      className={tripSoundsEnabled ? "secondary" : undefined}
                      onClick={() =>
                        tripSoundsEnabled ? disableTripSounds() : void enableTripSounds()
                      }
                      type="button"
                    >
                      {tripSoundsEnabled ? "Disable sound" : "Enable trip sounds"}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => void testTripSound()}
                      type="button"
                    >
                      Test sound
                    </button>
                  </div>
                  <p className="document-help">
                    Sound plays once for each new offer. Visual and email alerts remain active.
                  </p>
                  {tripSoundMessage ? <p className="upload-message">{tripSoundMessage}</p> : null}
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
                    {offer.fareCurrencyCode && offer.fareAmountMinor != null ? <strong>Rider trip fare (not Driver earnings): {new Intl.NumberFormat(undefined, { style: "currency", currency: offer.fareCurrencyCode }).format(offer.fareAmountMinor / 100)}</strong> : null}
                    {offer.notes ? <span>Notes: {offer.notes}</span> : null}
                    <strong className="offer-countdown">
                      {offerCountdownLabel(offer.expiresAt, dispatchNow)}
                    </strong>
                    <div className="row-actions">
                      <button
                        disabled={
                          dispatchBusy || offerSecondsRemaining(offer.expiresAt, dispatchNow) === 0
                        }
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
                    {trip.fareCurrencyCode && trip.fareAmountMinor != null ? <strong>Rider trip fare (not Driver earnings): {new Intl.NumberFormat(undefined, { style: "currency", currency: trip.fareCurrencyCode }).format(trip.fareAmountMinor / 100)}</strong> : null}
                    {trip.notes ? <span>Notes: {trip.notes}</span> : null}
                    {mapboxToken && trip.pickupLatitude != null && trip.pickupLongitude != null && trip.destinationLatitude != null && trip.destinationLongitude != null ? (
                      <LiveTripMap
                        accessToken={mapboxToken}
                        pickup={{ latitude: trip.pickupLatitude, longitude: trip.pickupLongitude, label: `Pickup: ${trip.pickupAddress}` }}
                        destination={{ latitude: trip.destinationLatitude, longitude: trip.destinationLongitude, label: `Destination: ${trip.destinationAddress}` }}
                        driver={locationSharing?.latitude != null && locationSharing.longitude != null ? { latitude: locationSharing.latitude, longitude: locationSharing.longitude, label: "Your live location" } : null}
                      />
                    ) : null}
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
            ) : null}
            {activeTab === "earnings" ? (
              <section className="documents">
                <div>
                  <p className="eyebrow">Earnings</p>
                  <h3>Driver wallet</h3>
                  <p className="document-help">
                    Completed-trip earnings are recorded here as money the platform owes you. Collected earnings can be transferred to your enabled Stripe payout balance; Stripe handles the later bank payout.
                  </p>
                </div>
                <section className="notification-preferences">
                  <div><p className="eyebrow">Notifications</p><h3>Earnings email preferences</h3></div>
                  <label><input checked={earningsUpdatesEnabled} disabled={updatingPreferences} onChange={(event) => void updateEarningsUpdates(event.target.checked)} type="checkbox" /> Email me about earnings, Stripe transfers, and bank payouts</label>
                  {preferenceMessage ? <p className="upload-message">{preferenceMessage}</p> : null}
                </section>
                <article className="document-card">
                  <div className="document-heading"><strong>Payout account</strong><span>{payoutAccount?.onboardingStatus.replaceAll("_", " ") ?? "unavailable"}</span></div>
                  <span>{payoutAccount?.onboardingStatus === "enabled" ? "Stripe has enabled this account to receive future ESH transfers." : payoutAccount?.onboardingStatus === "under_review" ? "Stripe is reviewing the submitted payout information." : payoutAccount?.onboardingStatus === "restricted" ? "Stripe requires attention before payouts can be enabled." : "Set up and verify your payout account on Stripe's secure website."}</span>
                  {payoutAccount?.requirementsCurrentlyDue.length ? <span>Information currently due: {payoutAccount.requirementsCurrentlyDue.length} item(s)</span> : null}
                  {payoutAccount?.disabledReason ? <span>Stripe status: {payoutAccount.disabledReason}</span> : null}
                  <div className="row-actions">
                    {payoutAccount?.onboardingStatus === "enabled" ? <button disabled={payoutBusy} onClick={() => void openPayoutRoute("dashboard")} type="button">Manage payout account</button> : <button disabled={payoutBusy} onClick={() => void openPayoutRoute("onboarding")} type="button">{payoutAccount?.exists ? "Continue payout setup" : "Set up payouts"}</button>}
                  </div>
                  <p className="document-help">ESH never receives or stores your bank account or identity documents. A transfer moves money to your Stripe balance; bank payout timing is managed by Stripe.</p>
                  {payoutMessage ? <p className="upload-message">{payoutMessage}</p> : null}
                </article>
                <div><h4>Bank payout activity</h4>{bankPayouts.length === 0 ? <p className="document-help">Stripe bank payouts will appear here after funds leave your connected Stripe balance.</p> : bankPayouts.map((payout) => <article className="document-card" key={payout.payoutId}><div className="document-heading"><strong>{formatCurrency(payout.amountMinor, payout.currencyCode)}</strong><span>{payout.status.replaceAll("_", " ")}</span></div><span>{payout.automatic ? "Automatic" : "Manual"} {payout.method ?? "standard"} payout · Created {new Date(payout.providerCreatedAt).toLocaleString()}</span>{payout.expectedArrivalAt ? <span>Expected arrival: {new Date(payout.expectedArrivalAt).toLocaleDateString()}</span> : null}<strong>Reconciliation: {payout.reconciliationStatus.replaceAll("_", " ")}</strong>{payout.reconciliationStatus !== "unsupported_manual" ? <span>{formatCurrency(payout.matchedAmountMinor, payout.currencyCode)} matched to {payout.allocations.length} ESH transfer(s){payout.unmatchedAmountMinor ? ` · ${formatCurrency(payout.unmatchedAmountMinor, payout.currencyCode)} unmatched` : ""}</span> : <span>Stripe does not expose automatic allocation for manual payouts.</span>}{payout.allocations.map((allocation) => <span key={allocation.bookingId}>Trip {allocation.bookingId.slice(0, 8)} · {formatCurrency(allocation.amountMinor, payout.currencyCode)}</span>)}{payout.reconciliationError ? <span>Reconciliation needs attention: {payout.reconciliationError}</span> : payout.failureMessage ? <span>Stripe reported: {payout.failureMessage}</span> : payout.failureCode ? <span>Stripe failure: {payout.failureCode}</span> : null}</article>)}</div>
                {wallet ? (
                  <>
                    <dl className="location-details">
                      <div><dt>Pending earnings</dt><dd>{formatCurrency(wallet.pendingMinor, wallet.currencyCode)}</dd></div>
                      <div><dt>Collected earnings</dt><dd>{formatCurrency(wallet.availableMinor, wallet.currencyCode)}</dd></div>
                      <div><dt>Transferred to Stripe</dt><dd>{formatCurrency(wallet.paidMinor, wallet.currencyCode)}</dd></div>
                      <div><dt>Ledger amount owed</dt><dd>{formatCurrency(wallet.balanceMinor, wallet.currencyCode)}</dd></div>
                    </dl>
                    <section className="earnings-statement">
                      <div className="statement-heading">
                        <div><p className="eyebrow">Statement</p><h3>Earnings statement</h3></div>
                        <div className="row-actions print-hidden">
                          <button className="secondary" onClick={downloadEarningsStatement} type="button">Download CSV</button>
                          <button className="secondary" onClick={() => window.print()} type="button">Print statement</button>
                        </div>
                      </div>
                      <div className="statement-dates print-hidden">
                        <label>From<input max={statementEndDate} onChange={(event) => setStatementStartDate(event.target.value)} type="date" value={statementStartDate} /></label>
                        <label>Through<input min={statementStartDate} onChange={(event) => setStatementEndDate(event.target.value)} type="date" value={statementEndDate} /></label>
                      </div>
                      <p className="document-help">{statementStartDate} through {statementEndDate} · Dates use this device&apos;s local time. Automatic bank payouts show reconciled ESH transfers when Stripe exposes their balance activity.</p>
                      <dl className="location-details statement-totals">
                        <div><dt>Completed trips</dt><dd>{earningsStatement.tripCount}</dd></div>
                        <div><dt>Rider fares</dt><dd>{formatCurrency(earningsStatement.grossFaresMinor, wallet.currencyCode)}</dd></div>
                        <div><dt>Driver earnings</dt><dd>{formatCurrency(earningsStatement.earningsMinor, wallet.currencyCode)}</dd></div>
                        <div><dt>Platform fees</dt><dd>{formatCurrency(earningsStatement.platformFeesMinor, wallet.currencyCode)}</dd></div>
                        <div><dt>Pending payment</dt><dd>{formatCurrency(earningsStatement.pendingMinor, wallet.currencyCode)}</dd></div>
                        <div><dt>Collected</dt><dd>{formatCurrency(earningsStatement.collectedMinor, wallet.currencyCode)}</dd></div>
                        <div><dt>Transferred to Stripe</dt><dd>{formatCurrency(earningsStatement.transferredMinor, wallet.currencyCode)}</dd></div>
                        <div><dt>Bank payouts paid</dt><dd>{formatCurrency(earningsStatement.bankPaidMinor, wallet.currencyCode)}</dd></div>
                      </dl>
                      <div className="statement-table-wrap">
                        <table className="statement-table">
                          <thead><tr><th>Date</th><th>Trip</th><th>Rider fare</th><th>Earnings</th><th>Status</th></tr></thead>
                          <tbody>
                            {earningsStatement.trips.map((trip) => <tr key={trip.bookingId}><td>{new Date(trip.completedAt).toLocaleDateString()}</td><td>{trip.pickupAddress}<br /><span>to {trip.destinationAddress}</span></td><td>{formatCurrency(trip.fareAmountMinor, wallet.currencyCode)}</td><td>{formatCurrency(trip.earningsAmountMinor, wallet.currencyCode)}</td><td>{trip.earningsReversed ? "Reversed after refund" : trip.transferStatus === "succeeded" ? "Transferred" : trip.paymentCollected ? "Collected" : "Pending payment"}</td></tr>)}
                            {earningsStatement.trips.length === 0 ? <tr><td colSpan={5}>No completed-trip earnings in this period.</td></tr> : null}
                          </tbody>
                        </table>
                      </div>
                      {earningsStatement.payouts.length ? <div><h4>Bank payout activity in this period</h4>{earningsStatement.payouts.map((payout) => <p className="statement-payout" key={payout.payoutId}><span>{new Date(payout.providerCreatedAt).toLocaleDateString()} · {payout.status.replaceAll("_", " ")}</span><strong>{formatCurrency(payout.amountMinor, payout.currencyCode)}</strong></p>)}</div> : null}
                      <p className="statement-disclaimer">This operational statement is not a tax form. Amounts come from ESH&apos;s immutable trip and transfer records plus Stripe-reported bank payout status.</p>
                    </section>
                    {wallet.trips.map((trip) => (
                      <article className="document-card" key={trip.bookingId}>
                        <div className="document-heading"><strong>{formatCurrency(trip.earningsAmountMinor, wallet.currencyCode)} earned</strong><span>{new Date(trip.completedAt).toLocaleString()}</span></div>
                        <span>{trip.pickupAddress} to {trip.destinationAddress}</span>
                        <span>Rider fare: {formatCurrency(trip.fareAmountMinor, wallet.currencyCode)}</span>
                        <span>Your share: {(trip.shareBasisPoints / 100).toFixed(2).replace(/\.00$/, "")}% · Platform fee: {formatCurrency(trip.platformFeeMinor, wallet.currencyCode)} · {trip.paymentCollected ? "Rider payment collected" : "Payment not collected"}</span>
                        {trip.earningsReversed ? <strong>Earnings reversed after the Rider received a completed-trip refund</strong> : trip.transferStatus === "succeeded" ? <strong>Transferred to your Stripe balance</strong> : trip.paymentCollected && payoutAccount?.onboardingStatus === "enabled" ? <button disabled={payoutBusy || trip.transferStatus === "pending"} onClick={() => void transferEarnings(trip.bookingId)} type="button">{trip.transferStatus === "failed" ? "Retry transfer" : "Transfer to Stripe"}</button> : null}
                      </article>
                    ))}
                    {wallet.trips.length === 0 ? <p className="document-help">Your completed priced trips will appear here.</p> : null}
                  </>
                ) : <p className="document-help">Wallet information is not available yet.</p>}
              </section>
            ) : null}
            {activeTab === "reputation" ? (
              <section className="documents">
                <div><p className="eyebrow">Reputation</p><h3>Post-trip ratings</h3><p className="document-help">Ratings stay private until both sides submit, or seven days pass.</p></div>
                {reputationTrips.map((trip) => {
                  return <article className="document-card" key={trip.bookingId}>
                    <div className="document-heading"><strong>{trip.subjectName}</strong><span>{new Date(trip.completedAt).toLocaleString()}</span></div>
                    <span>{trip.pickupAddress} to {trip.destinationAddress}</span>
                    {trip.submittedRating ? <span>Your rating: {trip.submittedRating.overall}/5</span> : null}
                    {trip.receivedRating ? <span>Rider rating: {trip.receivedRating.overall}/5{trip.receivedRating.comment ? ` · ${trip.receivedRating.comment}` : ""}</span> : null}
                    {trip.canSubmit ? <form className="upload-form" onSubmit={(event) => void submitTripRating(event, trip.bookingId)}>
                      {[["overall", "Overall"], ["communication", "Communication"], ["readiness", "Readiness"], ["respect", "Respect"]].map(([name, label]) => <label key={name}>{label}<select name={name} defaultValue="5">{[5,4,3,2,1].map((value) => <option value={value} key={value}>{value} / 5</option>)}</select></label>)}
                      <label>Optional comment<textarea name="comment" maxLength={1000} rows={3} /></label>
                      <button disabled={dispatchBusy} type="submit">Submit private rating</button>
                    </form> : !trip.submittedRating ? <span>The 30-day rating window has closed.</span> : null}
                  </article>;
                })}
                {reputationTrips.length === 0 ? <p className="document-help">Completed Rider trips will appear here.</p> : null}
                {dispatchMessage ? <p className="upload-message">{dispatchMessage}</p> : null}
              </section>
            ) : null}
            {activeTab === "service_areas" ? (
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
                    Selecting an area does not share location. Live sharing is a separate Driver
                    control.
                  </p>
                )}
              </section>
            ) : null}
            {activeTab === "vehicle" ? (
              <section className="assigned-vehicle">
                <div>
                  <p className="eyebrow">Assigned fleet vehicle</p>
                  <h3>
                    {summary.vehicle
                      ? `${summary.vehicle.modelYear} ${summary.vehicle.make} ${summary.vehicle.model}`
                      : "No vehicle assigned"}
                  </h3>
                </div>
                {uploadMessage ? <p className="upload-message">{uploadMessage}</p> : null}
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
            ) : null}
            {activeTab === "documents" ? (
              <section className="documents">
                <div>
                  <p className="eyebrow">Documents</p>
                  <h3>Evidence status</h3>
                </div>
                <p className="document-help">
                  Upload a replacement when evidence is missing, rejected, or expired. JPEG, PNG,
                  and PDF files up to 5MB are accepted.
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
            ) : null}
            {activeTab === "vehicle" && summary.vehicle && vehicleCompliance ? (
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
            {activeTab === "documents" ? (
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
            ) : null}
            <section className="notification-preferences">
              <div><p className="eyebrow">Device alerts</p><h3>Browser push notifications</h3></div>
              <label><input checked={pushEnabled} disabled={pushBusy || !pushSupported()} onChange={(event) => void setDriverPush(event.target.checked)} type="checkbox" /> Alert this browser about urgent trip, earnings, and payout updates</label>
              <p>Lock-screen alerts use privacy-safe summaries and never include Rider addresses or financial account details.</p>
              {preferenceMessage ? <p className="upload-message">{preferenceMessage}</p> : null}
            </section>
            <section className="notification-preferences">
              <div><p className="eyebrow">Text alerts</p><h3>Transactional SMS</h3></div>
              <p>Opt in to privacy-safe texts for new trip offers and urgent payout issues. Message and data rates may apply. No marketing messages.</p>
              {smsSettings.enabled ? <><strong>On · verified {smsSettings.maskedPhone}</strong><button className="secondary" disabled={smsBusy} onClick={() => void updateDriverSms("disable")} type="button">Turn off texts</button></> : <>
                <label>Mobile number<input value={smsPhone} onChange={(event) => setSmsPhone(event.target.value)} placeholder="+12155550123" inputMode="tel" /></label>
                {!smsPending ? <button className="secondary" disabled={smsBusy || !smsPhone} onClick={() => void updateDriverSms("start")} type="button">Send verification code</button> : <><label>Verification code<input value={smsCode} onChange={(event) => setSmsCode(event.target.value)} inputMode="numeric" /></label><button className="secondary" disabled={smsBusy || !smsCode} onClick={() => void updateDriverSms("check")} type="button">Verify and enable texts</button></>}
              </>}
              {smsFeedback ? <p className={smsFeedback.kind === "error" ? "form-error" : "upload-message"} role="status">{smsFeedback.message}</p> : null}
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

function currentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20_000,
    });
  });
}

function formatCurrency(amountMinor: number, currencyCode: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode }).format(amountMinor / 100);
}

function localDateValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function firstDayOfCurrentMonth() {
  const date = new Date();
  date.setDate(1);
  return localDateValue(date);
}

function locationPermissionLabel(permission: PermissionState | "unsupported" | "unknown") {
  return {
    granted: "Allowed",
    denied: "Blocked",
    prompt: "Will ask when enabled",
    unsupported: "Not supported by this browser",
    unknown: "Controlled by browser",
  }[permission];
}

async function withTimeout<T>(request: PromiseLike<T>, timeoutMs: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(request),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

let tripAudioContext: AudioContext | null = null;

async function playTripOfferSound() {
  const AudioContextClass =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("Web Audio is unavailable.");
  tripAudioContext ??= new AudioContextClass();
  if (tripAudioContext.state === "suspended") await tripAudioContext.resume();

  const startAt = tripAudioContext.currentTime;
  const notes = [
    { frequency: 659.25, offset: 0 },
    { frequency: 880, offset: 0.18 },
  ];
  notes.forEach(({ frequency, offset }) => {
    const oscillator = tripAudioContext!.createOscillator();
    const gain = tripAudioContext!.createGain();
    const noteStart = startAt + offset;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.18, noteStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.22);
    oscillator.connect(gain);
    gain.connect(tripAudioContext!.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.24);
  });
}
