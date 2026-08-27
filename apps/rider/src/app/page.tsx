"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import Image from "next/image";
import {
  createIsolatedBrowserSupabaseClient,
  type SupabaseAuthSession,
} from "@esh-platform/supabase";
import {
  retrieveAddressSuggestion,
  reverseGeocodeAddress,
  suggestRegionalAddresses,
  type AddressSuggestion,
} from "@esh-platform/maps";
import { LiveTripMap } from "@esh-platform/maps/client";
import {
  bookingStatusLabel,
  canCancelBooking,
  formatDateTimeInputInZone,
  normalizeTenantSlug,
  riderErrorMessage,
  zonedDateTimeToIso,
  generateRecurringPickupTimes,
} from "./booking";
import { currentPushSubscription, pushSupported, pushUnavailableMessage, vapidApplicationKey } from "../lib/push";
import {
  EMPTY_RIDER_SMS_SETTINGS,
  FAIR_FARE_PRIVACY_POLICY_URL,
  normalizeE164,
  smsConsentStatusMessage,
  type RiderSmsSettings,
} from "../lib/sms-consent";
import appIcon from "../../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png";

type BookingTenant = { tenant_slug: string; display_name: string };
type ServiceArea = { serviceAreaId: string; name: string; description: string | null };
type RiderProfile = {
  riderProfileId: string;
  displayName: string;
  email: string;
  phone: string | null;
  accessibilityNotes: string | null;
  status: string;
};
type RiderBooking = {
  bookingId: string;
  serviceAreaId: string;
  serviceAreaName: string;
  pickupAddress: string;
  destinationAddress: string;
  bookingNotes: string | null;
  status: string;
  createdAt: string;
  scheduledPickupAt: string | null;
  dispatchReadyAt: string | null;
  pickupLatitude?: number | null;
  pickupLongitude?: number | null;
  destinationLatitude?: number | null;
  destinationLongitude?: number | null;
  fareCurrencyCode?: string | null;
  estimatedFareMinor?: number | null;
  finalFareMinor?: number | null;
  farePolicy?: "guaranteed_upfront" | "metered_actual" | "protected_flexible" | null;
  maximumFareMinor?: number | null;
  reconciliationStatus?: string | null;
  contractFareMinor?: number | null;
  rawMeterFareMinor?: number | null;
  fareAdjustmentMinor?: number | null;
  refundAmountMinor?: number | null;
  refundCurrencyCode?: string | null;
  refundStatus?: string | null;
  driver: { displayName: string; driverNumber: string } | null;
  vehicle: {
    vehicleNumber: string;
    make: string;
    model: string;
    modelYear: number;
    color: string;
    licensePlate: string;
  } | null;
};
type RiderPortal = {
  tenant: { tenantId: string; tenantSlug: string; displayName: string };
  profile: RiderProfile | null;
  serviceAreas: ServiceArea[];
  bookings: RiderBooking[];
};
type RiderNotificationPreferences = { tripUpdatesEnabled: boolean; paymentUpdatesEnabled: boolean };
type RiderScheduling = {
  timeZone: string;
  settings: {
    minimumNoticeMinutes: number;
    maximumAdvanceDays: number;
    dispatchLeadMinutes: number;
    reminderLeadHours: number;
  };
  bookings: Array<{
    bookingId: string;
    scheduledPickupAt: string | null;
    dispatchReadyAt: string | null;
  }>;
};
type RiderTripLocation = {
  bookingId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  recordedAt: string;
  fresh: boolean;
};
type ServiceAreaContext = { latitude: number; longitude: number; radiusKm: number };
type RiderPriceQuote = { quoteId: string; fareAmountMinor: number; baseFareAmountMinor?: number; tollAmountMinor?: number; tolls?: Array<{ facility: string; amountMinor: number }>; currencyCode: string; fractionDigits: number; expiresAt: string; pickupAddress: string; destinationAddress: string; routeDistanceMeters: number; routeDurationSeconds: number; farePolicy: "guaranteed_upfront" | "metered_actual" | "protected_flexible"; maximumFareMinor: number | null };
type PaidRiderPriceQuote = Omit<RiderPriceQuote, "fractionDigits"> & { serviceAreaId: string };
type RiderPayment = {
  paymentAttemptId: string;
  bookingId: string | null;
  amountMinor: number;
  currencyCode: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
  refundAmountMinor: number | null;
  refundStatus: string | null;
  refundedAt: string | null;
  disputes: RiderPaymentDispute[];
};
type RiderPaymentDispute = { disputeId: string; amountMinor: number; feeMinor: number; status: string; reason: string; evidenceDueAt: string | null; fundsWithdrawnAt: string | null; fundsWithdrawnMinor: number; fundsReinstatedAt: string | null; fundsReinstatedMinor: number };
type RiderWallet = { currencyCode: string; fractionDigits: number; balanceMinor: number; availableMinor: number; entries: Array<{ entryId: string; direction: "credit" | "debit"; entryType: string; amountMinor: number; description: string; bookingId: string | null; createdAt: string }> };
type RiderBookingSeries = { seriesId: string; serviceAreaId: string; pickupAddress: string; destinationAddress: string; timeZone: string; localPickupTime: string; weekdays: number[]; startDate: string; endDate: string; status: string; autopayEnabled: boolean; createdAt: string };
type RiderSeriesOccurrence = { occurrenceId: string; seriesId: string; scheduledPickupAt: string; status: string; autopayStatus: string; autopayFailureMessage: string | null; quoteId: string | null; bookingId: string | null };
type RiderSeriesSummary = { savedPaymentMethod: { brand: string | null; last4: string | null; expiresMonth: number | null; expiresYear: number | null } | null; series: RiderBookingSeries[]; occurrences: RiderSeriesOccurrence[] };
type TripRating = { overall: number; criteria: Record<string, number>; comment: string | null; submittedAt: string };
type ReputationTrip = {
  bookingId: string; completedAt: string; pickupAddress: string; destinationAddress: string;
  subjectName: string; canSubmit: boolean; submittedRating: TripRating | null; receivedRating: TripRating | null;
};
const riderServiceTypes = [
  { id: "standard", label: "Standard", vehicle: "2024 Toyota Camry", capacity: "4 passengers", positioning: "Everyday affordable rides", image: "/images/camry.png.png" },
  { id: "larger", label: "XL", vehicle: "2024 Toyota Sienna", capacity: "6 passengers", positioning: "Groups, families, and luggage", image: "/images/sienna.png.png" },
  { id: "premium", label: "Premium SUV", vehicle: "2024 Chevrolet Tahoe", capacity: "6 passengers", positioning: "Premium airport, business, and group travel", image: "/images/tahoe.png.png" },
  { id: "accessible", label: "Accessible", vehicle: "2024 Chrysler Pacifica WAV", capacity: "WAV configuration", positioning: "Wheelchair-accessible transportation", image: "/images/chrysler.png.png" },
] as const;

function formatDate(value: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
}

function formatLocationAge(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return `${seconds} seconds ago`;
  return `${Math.floor(seconds / 60)} minutes ago`;
}

function formValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export default function RiderHome() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const supabase = useMemo(
    () =>
      supabaseUrl && supabaseAnonKey
        ? createIsolatedBrowserSupabaseClient("esh-rider-portal-auth", {
            url: supabaseUrl,
            anonKey: supabaseAnonKey,
          })
        : null,
    [supabaseAnonKey, supabaseUrl],
  );
  const [session, setSession] = useState<SupabaseAuthSession | null>(null);
  const [tenants, setTenants] = useState<BookingTenant[]>([]);
  const [tenantSlug, setTenantSlug] = useState("");
  const [portal, setPortal] = useState<RiderPortal | null>(null);
  const [notificationPreferences, setNotificationPreferences] =
    useState<RiderNotificationPreferences | null>(null);
  const [scheduling, setScheduling] = useState<RiderScheduling | null>(null);
  const [tripLocations, setTripLocations] = useState<RiderTripLocation[]>([]);
  const [reputationTrips, setReputationTrips] = useState<ReputationTrip[]>([]);
  const [payments, setPayments] = useState<RiderPayment[]>([]);
  const [wallet, setWallet] = useState<RiderWallet | null>(null);
  const [recurring, setRecurring] = useState<RiderSeriesSummary>({ savedPaymentMethod: null, series: [], occurrences: [] });
  const [recurringOccurrenceId, setRecurringOccurrenceId] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<Record<string, string>>({});
  const [paymentReceiptUrls, setPaymentReceiptUrls] = useState<Record<string, string>>({});
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null);
  const [bookingTiming, setBookingTiming] = useState<"now" | "scheduled" | "recurring">("now");
  const [serviceType, setServiceType] = useState<"standard" | "larger" | "premium" | "accessible">("standard");
  const [serviceAreaId, setServiceAreaId] = useState("");
  const [serviceAreaContext, setServiceAreaContext] = useState<ServiceAreaContext | null>(null);
  const [pickupQuery, setPickupQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [pickupSuggestions, setPickupSuggestions] = useState<AddressSuggestion[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<AddressSuggestion[]>([]);
  const [pickupSelection, setPickupSelection] = useState<AddressSuggestion | null>(null);
  const [destinationSelection, setDestinationSelection] = useState<AddressSuggestion | null>(null);
  const [priceQuote, setPriceQuote] = useState<RiderPriceQuote | null>(null);
  const [pickupSearchSession, setPickupSearchSession] = useState("");
  const [destinationSearchSession, setDestinationSearchSession] = useState("");
  const [locationBusy, setLocationBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    setError("");
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      window.location.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign out. Please try again.");
      setBusy(false);
    }
  }
  const [smsSettings, setSmsSettings] = useState<RiderSmsSettings>(EMPTY_RIDER_SMS_SETTINGS);
  const [smsPhone, setSmsPhone] = useState("");
  const [smsConsentChecked, setSmsConsentChecked] = useState(false);
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsFeedback, setSmsFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const smsConsentEditing = useRef(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [nativePaymentReturnNonce, setNativePaymentReturnNonce] = useState(0);
  const [activePortalTab, setActivePortalTab] = useState<"account" | "book" | "trips" | "payments" | "wallet">("book");
  const [showTripHistory, setShowTripHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const serviceAreaContextRequest = useRef(0);
  const processedAuthCallbacks = useRef(new Set<string>());

  useEffect(() => {
    if (!mapboxToken || !serviceAreaContext || !pickupSearchSession || pickupSelection) {
      setPickupSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void suggestRegionalAddresses({
        accessToken: mapboxToken,
        context: serviceAreaContext,
        query: pickupQuery,
        radiusKm: serviceAreaContext.radiusKm,
        sessionToken: pickupSearchSession,
        types: "address",
        signal: controller.signal,
      }).then(setPickupSuggestions).catch((value: unknown) => {
        if (!controller.signal.aborted)
          setError(value instanceof Error ? value.message : "Pickup suggestions are unavailable.");
      });
    }, 350);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [mapboxToken, pickupQuery, pickupSearchSession, pickupSelection, serviceAreaContext]);

  useEffect(() => {
    if (!mapboxToken || !serviceAreaContext || !destinationSearchSession || destinationSelection) {
      setDestinationSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void suggestRegionalAddresses({
        accessToken: mapboxToken,
        context: serviceAreaContext,
        query: destinationQuery,
        radiusKm: 800,
        sessionToken: destinationSearchSession,
        types: "address,poi",
        signal: controller.signal,
      }).then(setDestinationSuggestions).catch((value: unknown) => {
        if (!controller.signal.aborted)
          setError(value instanceof Error ? value.message : "Destination suggestions are unavailable.");
      });
    }, 350);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [destinationQuery, destinationSearchSession, destinationSelection, mapboxToken, serviceAreaContext]);

  const loadPortal = useCallback(async () => {
    if (!supabase || !session || !tenantSlug) return;
    const { data, error: portalError } = await supabase.rpc("my_rider_portal", {
      target_tenant_slug: tenantSlug,
    });
    if (portalError) throw portalError;
    const nextPortal = data as RiderPortal;
    setPortal(nextPortal);
    if (nextPortal.profile) {
      const [preferenceResult, schedulingResult, locationResult, coordinateResult, quoteResult, reconciliationResult, reputationResult, refundResult, smsResult] = await Promise.all([
        supabase.rpc("my_rider_notification_preferences", { target_tenant_slug: tenantSlug }),
        supabase.rpc("my_rider_scheduling", { target_tenant_slug: tenantSlug }),
        supabase.rpc("my_rider_trip_locations", { target_tenant_slug: tenantSlug }),
        supabase.from("dispatch_bookings").select("booking_id,pickup_latitude,pickup_longitude,destination_latitude,destination_longitude,fare_currency_code,estimated_fare_minor,final_fare_minor").eq("tenant_id", nextPortal.tenant.tenantId),
        supabase.from("trip_price_quotes").select("booking_id,fare_policy,maximum_fare_minor").eq("tenant_id", nextPortal.tenant.tenantId).not("booking_id", "is", null),
        supabase.from("trip_fare_reconciliations").select("booking_id,status,calculated_fare_minor,raw_calculated_fare_minor,adjustment_minor").eq("tenant_id", nextPortal.tenant.tenantId),
        supabase.rpc("my_rider_reputation", { target_tenant_slug: tenantSlug }),
        supabase.from("rider_payment_refunds").select("booking_id,amount_minor,currency_code,status").eq("tenant_id", nextPortal.tenant.tenantId),
        supabase.rpc("my_rider_sms_notification_settings", { target_tenant_slug: tenantSlug }),
      ]);
      const { data: preferenceData, error: preferenceError } = preferenceResult;
      if (preferenceError) throw preferenceError;
      if (schedulingResult.error) throw schedulingResult.error;
      if (locationResult.error) throw locationResult.error;
      if (coordinateResult.error) throw coordinateResult.error;
      if (quoteResult.error) throw quoteResult.error;
      if (reconciliationResult.error && !reconciliationResult.error.message.includes("trip_fare_reconciliations")) throw reconciliationResult.error;
      if (reputationResult.error) throw reputationResult.error;
      if (refundResult.error) throw refundResult.error;
      if (!smsResult.error && smsResult.data) {
        const nextSmsSettings = smsResult.data as unknown as RiderSmsSettings;
        setSmsSettings(nextSmsSettings);
        if (!smsConsentEditing.current) {
          setSmsPhone(nextSmsSettings.phoneE164 ?? nextPortal.profile.phone ?? "");
          setSmsConsentChecked(nextSmsSettings.consented);
        }
      }
      setReputationTrips((reputationResult.data ?? []) as unknown as ReputationTrip[]);
      setTripLocations((locationResult.data ?? []) as unknown as RiderTripLocation[]);
      setNotificationPreferences(preferenceData as RiderNotificationPreferences);
      const nextScheduling = schedulingResult.data as RiderScheduling;
      setScheduling(nextScheduling);
      const schedules = new Map(nextScheduling.bookings.map((item) => [item.bookingId, item]));
      const coordinates = new Map((coordinateResult.data ?? []).map((item) => [item.booking_id, item]));
      const quoteContracts = new Map((quoteResult.data ?? []).map((item) => [item.booking_id, item]));
      const reconciliations = new Map((reconciliationResult.data ?? []).map((item) => [item.booking_id, item]));
      const refunds = new Map((refundResult.data ?? []).map((item) => [item.booking_id, item]));
      setPortal({
        ...nextPortal,
        bookings: nextPortal.bookings.map((booking) => ({
          ...booking,
          scheduledPickupAt: schedules.get(booking.bookingId)?.scheduledPickupAt ?? null,
          dispatchReadyAt: schedules.get(booking.bookingId)?.dispatchReadyAt ?? null,
          pickupLatitude: coordinates.get(booking.bookingId)?.pickup_latitude ?? null,
          pickupLongitude: coordinates.get(booking.bookingId)?.pickup_longitude ?? null,
          destinationLatitude: coordinates.get(booking.bookingId)?.destination_latitude ?? null,
          destinationLongitude: coordinates.get(booking.bookingId)?.destination_longitude ?? null,
          fareCurrencyCode: coordinates.get(booking.bookingId)?.fare_currency_code ?? null,
          estimatedFareMinor: coordinates.get(booking.bookingId)?.estimated_fare_minor ?? null,
          finalFareMinor: coordinates.get(booking.bookingId)?.final_fare_minor ?? null,
          farePolicy: quoteContracts.get(booking.bookingId)?.fare_policy as RiderBooking["farePolicy"] ?? null,
          maximumFareMinor: quoteContracts.get(booking.bookingId)?.maximum_fare_minor ?? null,
          reconciliationStatus: reconciliations.get(booking.bookingId)?.status ?? null,
          contractFareMinor: reconciliations.get(booking.bookingId)?.calculated_fare_minor ?? null,
          rawMeterFareMinor: reconciliations.get(booking.bookingId)?.raw_calculated_fare_minor ?? null,
          fareAdjustmentMinor: reconciliations.get(booking.bookingId)?.adjustment_minor ?? null,
          refundAmountMinor: refunds.get(booking.bookingId)?.amount_minor ?? null,
          refundCurrencyCode: refunds.get(booking.bookingId)?.currency_code ?? null,
          refundStatus: refunds.get(booking.bookingId)?.status ?? null,
        })),
      });
    } else {
      setNotificationPreferences(null);
      setTripLocations([]);
      setReputationTrips([]);
    }
  }, [session, supabase, tenantSlug]);

  const loadPayments = useCallback(async () => {
    if (!supabase || !session || !portal) return;
    const [paymentResult, refundResult, disputeResult] = await Promise.all([
      supabase.from("rider_payment_attempts")
        .select("payment_attempt_id,booking_id,amount_minor,currency_code,status,paid_at,created_at")
        .eq("tenant_id", portal.tenant.tenantId).order("created_at", { ascending: false }),
      supabase.from("rider_payment_refunds")
        .select("payment_attempt_id,amount_minor,status,refunded_at")
        .eq("tenant_id", portal.tenant.tenantId),
      supabase.from("rider_payment_disputes")
        .select("rider_payment_dispute_id,payment_attempt_id,amount_minor,fee_minor,status,reason,evidence_due_at,funds_withdrawn_at,funds_withdrawn_minor,funds_reinstated_at,funds_reinstated_minor")
        .eq("tenant_id", portal.tenant.tenantId).order("created_at", { ascending: false }),
    ]);
    if (paymentResult.error) throw paymentResult.error;
    if (refundResult.error) throw refundResult.error;
    if (disputeResult.error) throw disputeResult.error;
    const refunds = new Map((refundResult.data ?? []).map((refund) => [refund.payment_attempt_id, refund]));
    const disputes = new Map<string, RiderPaymentDispute[]>();
    for (const dispute of disputeResult.data ?? []) {
      const records = disputes.get(dispute.payment_attempt_id) ?? [];
      records.push({ disputeId: dispute.rider_payment_dispute_id, amountMinor: dispute.amount_minor, feeMinor: dispute.fee_minor, status: dispute.status, reason: dispute.reason, evidenceDueAt: dispute.evidence_due_at, fundsWithdrawnAt: dispute.funds_withdrawn_at, fundsWithdrawnMinor: dispute.funds_withdrawn_minor, fundsReinstatedAt: dispute.funds_reinstated_at, fundsReinstatedMinor: dispute.funds_reinstated_minor });
      disputes.set(dispute.payment_attempt_id, records);
    }
    setPayments((paymentResult.data ?? []).map((payment) => {
      const refund = refunds.get(payment.payment_attempt_id);
      return {
        paymentAttemptId: payment.payment_attempt_id,
        bookingId: payment.booking_id,
        amountMinor: payment.amount_minor,
        currencyCode: payment.currency_code,
        status: payment.status,
        paidAt: payment.paid_at,
        createdAt: payment.created_at,
        refundAmountMinor: refund?.amount_minor ?? null,
        refundStatus: refund?.status ?? null,
        refundedAt: refund?.refunded_at ?? null,
        disputes: disputes.get(payment.payment_attempt_id) ?? [],
      };
    }));
  }, [portal, session, supabase]);

  const loadWallet = useCallback(async () => {
    if (!supabase || !session || !tenantSlug) return;
    const result = await supabase.rpc("my_rider_wallet", { target_tenant_slug: tenantSlug });
    if (result.error) throw result.error;
    setWallet(result.data as unknown as RiderWallet);
  }, [session, supabase, tenantSlug]);

  const loadRecurring = useCallback(async () => {
    if (!supabase || !session || !tenantSlug) return;
    const result = await supabase.rpc("my_rider_booking_series", { target_tenant_slug: tenantSlug });
    if (result.error) throw result.error;
    setRecurring(result.data as unknown as RiderSeriesSummary);
  }, [session, supabase, tenantSlug]);

  useEffect(() => {
    if (!session || !supabase || !tenantSlug) return;
    const params = new URLSearchParams(window.location.search);
    const returnedQuoteId = params.get("quote");
    const returnedOccurrenceId = params.get("occurrence");
    if (params.get("payment") !== "success" || !returnedQuoteId) return;
    const clearPaymentReturnParams = () => {
      const recoveredUrl = new URL(window.location.href);
      recoveredUrl.searchParams.delete("payment");
      recoveredUrl.searchParams.delete("quote");
      recoveredUrl.searchParams.delete("occurrence");
      window.history.replaceState({}, "", recoveredUrl);
    };
    setBusy(true);
    setMessage("Payment received. Confirming your trip…");
    void (async () => {
      type PaymentReturn = { paymentStatus?: string; bookingId?: string | null; quote?: PaidRiderPriceQuote; message?: string };
      let result: PaymentReturn | null = null;
      for (let attempt = 0; attempt < 15; attempt += 1) {
        const response = await fetch(`/api/payments/checkout?quote=${encodeURIComponent(returnedQuoteId)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const next = await response.json() as PaymentReturn;
        if (response.ok && next?.paymentStatus === "paid" && next.quote) {
          result = next;
          break;
        }
        if (attempt < 14) await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
      if (!result?.quote) throw new Error("Payment confirmation is taking longer than expected. Please refresh shortly.");
      if (result.bookingId && !returnedOccurrenceId) {
        clearPaymentReturnParams();
        setPaymentConfirmed(false);
        setPriceQuote(null);
        await loadPortal();
        setActivePortalTab("trips");
        setMessage("Payment received and trip requested. Dispatch can now find an eligible driver.");
        return;
      }
      setPriceQuote({ ...result.quote, fractionDigits: 2 });
      setServiceAreaId(result.quote.serviceAreaId);
      const area = await supabase.rpc("my_rider_service_area_context", {
        target_tenant_slug: tenantSlug,
        target_service_area_id: result.quote.serviceAreaId,
      });
      if (area.error || !area.data) throw area.error ?? new Error("Paid trip service area is unavailable.");
      setServiceAreaContext(area.data as ServiceAreaContext);
      setPickupQuery(result.quote.pickupAddress);
      setDestinationQuery(result.quote.destinationAddress);
      setPickupSelection({ mapboxId: `paid:${result.quote.quoteId}:pickup`, label: result.quote.pickupAddress });
      setDestinationSelection({ mapboxId: `paid:${result.quote.quoteId}:destination`, label: result.quote.destinationAddress });
      setPaymentConfirmed(true);
      setRecurringOccurrenceId(returnedOccurrenceId);
      setActivePortalTab("book");
      clearPaymentReturnParams();
      setMessage(returnedOccurrenceId ? "Payment received. This recurring occurrence is ready to request." : "Payment received. Review the trip, then request it once.");
    })().catch((value) => setError(value instanceof Error ? value.message : "We could not confirm the payment."))
      .finally(() => setBusy(false));
  }, [session, supabase, tenantSlug, nativePaymentReturnNonce]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    void Promise.all([supabase.auth.getSession(), supabase.rpc("list_rider_booking_tenants")]).then(
      ([authResult, tenantResult]) => {
        if (!active) return;
        setSession(authResult.data.session);
        const available = (tenantResult.data ?? []) as BookingTenant[];
        setTenants(available);
        const requested =
          typeof window === "undefined"
            ? ""
            : normalizeTenantSlug(new URLSearchParams(window.location.search).get("tenant"));
        setTenantSlug(
          available.some((tenant) => tenant.tenant_slug === requested)
            ? requested
            : (available[0]?.tenant_slug ?? ""),
        );
        if (tenantResult.error) setError(tenantResult.error.message);
        setLoading(false);
      },
    );
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setPortal(null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !Capacitor.isNativePlatform()) return;
    let cancelled = false;
    let listener: { remove: () => Promise<void> } | null = null;
    const handleCallback = async (url: string) => {
      if (cancelled || processedAuthCallbacks.current.has(url)) return;
      processedAuthCallbacks.current.add(url);
      const callback = new URL(url);
      if (callback.searchParams.get("payment")) {
        // The HTTPS payment return is also an iOS Universal Link. Redirecting
        // to it from the native callback handler re-opens this app repeatedly.
        // Update the in-app URL and let the payment effect process it without
        // reloading the hosted page or losing the current session.
        await Browser.close().catch(() => undefined);
        window.history.replaceState({}, "", callback.toString());
        setNativePaymentReturnNonce((current) => current + 1);
        return;
      }
      const callbackError = callback.searchParams.get("error_description") ?? callback.searchParams.get("error");
      if (callbackError) {
        setError(`Sign-in could not be completed: ${callbackError}`);
        return;
      }
      const code = callback.searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) setError(`Sign-in could not be completed: ${exchangeError.message}`);
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
      if (sessionError) setError(`Sign-in could not be completed: ${sessionError.message}`);
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
    if (typeof window === "undefined") return;
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView === "payments") setActivePortalTab("payments");
    else if (requestedView === "wallet") setActivePortalTab("wallet");
    else if (requestedView === "trips") setActivePortalTab("trips");
  }, []);

  useEffect(() => {
    if (!tenantSlug || typeof window === "undefined") return;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("tenant", tenantSlug);
    window.history.replaceState({}, "", nextUrl);
    setPortal(null);
  }, [tenantSlug]);

  useEffect(() => {
    if (!session || !tenantSlug) return;
    void loadPortal().catch((value) => setError(riderErrorMessage(value)));
    const interval = window.setInterval(() => {
      void loadPortal().catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [loadPortal, session, tenantSlug]);

  useEffect(() => {
    if (activePortalTab !== "payments") return;
    void loadPayments().catch((value) => setError(riderErrorMessage(value)));
  }, [activePortalTab, loadPayments]);

  useEffect(() => {
    if (!portal?.profile || (activePortalTab !== "wallet" && activePortalTab !== "book")) return;
    void loadWallet().catch((value) => setError(riderErrorMessage(value)));
  }, [activePortalTab, loadWallet, portal?.profile]);

  useEffect(() => {
    if (!portal?.profile) return;
    void loadRecurring().catch((value) => setError(riderErrorMessage(value)));
    void currentPushSubscription().then((subscription) => setPushEnabled(Boolean(subscription))).catch(() => undefined);
  }, [loadRecurring, portal?.profile]);

  async function setRiderPush(enabled: boolean) {
    if (!supabase || !portal?.profile || !tenantSlug) return;
    setPushBusy(true); setError(""); setMessage("");
    try {
      if (!pushSupported()) throw new Error(pushUnavailableMessage());
      const existing = await currentPushSubscription();
      if (!enabled) {
        if (existing) {
          const disabled = await supabase.rpc("disable_my_push_subscription", { endpoint_value: existing.endpoint });
          if (disabled.error) throw disabled.error;
          await existing.unsubscribe();
        }
        setPushEnabled(false); setMessage("Device alerts disabled on this browser."); return;
      }
      if (!vapidPublicKey) throw new Error("Device alerts are not configured for this Rider app.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted.");
      const registration = await navigator.serviceWorker.register("/push-sw.js");
      const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true,
        applicationServerKey: vapidApplicationKey(vapidPublicKey) });
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys.auth) throw new Error("Browser push keys are unavailable.");
      const saved = await supabase.rpc("register_my_rider_push_subscription", {
        target_tenant_slug: tenantSlug, endpoint_value: subscription.endpoint,
        p256dh_key_value: json.keys.p256dh, auth_key_value: json.keys.auth,
        user_agent_value: navigator.userAgent,
      });
      if (saved.error) throw saved.error;
      setPushEnabled(true); setMessage("Device alerts enabled on this browser.");
    } catch (value) { setError(riderErrorMessage(value)); } finally { setPushBusy(false); }
  }

  async function loadPaymentReceipt(paymentAttemptId: string) {
    if (!session) return;
    setLoadingReceiptId(paymentAttemptId);
    setError("");
    try {
      const response = await fetch(`/api/payments/receipt?paymentAttemptId=${encodeURIComponent(paymentAttemptId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json() as { receiptUrl?: string; paymentMethod?: string; message?: string };
      if (!response.ok || !result.receiptUrl) throw new Error(result.message ?? "Receipt is unavailable.");
      if (result.paymentMethod) setPaymentMethods((current) => ({ ...current, [paymentAttemptId]: result.paymentMethod! }));
      setPaymentReceiptUrls((current) => ({ ...current, [paymentAttemptId]: result.receiptUrl! }));
    } catch (value) {
      setError(riderErrorMessage(value));
    } finally {
      setLoadingReceiptId(null);
    }
  }

  async function sendSignInLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !tenantSlug) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const redirect = Capacitor.isNativePlatform()
        ? `https://rider.eshapp.com/auth/callback?tenant=${encodeURIComponent(tenantSlug)}`
        : (() => {
            const url = new URL(window.location.href);
            url.hash = "";
            url.searchParams.set("tenant", tenantSlug);
            return url.toString();
          })();
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirect, shouldCreateUser: true },
      });
      if (signInError) throw signInError;
      setMessage("Check your email and open the secure sign-in link on this device.");
    } catch (value) {
      setError(riderErrorMessage(value));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const { error: profileError } = await supabase.rpc("upsert_my_rider_profile", {
        target_tenant_slug: tenantSlug,
        display_name_value: formValue(form, "displayName"),
        phone_value: formValue(form, "phone"),
        accessibility_notes_value: formValue(form, "accessibilityNotes"),
      });
      if (profileError) throw profileError;
      await loadPortal();
      setMessage("Your rider profile is ready.");
    } catch (value) {
      setError(riderErrorMessage(value));
    } finally {
      setBusy(false);
    }
  }

  async function submitRating(event: FormEvent<HTMLFormElement>, bookingId: string) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setMessage("");
    const score = (name: string) => Number(formValue(form, name));
    const result = await supabase.rpc("submit_my_rider_trip_rating", {
      target_booking_id: bookingId,
      overall_rating_value: score("overall"), safety_rating_value: score("safety"),
      communication_rating_value: score("communication"),
      vehicle_cleanliness_rating_value: score("cleanliness"), comment_value: formValue(form, "comment"),
    });
    if (result.error) setError(riderErrorMessage(result.error));
    else { setMessage("Your private trip rating was submitted."); await loadPortal(); }
    setBusy(false);
  }

  async function chooseServiceArea(nextServiceAreaId: string) {
    const requestId = serviceAreaContextRequest.current + 1;
    serviceAreaContextRequest.current = requestId;
    setServiceAreaId(nextServiceAreaId);
    setServiceAreaContext(null);
    setPickupSelection(null);
    setDestinationSelection(null);
    setPickupQuery("");
    setDestinationQuery("");
    setPickupSuggestions([]);
    setDestinationSuggestions([]);
    setPriceQuote(null);
    setPickupSearchSession(crypto.randomUUID());
    setDestinationSearchSession(crypto.randomUUID());
    if (!supabase || !nextServiceAreaId) return;
    const { data, error: contextError } = await supabase.rpc("my_rider_service_area_context", {
      target_tenant_slug: tenantSlug,
      target_service_area_id: nextServiceAreaId,
    });
    if (requestId !== serviceAreaContextRequest.current) return;
    if (contextError) {
      setError(contextError.message);
      return;
    }
    setServiceAreaContext(data as ServiceAreaContext);
  }

  async function chooseAddressSuggestion(
    kind: "pickup" | "destination",
    suggestion: AddressSuggestion,
  ) {
    if (!mapboxToken) return;
    setPriceQuote(null);
    const sessionToken = kind === "pickup" ? pickupSearchSession : destinationSearchSession;
    try {
      const selected = await retrieveAddressSuggestion({
        accessToken: mapboxToken,
        mapboxId: suggestion.mapboxId,
        sessionToken,
      });
      if (kind === "pickup") {
        setPickupQuery(selected.label);
        setPickupSelection(selected);
        setPickupSuggestions([]);
      } else {
        setDestinationQuery(selected.label);
        setDestinationSelection(selected);
        setDestinationSuggestions([]);
      }
    } catch (value) {
      setError(value instanceof Error ? value.message : "The selected address is unavailable.");
    }
  }

  async function useCurrentLocation() {
    if (!mapboxToken) return;
    setLocationBusy(true); setError(""); setMessage("");
    try {
      if (Capacitor.isNativePlatform()) {
        const permission = await Geolocation.requestPermissions();
        if (permission.location === "denied") throw new Error("Location permission is required to use your current pickup location.");
      }
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 });
      const resolved = await reverseGeocodeAddress(position.coords.latitude, position.coords.longitude, mapboxToken);
      setPickupQuery(resolved.formattedAddress);
      setPickupSelection({ mapboxId: `current-location:${resolved.latitude}:${resolved.longitude}`, label: resolved.formattedAddress });
      setPickupSuggestions([]);
      setPriceQuote(null);
      setMessage(`Pickup set to your current location (accuracy ±${Math.round(position.coords.accuracy)} m). Confirm or edit it before reviewing the fare.`);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Your current location is unavailable. Enter the pickup address manually.");
    } finally { setLocationBusy(false); }
  }

  async function createBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!serviceAreaId || !serviceAreaContext)
        throw new Error("Select a service area before choosing addresses.");
      if (!pickupSelection || pickupSelection.label !== pickupQuery)
        throw new Error("Choose the pickup address from the suggestions.");
      if (!destinationSelection || destinationSelection.label !== destinationQuery)
        throw new Error("Choose the destination from the suggestions.");
      if (!priceQuote || (!paymentConfirmed && Date.parse(priceQuote.expiresAt) <= Date.now())) {
        const response = await fetch("/api/pricing/quote", {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" },
          body: JSON.stringify({ tenantSlug, serviceAreaId, pickupAddress: pickupSelection.label, destinationAddress: destinationSelection.label, serviceType }),
        });
        const result = (await response.json().catch(() => null)) as (RiderPriceQuote & { message?: string }) | null;
        if (!response.ok || !result) throw new Error(result?.message ?? "Fare quote could not be created.");
        setPriceQuote(result);
        setPaymentConfirmed(false);
        setPickupQuery(result.pickupAddress); setDestinationQuery(result.destinationAddress);
        setPickupSelection({ ...pickupSelection, label: result.pickupAddress });
        setDestinationSelection({ ...destinationSelection, label: result.destinationAddress });
        setMessage("Review the locked fare, then confirm your trip.");
        return;
      }
      if (bookingTiming === "recurring" && !recurringOccurrenceId) {
        const weekdays = form.getAll("recurringWeekday").map(Number);
        const occurrenceTimes = generateRecurringPickupTimes({
          startDate: formValue(form, "recurringStartDate"), endDate: formValue(form, "recurringEndDate"),
          localTime: formValue(form, "recurringPickupTime"), weekdays,
          timeZone: scheduling?.timeZone ?? "UTC",
        });
        const series = await supabase.rpc("create_my_rider_booking_series", {
          target_quote_id: priceQuote.quoteId,
          start_date_value: formValue(form, "recurringStartDate"),
          end_date_value: formValue(form, "recurringEndDate"),
          local_pickup_time_value: formValue(form, "recurringPickupTime"),
          weekdays_value: weekdays,
          scheduled_pickup_at_values: occurrenceTimes,
          booking_notes_value: formValue(form, "bookingNotes"),
        });
        if (series.error) throw series.error;
        formElement.reset(); setPriceQuote(null); setPickupSelection(null); setDestinationSelection(null);
        setPickupQuery(""); setDestinationQuery(""); setServiceAreaId(""); setServiceAreaContext(null);
        await loadRecurring(); setActivePortalTab("trips");
        setMessage(`Recurring schedule created with ${occurrenceTimes.length} trips. Pay each occurrence before its pickup deadline.`);
        return;
      }
      if (!paymentConfirmed) {
        const response = await fetch("/api/payments/checkout", {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" },
          body: JSON.stringify({ quoteId: priceQuote.quoteId, tenantSlug, occurrenceId: recurringOccurrenceId, bookingNotes: formValue(form, "bookingNotes"), serviceType, scheduledPickupAt: bookingTiming === "scheduled" ? zonedDateTimeToIso(formValue(form, "scheduledPickupAt"), scheduling?.timeZone ?? "UTC") : undefined }),
        });
        const result = await response.json() as { url?: string; walletOnly?: boolean; booked?: boolean; bookingId?: string; walletAmountMinor?: number; message?: string };
        if (!response.ok) throw new Error(result.message ?? "Payment checkout could not be opened.");
        if (result.walletOnly) {
          if (result.booked) {
            formElement.reset(); setPriceQuote(null); setPaymentConfirmed(false); setServiceType("standard");
            await loadPortal(); setActivePortalTab("trips"); setMessage("Payment received and trip requested. Dispatch can now find an eligible driver."); return;
          }
          setPaymentConfirmed(true);
          await loadWallet();
          setMessage("Your wallet covers this fare. Review the trip, then request it once.");
          return;
        }
        if (!result.url) throw new Error(result.message ?? "Payment checkout could not be opened.");
        if (Capacitor.isNativePlatform()) await Browser.open({ url: result.url });
        else window.location.assign(result.url);
        return;
      }
      const result = recurringOccurrenceId
        ? await supabase.rpc("create_my_rider_recurring_booking", {
          target_quote_id: priceQuote.quoteId, target_occurrence_id: recurringOccurrenceId,
          ...(formValue(form, "bookingNotes") ? { booking_notes_value: formValue(form, "bookingNotes") } : {}),
        })
        : await supabase.rpc("create_my_rider_priced_booking_with_service_type", {
          target_quote_id: priceQuote.quoteId,
          booking_notes_value: formValue(form, "bookingNotes"),
          service_type_value: serviceType,
          scheduled_pickup_at_value: bookingTiming === "scheduled"
            ? zonedDateTimeToIso(formValue(form, "scheduledPickupAt"), scheduling?.timeZone ?? "UTC")
            : null,
        });
      const bookingError = result.error;
      if (bookingError) throw bookingError;
      formElement.reset();
      setServiceAreaId("");
      setServiceAreaContext(null);
      setPickupQuery("");
      setDestinationQuery("");
      setPickupSelection(null);
      setDestinationSelection(null);
      setPickupSuggestions([]);
      setDestinationSuggestions([]);
      setPriceQuote(null);
      setPaymentConfirmed(false);
      setRecurringOccurrenceId(null);
      setServiceType("standard");
      await loadPortal();
      await loadRecurring();
      setActivePortalTab("trips");
      setMessage(
        bookingTiming === "scheduled"
          ? "Trip scheduled. We will begin finding a driver closer to pickup."
          : "Trip requested. Dispatch can now find an eligible driver.",
      );
      const completedUrl = new URL(window.location.href);
      completedUrl.searchParams.delete("payment");
      completedUrl.searchParams.delete("quote");
      completedUrl.searchParams.delete("occurrence");
      window.history.replaceState({}, "", completedUrl);
    } catch (value) {
      setError(riderErrorMessage(value));
    } finally {
      setBusy(false);
    }
  }

  async function payRecurringOccurrence(occurrence: RiderSeriesOccurrence, series: RiderBookingSeries) {
    if (!session) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const quoteResponse = await fetch("/api/pricing/quote", { method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug, serviceAreaId: series.serviceAreaId,
          pickupAddress: series.pickupAddress, destinationAddress: series.destinationAddress }) });
      const quote = await quoteResponse.json() as RiderPriceQuote & { message?: string };
      if (!quoteResponse.ok || !quote.quoteId) throw new Error(quote.message ?? "Fare quote could not be created.");
      setRecurringOccurrenceId(occurrence.occurrenceId); setPriceQuote(quote); setServiceAreaId(series.serviceAreaId);
      const area = await supabase?.rpc("my_rider_service_area_context", {
        target_tenant_slug: tenantSlug, target_service_area_id: series.serviceAreaId,
      });
      if (area?.error || !area?.data) throw area?.error ?? new Error("Recurring service area is unavailable.");
      setServiceAreaContext(area.data as ServiceAreaContext);
      setPickupQuery(quote.pickupAddress); setDestinationQuery(quote.destinationAddress);
      setPickupSelection({ mapboxId: `series:${series.seriesId}:pickup`, label: quote.pickupAddress });
      setDestinationSelection({ mapboxId: `series:${series.seriesId}:destination`, label: quote.destinationAddress });
      setBookingTiming("scheduled"); setActivePortalTab("book");
      const checkoutResponse = await fetch("/api/payments/checkout", { method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.quoteId, tenantSlug, occurrenceId: occurrence.occurrenceId }) });
      const checkout = await checkoutResponse.json() as { url?: string; walletOnly?: boolean; message?: string };
      if (!checkoutResponse.ok) throw new Error(checkout.message ?? "Payment checkout could not be opened.");
      if (checkout.walletOnly) {
        setPaymentConfirmed(true); await loadWallet();
        setMessage(`Wallet credit covers the ${formatDate(occurrence.scheduledPickupAt)} trip. Review and request it once.`);
      } else if (checkout.url) {
        if (Capacitor.isNativePlatform()) await Browser.open({ url: checkout.url });
        else window.location.assign(checkout.url);
      }
      else throw new Error("Payment checkout could not be opened.");
    } catch (value) { setError(riderErrorMessage(value)); setBusy(false); }
  }

  async function cancelRecurringOccurrence(occurrenceId: string) {
    if (!supabase || !window.confirm("Cancel this unpaid recurring occurrence?")) return;
    setBusy(true); setError("");
    const result = await supabase.rpc("cancel_my_rider_series_occurrence", { target_occurrence_id: occurrenceId });
    if (result.error) setError(riderErrorMessage(result.error));
    else { await loadRecurring(); setMessage("Recurring occurrence cancelled."); }
    setBusy(false);
  }

  async function resumeRecurringOccurrence(occurrence: RiderSeriesOccurrence, series: RiderBookingSeries) {
    if (!session || !occurrence.quoteId || !supabase) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/payments/checkout?quote=${encodeURIComponent(occurrence.quoteId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json() as { paymentStatus?: string; quote?: PaidRiderPriceQuote; message?: string };
      if (!response.ok || result.paymentStatus !== "paid" || !result.quote)
        throw new Error(result.message ?? "Payment is not confirmed yet. Finish Stripe Checkout or wait for it to expire.");
      const area = await supabase.rpc("my_rider_service_area_context", {
        target_tenant_slug: tenantSlug, target_service_area_id: series.serviceAreaId,
      });
      if (area.error || !area.data) throw area.error ?? new Error("Recurring service area is unavailable.");
      setRecurringOccurrenceId(occurrence.occurrenceId); setPriceQuote({ ...result.quote, fractionDigits: 2 });
      setServiceAreaId(series.serviceAreaId); setServiceAreaContext(area.data as ServiceAreaContext);
      setPickupQuery(result.quote.pickupAddress); setDestinationQuery(result.quote.destinationAddress);
      setPickupSelection({ mapboxId: `series:${series.seriesId}:pickup`, label: result.quote.pickupAddress });
      setDestinationSelection({ mapboxId: `series:${series.seriesId}:destination`, label: result.quote.destinationAddress });
      setBookingTiming("scheduled"); setPaymentConfirmed(true); setActivePortalTab("book");
      setMessage("Payment confirmed. Review this recurring occurrence, then request it once.");
    } catch (value) { setError(riderErrorMessage(value)); } finally { setBusy(false); }
  }

  async function cancelRecurringSeries(seriesId: string) {
    if (!supabase || !window.confirm("Cancel all remaining unpaid occurrences in this recurring schedule? Paid trips must still be cancelled individually.")) return;
    setBusy(true); setError("");
    const result = await supabase.rpc("cancel_my_rider_booking_series", { target_series_id: seriesId });
    if (result.error) setError(riderErrorMessage(result.error));
    else { await loadRecurring(); setMessage(`${result.data ?? 0} remaining unpaid occurrence(s) cancelled. Existing paid trips are unchanged.`); }
    setBusy(false);
  }

  async function setRecurringAutopay(series: RiderBookingSeries, enabled: boolean) {
    if (!supabase) return;
    const warning = enabled
      ? "Enable automatic payment for future occurrences using your saved Stripe payment method? Each fare will use current pricing and wallet credit first."
      : "Turn off automatic payment for this recurring schedule?";
    if (!window.confirm(warning)) return;
    setBusy(true); setError(""); setMessage("");
    const result = await supabase.rpc("set_my_rider_booking_series_autopay", {
      target_series_id: series.seriesId, enabled_value: enabled,
    });
    if (result.error) setError(riderErrorMessage(result.error));
    else {
      await loadRecurring();
      setMessage(enabled ? "Automatic payment enabled. Future trips will be priced and charged before pickup." : "Automatic payment disabled. Future trips require manual payment.");
    }
    setBusy(false);
  }

  async function cancelBooking(bookingId: string) {
    if (!supabase || !window.confirm("Cancel this trip request?")) return;
    setBusy(true);
    setError("");
    try {
      const booking = portal?.bookings.find((item) => item.bookingId === bookingId);
      if (booking?.finalFareMinor != null) {
        if (!session) throw new Error("Authentication is required.");
        const response = await fetch("/api/payments/refund", { method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId }) });
        const result = await response.json() as { refunded?: boolean; walletRestored?: boolean; message?: string };
        if (!response.ok || !result.refunded) throw new Error(result.message ?? "Trip refund failed.");
        setMessage(result.walletRestored ? "Trip cancelled. Card payment refunded and wallet credit restored." : "Trip cancelled and card payment refunded.");
      } else {
        const { error: cancelError } = await supabase.rpc("cancel_my_rider_booking", { target_booking_id: bookingId });
        if (cancelError) throw cancelError;
      }
      await loadPortal();
      if (booking?.finalFareMinor == null) setMessage("Trip cancelled.");
    } catch (value) {
      setError(riderErrorMessage(value));
    } finally {
      setBusy(false);
    }
  }

  async function bookAgain(booking: RiderBooking) {
    if (!supabase || !tenantSlug) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const area = await supabase.rpc("my_rider_service_area_context", {
        target_tenant_slug: tenantSlug, target_service_area_id: booking.serviceAreaId,
      });
      if (area.error || !area.data) throw area.error ?? new Error("Service area is unavailable.");
      setServiceAreaId(booking.serviceAreaId);
      setServiceAreaContext(area.data as ServiceAreaContext);
      setPickupQuery(booking.pickupAddress); setDestinationQuery(booking.destinationAddress);
      setPickupSelection({ mapboxId: `again:${booking.bookingId}:pickup`, label: booking.pickupAddress });
      setDestinationSelection({ mapboxId: `again:${booking.bookingId}:destination`, label: booking.destinationAddress });
      setPriceQuote(null); setPaymentConfirmed(false); setActivePortalTab("book");
      setMessage("Review this new trip and confirm the fare before requesting it.");
    } catch (value) { setError(riderErrorMessage(value)); }
    finally { setBusy(false); }
  }

  async function setTripUpdates(enabled: boolean) {
    if (!supabase) return;
    setBusy(true);
    setError("");
    try {
      const { error: preferenceError } = await supabase.rpc(
        "set_my_rider_notification_preferences",
        {
          target_tenant_slug: tenantSlug,
          trip_updates_enabled_value: enabled,
        },
      );
      if (preferenceError) throw preferenceError;
      setNotificationPreferences((current) => current
        ? { ...current, tripUpdatesEnabled: enabled }
        : { tripUpdatesEnabled: enabled, paymentUpdatesEnabled: true });
      setMessage(enabled ? "Trip update emails enabled." : "Trip update emails disabled.");
    } catch (value) {
      setError(riderErrorMessage(value));
    } finally {
      setBusy(false);
    }
  }

  async function setPaymentUpdates(enabled: boolean) {
    if (!supabase) return;
    setBusy(true); setError("");
    try {
      const { error: preferenceError } = await supabase.rpc("set_my_rider_payment_notification_preferences", {
        target_tenant_slug: tenantSlug, payment_updates_enabled_value: enabled,
      });
      if (preferenceError) throw preferenceError;
      setNotificationPreferences((current) => current ? { ...current, paymentUpdatesEnabled: enabled } : current);
      setMessage(enabled ? "Payment update emails enabled." : "Payment update emails disabled.");
    } catch (value) { setError(riderErrorMessage(value)); } finally { setBusy(false); }
  }

  async function saveRiderSmsConsent() {
    if (!supabase) return;
    setSmsBusy(true); setSmsFeedback(null);
    try {
      const normalizedPhone = normalizeE164(smsPhone);
      const result = await supabase.rpc("save_my_rider_sms_consent", {
        target_tenant_slug: tenantSlug,
        phone_e164_value: normalizedPhone,
        sms_consent_value: smsConsentChecked,
      });
      if (result.error) throw result.error;
      const nextSettings = result.data as unknown as RiderSmsSettings;
      setSmsSettings(nextSettings);
      setSmsPhone(nextSettings.phoneE164 ?? normalizedPhone);
      setSmsConsentChecked(nextSettings.consented);
      smsConsentEditing.current = false;
      setSmsFeedback({
        kind: "success",
        message: nextSettings.status === "disabled"
          ? "Your SMS consent was withdrawn. Text delivery is off."
          : nextSettings.consented
            ? "Your mobile number and SMS consent were saved. No text message was sent."
            : "Your mobile number was saved without SMS consent.",
      });
    } catch (value) { setSmsFeedback({ kind: "error", message: riderErrorMessage(value) }); } finally { setSmsBusy(false); }
  }

  const activeBookings = portal?.bookings.filter((booking) => !["completed", "cancelled"].includes(booking.status)) ?? [];
  const blockingBookings = activeBookings.filter((booking) => ["requested", "offered", "accepted", "arrived", "in_progress"].includes(booking.status));
  const currentBookings = activeBookings.filter((booking) => booking.status !== "scheduled");
  const scheduledBookings = activeBookings.filter((booking) => booking.status === "scheduled");
  const historicalBookings = portal?.bookings.filter((booking) => ["completed", "cancelled"].includes(booking.status)) ?? [];
  const visibleRecurringSeries = recurring.series.filter((series) => series.status === "active");

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="shell">
        <section className="card">
          <h1>Rider portal unavailable</h1>
          <p>Public Supabase configuration is missing.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="hero">
        <div className="brand-lockup">
          <Image className="app-logo" src={appIcon} alt="ESH Rider" priority />
          <div>
            <p className="eyebrow">ESH Rider</p>
            <h1>Where are you going?</h1>
            <p className="summary">
              Request a trip and follow your assigned Driver when they share live location.
            </p>
          </div>
        </div>
        {session ? (
          <button className="button secondary" disabled={busy} onClick={() => void signOut()}>
            {busy ? "Signing out…" : "Sign out"}
          </button>
        ) : null}
      </header>

      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="notice success" role="status">
          {message}
        </p>
      ) : null}

      <section className="card tenant-card">
        <label htmlFor="tenant">Transportation provider</label>
        <select
          id="tenant"
          value={tenantSlug}
          disabled={loading || tenants.length === 0}
          onChange={(event) => setTenantSlug(event.target.value)}
        >
          {tenants.length === 0 ? <option value="">No provider available</option> : null}
          {tenants.map((tenant) => (
            <option key={tenant.tenant_slug} value={tenant.tenant_slug}>
              {tenant.display_name}
            </option>
          ))}
        </select>
      </section>

      {!session ? (
        <section className="card auth-card">
          <div>
            <p className="kicker">Secure access</p>
            <h2>Verify your email to request a trip</h2>
            <p>We will email a one-time sign-in link. No password is required.</p>
          </div>
          <form onSubmit={(event) => void sendSignInLink(event)}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <button className="button primary" disabled={busy || !tenantSlug}>
              {busy ? "Sending…" : "Email me a secure link"}
            </button>
          </form>
          <p className="privacy">
            Your email identifies your bookings. Anonymous bookings are not accepted.
          </p>
        </section>
      ) : !portal ? (
        <section className="card">
          <p>{tenantSlug ? "Loading your rider portal…" : "Select a provider."}</p>
        </section>
      ) : !portal.profile ? (
        <section className="card">
          <p className="kicker">One-time setup</p>
          <h2>Create your rider profile</h2>
          <p>Your verified email is {session.user.email}.</p>
          <form className="form-grid" onSubmit={(event) => void saveProfile(event)}>
            <label>
              Full name
              <input
                name="displayName"
                required
                autoComplete="name"
                placeholder="Example: Jordan Lee"
              />
            </label>
            <label>
              Mobile phone
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="Example: 469-555-0123"
              />
              <span className="field-hint">Optional. Adding a phone number does not opt you into SMS.</span>
            </label>
            <label className="wide">
              Accessibility or pickup notes
              <textarea
                name="accessibilityNotes"
                placeholder="Example: Wheelchair accessible vehicle requested"
                rows={3}
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Create rider profile"}
            </button>
          </form>
        </section>
      ) : (
        <>
        <nav className="rider-tabs" aria-label="Rider portal sections">
          <button className={activePortalTab === "account" ? "button primary" : "button secondary"} onClick={() => setActivePortalTab("account")} type="button">Account</button>
          <button className={activePortalTab === "book" ? "button primary" : "button secondary"} onClick={() => setActivePortalTab("book")} type="button">Book trip</button>
          <button className={activePortalTab === "trips" ? "button primary" : "button secondary"} onClick={() => setActivePortalTab("trips")} type="button">{currentBookings.length > 0 ? "Current trip" : "My trips"}</button>
          <button className={activePortalTab === "payments" ? "button primary" : "button secondary"} onClick={() => setActivePortalTab("payments")} type="button">Payments</button>
          <button className={activePortalTab === "wallet" ? "button primary" : "button secondary"} onClick={() => setActivePortalTab("wallet")} type="button">Wallet</button>
        </nav>
        <div className={activePortalTab === "book" ? "portal-grid booking-only" : "portal-grid trips-only"}>
          {activePortalTab === "account" ? (
          <section className="history sms-account-section">
            <div className="section-heading">
              <div><p className="kicker">ESH Rider</p><h2>Account and communication settings</h2></div>
            </div>
            <article className="card sms-consent-card">
              <div>
                <p className="kicker">Optional SMS</p>
                <h3>Mobile and SMS preferences</h3>
                <p>Keep your mobile contact current and choose whether FAIR FARE COMPANY LLC may send ESH service messages.</p>
              </div>
              <label>
                Mobile phone number
                <input
                  aria-describedby="sms-phone-help"
                  autoComplete="tel"
                  inputMode="tel"
                  onChange={(event) => { smsConsentEditing.current = true; setSmsPhone(event.target.value); }}
                  placeholder="Example: +1 215 555 0123"
                  type="tel"
                  value={smsPhone}
                />
                <span className="field-hint" id="sms-phone-help">Use international format. Saving this number alone does not grant SMS consent.</span>
              </label>
              <label className="sms-consent-choice">
                <input
                  checked={smsConsentChecked}
                  disabled={smsBusy}
                  onChange={(event) => { smsConsentEditing.current = true; setSmsConsentChecked(event.target.checked); }}
                  type="checkbox"
                />
                <span>
                  I agree to receive SMS messages from <strong>FAIR FARE COMPANY LLC</strong> regarding ESH ride updates, account and service notifications, and customer care. Msg and data rates may apply. Msg frequency will vary. Reply HELP for help or STOP to opt out.{" "}
                  <a href={FAIR_FARE_PRIVACY_POLICY_URL} rel="noopener noreferrer" target="_blank">Privacy Policy</a>.
                </span>
              </label>
              <p className="field-hint">Optional. SMS consent is not required to use ESH Rider and is separate from email sign-in and other agreements.</p>
              <div className="sms-consent-actions">
                <button className="button primary" disabled={smsBusy || smsPhone.trim().length === 0} onClick={() => void saveRiderSmsConsent()} type="button">
                  {smsBusy ? "Saving…" : "Save mobile preferences"}
                </button>
                <span className={`status status-${smsSettings.status}`}>{smsConsentStatusMessage(smsSettings)}</span>
              </div>
              {smsFeedback ? <p className={smsFeedback.kind === "error" ? "error" : "notice"} role="status">{smsFeedback.message}</p> : null}
            </article>
          </section>
          ) : null}

          {activePortalTab === "book" ? (
          <section className="card booking-card">
            <p className="kicker">{portal.tenant.displayName}</p>
            <h2>Request a trip</h2>
            {blockingBookings.length > 0 ? (
              <div className="card preference-card" role="status">
                <div>
                  <strong>Booking temporarily unavailable</strong>
                  <p>Finish or cancel your current trip before requesting another ride.</p>
                </div>
                <button className="button secondary compact" type="button" onClick={() => setActivePortalTab("trips")}>View current trip</button>
              </div>
            ) : null}
            <form className="form-grid" onSubmit={(event) => void createBooking(event)}>
              <fieldset className="booking-fields" disabled={blockingBookings.length > 0}>
              <label className="wide">
                When do you need the ride?
                <select
                  value={bookingTiming}
                  disabled={Boolean(recurringOccurrenceId)}
                  onChange={(event) => setBookingTiming(event.target.value as "now" | "scheduled" | "recurring")}
                >
                  <option value="now">Ride now</option>
                  <option value="scheduled">Schedule for later</option>
                  <option value="recurring">Repeat on selected weekdays</option>
                </select>
              </label>
              {recurringOccurrenceId ? <p className="wide field-hint">This fare belongs to a recurring occurrence with its pickup time already fixed.</p> : null}
              {bookingTiming === "scheduled" && !recurringOccurrenceId ? (
                <label className="wide">
                  Pickup date and time
                  <input
                    name="scheduledPickupAt"
                    type="datetime-local"
                    required
                    min={formatDateTimeInputInZone(
                      new Date(
                        Date.now() +
                          ((scheduling?.settings.minimumNoticeMinutes ?? 60) + 1) * 60_000,
                      ),
                      scheduling?.timeZone ?? "UTC",
                    )}
                  />
                  <span className="field-hint">
                    Provider time zone: {scheduling?.timeZone ?? "Loading…"}. Minimum notice:{" "}
                    {scheduling?.settings.minimumNoticeMinutes ?? 60} minutes.
                  </span>
                </label>
              ) : null}
              {bookingTiming === "recurring" && !recurringOccurrenceId ? (
                <div className="wide card">
                  <p className="kicker">Repeat schedule</p>
                  <div className="form-grid">
                    <label>Start date<input name="recurringStartDate" type="date" required /></label>
                    <label>End date<input name="recurringEndDate" type="date" required /></label>
                    <label>Pickup time<input name="recurringPickupTime" type="time" required /></label>
                    <fieldset className="wide"><legend>Weekdays</legend><div className="rider-tabs">
                      {[[1,"Mon"],[2,"Tue"],[3,"Wed"],[4,"Thu"],[5,"Fri"],[6,"Sat"],[7,"Sun"]].map(([day, label]) => <label key={day}><input name="recurringWeekday" type="checkbox" value={day} /> {label}</label>)}
                    </div></fieldset>
                  </div>
                  <p className="field-hint">Each occurrence is priced and paid separately before it becomes a scheduled trip. Maximum 50 trips within the provider&apos;s advance-booking window.</p>
                </div>
              ) : null}
              <label className="wide">
                Service area
                <select
                  name="serviceAreaId"
                  required
                  value={serviceAreaId}
                  onChange={(event) => void chooseServiceArea(event.target.value)}
                >
                  <option value="" disabled>
                    Select the area that covers your trip
                  </option>
                  {portal.serviceAreas.map((area) => (
                    <option key={area.serviceAreaId} value={area.serviceAreaId}>
                      {area.name}
                      {area.description ? ` — ${area.description}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                Vehicle type
                <select value={serviceType} onChange={(event) => { setServiceType(event.target.value as "standard" | "larger" | "premium" | "accessible"); setPriceQuote(null); }}>
                  {riderServiceTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                </select>
                {(() => {
                  const selected = riderServiceTypes.find((type) => type.id === serviceType) ?? riderServiceTypes[0];
                  return <div className="selected-service-type">
                    <img alt={`${selected.label} ride type`} src={selected.image} />
                    <div><strong>{selected.label}</strong><span>{selected.capacity} · {selected.positioning}</span></div>
                  </div>;
                })()}
                <span className="field-hint">We’ll match you with an eligible vehicle. If none are available, choose another type.</span>
              </label>
              <div className="wide address-field">
                <label htmlFor="rider-pickup-address">Pickup address</label>
                <button className="button secondary compact" disabled={locationBusy || !mapboxToken || !serviceAreaContext} onClick={() => void useCurrentLocation()} type="button">
                  {locationBusy ? "Locating…" : "Use my current location"}
                </button>
                <input
                  id="rider-pickup-address"
                  name="pickupAddress"
                  required
                  autoComplete="off"
                  disabled={!serviceAreaContext}
                  value={pickupQuery}
                  onChange={(event) => {
                    setPickupQuery(event.target.value);
                    setPriceQuote(null);
                    if (pickupSelection) setPickupSearchSession(crypto.randomUUID());
                    setPickupSelection(null);
                    setPickupSearchSession((current) => current || crypto.randomUUID());
                  }}
                  placeholder="Example: 1200 Main St, Dallas, TX 75202"
                />
                {pickupSelection ? <span className="address-selected">Verified address selected</span> : null}
                {pickupSuggestions.length > 0 ? (
                  <div className="address-suggestions" role="listbox" aria-label="Pickup address suggestions">
                    {pickupSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.mapboxId}
                        type="button"
                        role="option"
                        onClick={() => void chooseAddressSuggestion("pickup", suggestion)}
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="wide address-field">
                <label htmlFor="rider-destination-address">Destination address</label>
                <input
                  id="rider-destination-address"
                  name="destinationAddress"
                  required
                  autoComplete="off"
                  disabled={!serviceAreaContext}
                  value={destinationQuery}
                  onChange={(event) => {
                    setDestinationQuery(event.target.value);
                    setPriceQuote(null);
                    if (destinationSelection) setDestinationSearchSession(crypto.randomUUID());
                    setDestinationSelection(null);
                    setDestinationSearchSession((current) => current || crypto.randomUUID());
                  }}
                  placeholder="Example: DFW Airport, Terminal A"
                />
                {destinationSelection ? <span className="address-selected">Verified address selected</span> : null}
                {destinationSuggestions.length > 0 ? (
                  <div className="address-suggestions" role="listbox" aria-label="Destination address suggestions">
                    {destinationSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.mapboxId}
                        type="button"
                        role="option"
                        onClick={() => void chooseAddressSuggestion("destination", suggestion)}
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <label className="wide">
                Trip notes
                <textarea
                  name="bookingNotes"
                  rows={3}
                  defaultValue={portal.profile.accessibilityNotes ?? ""}
                  placeholder="Example: Please call when you arrive at the north entrance"
                />
              </label>
              {priceQuote ? (
                <div className="wide card">
                  <p className="kicker">{priceQuote.farePolicy === "guaranteed_upfront" ? "Guaranteed upfront fare" : priceQuote.farePolicy === "metered_actual" ? "Metered fare estimate" : "Protected flexible estimate"}</p>
                  <h2>{new Intl.NumberFormat(undefined, { style: "currency", currency: priceQuote.currencyCode, minimumFractionDigits: priceQuote.fractionDigits }).format(priceQuote.fareAmountMinor / 10 ** priceQuote.fractionDigits)}</h2>
                  <p className="area">Road route {(priceQuote.routeDistanceMeters / 1609.344).toFixed(1)} mi · {Math.max(1, Math.round(priceQuote.routeDurationSeconds / 60))} min · valid until {formatDate(priceQuote.expiresAt)}</p>
                  {priceQuote.tollAmountMinor ? <p className="area">Includes tolls: {new Intl.NumberFormat(undefined, { style: "currency", currency: priceQuote.currencyCode, minimumFractionDigits: priceQuote.fractionDigits }).format(priceQuote.tollAmountMinor / 10 ** priceQuote.fractionDigits)}{priceQuote.tolls?.length ? ` · ${priceQuote.tolls.map((toll) => toll.facility).join(", ")}` : ""}</p> : null}
                  <p className="area"><strong>{priceQuote.farePolicy === "guaranteed_upfront"
                    ? "This is your final fare. Ordinary traffic and Driver rerouting will not increase it."
                    : priceQuote.farePolicy === "metered_actual"
                      ? "Your final fare is based on trusted actual trip time, mileage, and tolls. It may be higher or lower than this estimate."
                      : `Your final fare uses trusted actual time and mileage. It may be lower, but will not exceed ${new Intl.NumberFormat(undefined, { style: "currency", currency: priceQuote.currencyCode, minimumFractionDigits: priceQuote.fractionDigits }).format((priceQuote.maximumFareMinor ?? priceQuote.fareAmountMinor) / 10 ** priceQuote.fractionDigits)} without a separately accepted trip change.`}</strong></p>
                  <p className="area">{bookingTiming === "recurring" && !recurringOccurrenceId ? "This verifies the recurring route. No payment is collected until you choose an individual occurrence." : paymentConfirmed ? "Payment or wallet credit is confirmed. This trip has not been requested yet. Select the button below once to create it and notify dispatch." : wallet && wallet.availableMinor > 0 ? `${new Intl.NumberFormat(undefined, { style: "currency", currency: wallet.currencyCode }).format(wallet.availableMinor / 10 ** wallet.fractionDigits)} available wallet credit will be applied automatically; Stripe securely collects any remainder.` : "Secure payment is collected by Stripe before the trip request is created."}</p>
                </div>
              ) : null}
              <button
                className="button primary"
                disabled={busy || portal.serviceAreas.length === 0}
              >
                {busy ? "Working…" : priceQuote ? bookingTiming === "recurring" && !recurringOccurrenceId ? "Create recurring schedule" : paymentConfirmed ? "Request this trip" : "Apply wallet and continue" : bookingTiming === "recurring" ? "Review recurring route" : "Review fare"}
              </button>
              </fieldset>
            </form>
          </section>
          ) : null}

          {activePortalTab === "wallet" ? (
          <section className="history">
            <div className="section-heading"><div><p className="kicker">Wallet</p><h2>ESH trip credit</h2></div><button className="button secondary compact" onClick={() => void loadWallet()} disabled={busy}>Refresh</button></div>
            <div className="card preference-card"><div><strong>{wallet ? new Intl.NumberFormat(undefined, { style: "currency", currency: wallet.currencyCode }).format(wallet.balanceMinor / 10 ** wallet.fractionDigits) : "Loading…"}</strong><p>Available credit is applied automatically to your next fare. Any remainder is paid securely through Stripe.</p></div></div>
            <p className="area">Trip credit has no cash value and cannot be withdrawn. Every credit and use remains in this history.</p>
            {!wallet || wallet.entries.length === 0 ? <div className="card empty"><p>No wallet activity yet.</p></div> : wallet.entries.map((entry) => <article className="card trip-card" key={entry.entryId}><div className="trip-top"><div><span className={`status ${entry.direction === "credit" ? "status-paid" : "status-refunded"}`}>{entry.direction}</span><h3>{entry.direction === "credit" ? "+" : "−"}{new Intl.NumberFormat(undefined, { style: "currency", currency: wallet.currencyCode }).format(entry.amountMinor / 10 ** wallet.fractionDigits)}</h3></div><time>{formatDate(entry.createdAt)}</time></div><p>{entry.description}</p>{entry.bookingId ? <p className="area">Trip {entry.bookingId.slice(0, 8)}</p> : null}</article>)}
          </section>
          ) : null}

          {activePortalTab === "trips" && currentBookings.length > 0 ? (
          <section className="history">
            <div className="section-heading"><div><p className="kicker">Current trip</p><h2>Your active ride</h2></div><button className="button secondary compact" onClick={() => void loadPortal()} disabled={busy}>Refresh</button></div>
            {currentBookings.map((booking) => <article className="card trip-card" key={`current-page-${booking.bookingId}`}>
              <div className="trip-top"><div><span className={`status status-${booking.status}`}>{bookingStatusLabel(booking.status)}</span><h3>{booking.pickupAddress}</h3><p className="destination">to {booking.destinationAddress}</p></div><time>{formatDate(booking.createdAt)}</time></div>
              <p className="area"><strong>{booking.farePolicy === "guaranteed_upfront" ? "Guaranteed fare" : booking.farePolicy === "metered_actual" ? "Fare estimate" : booking.farePolicy === "protected_flexible" ? "Protected fare estimate" : "Fare"}:</strong> {booking.fareCurrencyCode && (booking.finalFareMinor ?? booking.estimatedFareMinor) != null ? new Intl.NumberFormat(undefined, { style: "currency", currency: booking.fareCurrencyCode }).format((booking.finalFareMinor ?? booking.estimatedFareMinor ?? 0) / 100) : "Pending"}{booking.farePolicy === "protected_flexible" && booking.maximumFareMinor != null && booking.fareCurrencyCode ? ` · maximum ${new Intl.NumberFormat(undefined, { style: "currency", currency: booking.fareCurrencyCode }).format(booking.maximumFareMinor / 100)}` : ""}</p>
              <p className="area">{booking.serviceAreaName}{booking.driver ? ` · Driver: ${booking.driver.displayName}` : " · Finding an eligible driver"}</p>
              {mapboxToken && booking.pickupLatitude != null && booking.pickupLongitude != null && booking.destinationLatitude != null && booking.destinationLongitude != null ? <LiveTripMap accessToken={mapboxToken} pickup={{ latitude: booking.pickupLatitude, longitude: booking.pickupLongitude, label: `Pickup: ${booking.pickupAddress}` }} destination={{ latitude: booking.destinationLatitude, longitude: booking.destinationLongitude, label: `Destination: ${booking.destinationAddress}` }} driver={tripLocations.filter((location) => location.bookingId === booking.bookingId).map((location) => ({ latitude: location.latitude, longitude: location.longitude, label: "Driver live location" }))[0] ?? null} /> : null}
              {canCancelBooking(booking.status) ? <button className="text-button danger" disabled={busy} onClick={() => void cancelBooking(booking.bookingId)}>Cancel trip</button> : null}
            </article>)}
          </section>
          ) : null}

          {activePortalTab === "trips" && currentBookings.length === 0 ? (
          <section className="history">
            <div className="section-heading">
              <div>
                <p className="kicker">My trips</p>
                <h2>Booking status</h2>
              </div>
              <button
                className="button secondary compact"
                onClick={() => void loadPortal()}
                disabled={busy}
              >
                Refresh
              </button>
            </div>
            <div className="card preference-card">
              <div>
                <strong>Trip update emails</strong>
                <p>Receive booking, driver, arrival, trip, completion, and cancellation updates.</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={notificationPreferences?.tripUpdatesEnabled ?? true}
                  disabled={busy || !notificationPreferences}
                  onChange={(event) => void setTripUpdates(event.target.checked)}
                />
                <span>{notificationPreferences?.tripUpdatesEnabled === false ? "Off" : "On"}</span>
              </label>
            </div>
            <div className="card preference-card">
              <div><strong>Device alerts</strong><p>Receive privacy-safe browser alerts for urgent trip and payment updates. Permission applies only to this browser.</p></div>
              {pushSupported() ? <label className="switch"><input type="checkbox" checked={pushEnabled} disabled={pushBusy} onChange={(event) => void setRiderPush(event.target.checked)} /><span>{pushEnabled ? "On" : "Off"}</span></label> : <strong>Unavailable on this device</strong>}
            </div>
            {!pushSupported() ? <p className="notice" role="status">{pushUnavailableMessage()}</p> : null}
            {currentBookings.length > 0 ? <section className="panel-stack">
              <div className="section-heading"><div><p className="kicker">Current trip</p><h3>Track your active ride</h3></div></div>
              {currentBookings.map((booking) => <article className="card trip-card" key={`current-${booking.bookingId}`}>
                <div className="trip-top"><div><span className={`status status-${booking.status}`}>{bookingStatusLabel(booking.status)}</span><h3>{booking.pickupAddress}</h3><p className="destination">to {booking.destinationAddress}</p></div><time>{formatDate(booking.createdAt)}</time></div>
                <p className="area">{booking.serviceAreaName}</p>
                {booking.driver ? <p className="area">Driver: {booking.driver.displayName} · #{booking.driver.driverNumber}</p> : null}
                {mapboxToken && booking.pickupLatitude != null && booking.pickupLongitude != null && booking.destinationLatitude != null && booking.destinationLongitude != null ? <LiveTripMap accessToken={mapboxToken} pickup={{ latitude: booking.pickupLatitude, longitude: booking.pickupLongitude, label: `Pickup: ${booking.pickupAddress}` }} destination={{ latitude: booking.destinationLatitude, longitude: booking.destinationLongitude, label: `Destination: ${booking.destinationAddress}` }} driver={tripLocations.filter((location) => location.bookingId === booking.bookingId).map((location) => ({ latitude: location.latitude, longitude: location.longitude, label: "Driver live location" }))[0] ?? null} /> : null}
                {canCancelBooking(booking.status) ? <button className="text-button danger" disabled={busy} onClick={() => void cancelBooking(booking.bookingId)}>Cancel trip</button> : null}
              </article>)}
            </section> : null}
            {visibleRecurringSeries.length > 0 ? <div className="panel-stack">
              <div className="section-heading"><div><p className="kicker">Recurring schedules</p><h3>Upcoming repeat trips</h3></div></div>
              {visibleRecurringSeries.map((series) => {
                const occurrences = recurring.occurrences.filter((item) => item.seriesId === series.seriesId);
                return <article className="card trip-card" key={series.seriesId}>
                  <div className="trip-top"><div><span className={`status status-${series.status}`}>{series.status}</span><h3>{series.pickupAddress}</h3><p className="destination">to {series.destinationAddress}</p></div><time>{series.startDate} through {series.endDate}</time></div>
                  <p className="area">Repeats {series.weekdays.map((day) => ["","Mon","Tue","Wed","Thu","Fri","Sat","Sun"][day]).join(", ")} at {series.localPickupTime.slice(0, 5)} ({series.timeZone})</p>
                  <div className="preference-card"><div><strong>Automatic payment</strong><p>{series.autopayEnabled ? `On${recurring.savedPaymentMethod?.last4 ? ` · ${recurring.savedPaymentMethod.brand ?? "card"} ending ${recurring.savedPaymentMethod.last4}` : ""}. Current fare is charged before each trip.` : recurring.savedPaymentMethod ? "Off · Enable to price and pay upcoming trips automatically." : "Complete one card payment to securely save a Stripe payment method, then enable autopay."}</p></div>{series.status === "active" && (recurring.savedPaymentMethod || series.autopayEnabled) ? <button className="button secondary compact" disabled={busy} onClick={() => void setRecurringAutopay(series, !series.autopayEnabled)} type="button">{series.autopayEnabled ? "Turn off autopay" : "Enable autopay"}</button> : null}</div>
                  {series.status === "active" ? <button className="text-button danger" disabled={busy} onClick={() => void cancelRecurringSeries(series.seriesId)} type="button">Cancel remaining schedule</button> : null}
                  <div className="panel-stack">{occurrences.map((occurrence) => {
                    const awaiting = occurrence.status === "awaiting_payment" && series.status === "active";
                    const processing = occurrence.autopayStatus === "processing";
                    const needsManualPayment = occurrence.autopayStatus === "failed";
                    const paymentLabel = needsManualPayment ? "Price and pay" : series.autopayEnabled ? "Pay early" : "Price and pay";
                    const paymentClass = needsManualPayment || !series.autopayEnabled ? "button primary compact" : "text-button";
                    return <div className="preference-card" key={occurrence.occurrenceId}>
                      <div><strong>{formatDate(occurrence.scheduledPickupAt, series.timeZone)}</strong><p>{occurrence.status === "awaiting_payment" ? processing ? "Automatic payment processing" : occurrence.autopayStatus === "retryable" ? "Automatic payment will retry; you may pay early" : needsManualPayment ? "Automatic payment failed—pay manually to keep this trip" : series.autopayEnabled ? "Autopay scheduled before pickup" : "Awaiting fare review and payment" : occurrence.status === "payment_pending" ? "Payment started; finish booking after confirmation" : occurrence.status === "booked" ? `Scheduled trip ${occurrence.bookingId?.slice(0, 8)}${occurrence.autopayStatus === "succeeded" ? " · paid automatically" : ""}` : "Cancelled"}</p>{occurrence.autopayFailureMessage ? <p className="field-hint">{occurrence.autopayFailureMessage}</p> : null}</div>
                      {awaiting && !processing ? <div><button className={paymentClass} disabled={busy} onClick={() => void payRecurringOccurrence(occurrence, series)} type="button">{paymentLabel}</button><button className="text-button danger" disabled={busy} onClick={() => void cancelRecurringOccurrence(occurrence.occurrenceId)} type="button">Skip</button></div> : occurrence.status === "payment_pending" && series.status === "active" ? <button className="button secondary compact" disabled={busy} onClick={() => void resumeRecurringOccurrence(occurrence, series)} type="button">Check payment</button> : null}
                    </div>;
                  })}</div>
                </article>;
              })}
            </div> : null}
            {scheduledBookings.length === 0 ? (
              <div className="card empty">
                <p>No scheduled trips.</p>
              </div>
            ) : (
              scheduledBookings.map((booking) => (
                <article className="card trip-card" key={booking.bookingId}>
                  <div className="trip-top">
                    <div>
                      <span className={`status status-${booking.status}`}>
                        {bookingStatusLabel(booking.status)}
                      </span>
                      {booking.scheduledPickupAt ? (
                        <p className="scheduled-time">
                          Scheduled: {formatDate(booking.scheduledPickupAt, scheduling?.timeZone)}{" "}
                          {scheduling?.timeZone ? `(${scheduling.timeZone})` : ""}
                        </p>
                      ) : null}
                      <h3>{booking.pickupAddress}</h3>
                      <p className="destination">to {booking.destinationAddress}</p>
                    </div>
                    <time>{formatDate(booking.createdAt)}</time>
                  </div>
                  <p className="area">{booking.serviceAreaName}</p>
                  {booking.fareCurrencyCode && booking.estimatedFareMinor != null ? <p className="area"><strong>Fare: {new Intl.NumberFormat(undefined, { style: "currency", currency: booking.fareCurrencyCode }).format((booking.finalFareMinor ?? booking.estimatedFareMinor) / 100)}</strong></p> : null}
                  {booking.refundAmountMinor != null && booking.refundCurrencyCode ? (
                    <p className="area">
                      <strong>
                        {booking.refundStatus === "succeeded" ? "Refunded" : booking.refundStatus === "pending" ? "Refund processing" : "Refund issue"}: {new Intl.NumberFormat(undefined, { style: "currency", currency: booking.refundCurrencyCode }).format(booking.refundAmountMinor / 100)}
                      </strong>
                      {booking.refundStatus === "succeeded" ? " · Returned to the original payment method" : null}
                    </p>
                  ) : null}
                  {booking.driver && booking.vehicle ? (
                    <div className="assignment">
                      <strong>{booking.driver.displayName}</strong>
                      <span>Driver #{booking.driver.driverNumber}</span>
                      <span>
                        {booking.vehicle.color} {booking.vehicle.modelYear} {booking.vehicle.make}{" "}
                        {booking.vehicle.model} · {booking.vehicle.licensePlate}
                      </span>
                    </div>
                  ) : null}
                  {tripLocations
                    .filter((location) => location.bookingId === booking.bookingId)
                    .map((location) => (
                      <div className="assignment" key={location.bookingId}>
                        <strong>Driver live location</strong>
                        <span>
                          {location.fresh ? "Live" : "Last known"} · updated{" "}
                          {formatLocationAge(location.recordedAt)}
                          {" · "}accuracy ±{Math.round(location.accuracyMeters)} m
                        </span>
                        <a
                          className="text-button"
                          href={`https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=16/${location.latitude}/${location.longitude}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          View Driver on map
                        </a>
                      </div>
                    ))}
                  {mapboxToken && booking.pickupLatitude != null && booking.pickupLongitude != null && booking.destinationLatitude != null && booking.destinationLongitude != null ? (
                    <LiveTripMap
                      accessToken={mapboxToken}
                      pickup={{ latitude: booking.pickupLatitude, longitude: booking.pickupLongitude, label: `Pickup: ${booking.pickupAddress}` }}
                      destination={{ latitude: booking.destinationLatitude, longitude: booking.destinationLongitude, label: `Destination: ${booking.destinationAddress}` }}
                      driver={tripLocations.filter((location) => location.bookingId === booking.bookingId).map((location) => ({ latitude: location.latitude, longitude: location.longitude, label: "Driver live location" }))[0] ?? null}
                    />
                  ) : null}
                  {canCancelBooking(booking.status) ? (
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => void cancelBooking(booking.bookingId)}
                    >
                      Cancel trip
                    </button>
                  ) : null}
                </article>
              ))
            )}
            {historicalBookings.length > 0 ? (
              <section className="trip-history">
                <div className="section-heading">
                  <div>
                    <p className="kicker">Trip history</p>
                    <h3>{historicalBookings.length} completed or cancelled</h3>
                  </div>
                  <button className="button secondary compact" type="button" onClick={() => setShowTripHistory((current) => !current)}>
                    {showTripHistory ? "Hide history" : "Show history"}
                  </button>
                </div>
                {showTripHistory ? historicalBookings.map((booking) => (
                  <article className="card trip-card" key={booking.bookingId}>
                    <div className="trip-top">
                      <div>
                        <span className={`status status-${booking.status}`}>{bookingStatusLabel(booking.status)}</span>
                        <h3>{booking.pickupAddress}</h3>
                        <p className="destination">to {booking.destinationAddress}</p>
                      </div>
                      <time>{formatDate(booking.createdAt)}</time>
                    </div>
                    <p className="area">{booking.serviceAreaName}</p>
                    {booking.fareCurrencyCode && (booking.finalFareMinor ?? booking.estimatedFareMinor) != null ? <p className="area"><strong>Fare: {new Intl.NumberFormat(undefined, { style: "currency", currency: booking.fareCurrencyCode }).format((booking.finalFareMinor ?? booking.estimatedFareMinor ?? 0) / 100)}</strong></p> : null}
                    {booking.reconciliationStatus && booking.fareCurrencyCode ? <p className="area">Fare contract review: {booking.reconciliationStatus.replaceAll("_", " ")}{booking.contractFareMinor != null ? ` · contract fare ${new Intl.NumberFormat(undefined, { style: "currency", currency: booking.fareCurrencyCode }).format(booking.contractFareMinor / 100)}` : ""}{booking.rawMeterFareMinor != null && booking.rawMeterFareMinor !== booking.contractFareMinor ? ` · raw meter ${new Intl.NumberFormat(undefined, { style: "currency", currency: booking.fareCurrencyCode }).format(booking.rawMeterFareMinor / 100)}` : ""}</p> : null}
                    <button className="button secondary compact" type="button" disabled={busy} onClick={() => void bookAgain(booking)}>Book again</button>
                  </article>
                )) : null}
              </section>
            ) : null}
          </section>
          ) : null}
          {activePortalTab === "payments" ? (
          <section className="history">
            <div className="section-heading">
              <div><p className="kicker">Payments</p><h2>Payment and refund history</h2></div>
              <button className="button secondary compact" onClick={() => void loadPayments()} disabled={busy}>Refresh</button>
            </div>
            <p className="area">Receipts open securely on Stripe. ESH does not store your card or bank details.</p>
            <div className="card preference-card">
              <div><strong>Payment update emails</strong><p>Receive payment confirmations and refund updates.</p></div>
              <label className="switch"><input type="checkbox" checked={notificationPreferences?.paymentUpdatesEnabled ?? true} disabled={busy || !notificationPreferences} onChange={(event) => void setPaymentUpdates(event.target.checked)} /><span>{notificationPreferences?.paymentUpdatesEnabled === false ? "Off" : "On"}</span></label>
            </div>
            {payments.length === 0 ? <div className="card empty"><p>No payment activity yet.</p></div> : payments.map((payment) => {
              const booking = portal.bookings.find((item) => item.bookingId === payment.bookingId);
              const amount = new Intl.NumberFormat(undefined, { style: "currency", currency: payment.currencyCode }).format(payment.amountMinor / 100);
              const refundAmount = payment.refundAmountMinor == null ? null : new Intl.NumberFormat(undefined, { style: "currency", currency: payment.currencyCode }).format(payment.refundAmountMinor / 100);
              return <article className="card trip-card" key={payment.paymentAttemptId}>
                <div className="trip-top"><div><span className={`status status-${payment.status}`}>{payment.status}</span><h3>{amount}</h3></div><time>{formatDate(payment.paidAt ?? payment.createdAt)}</time></div>
                {booking ? <><p>{booking.pickupAddress}</p><p className="destination">to {booking.destinationAddress}</p></> : <p className="area">Payment completed before trip request</p>}
                {refundAmount ? <p className="area"><strong>{payment.refundStatus === "succeeded" ? "Refunded" : "Refund"}: {refundAmount}</strong>{payment.refundedAt ? ` · ${formatDate(payment.refundedAt)}` : ""}</p> : null}
                {payment.disputes.map((dispute) => <p className="area" key={dispute.disputeId}><strong>Payment dispute: {new Intl.NumberFormat(undefined, { style: "currency", currency: payment.currencyCode }).format(dispute.amountMinor / 100)} · {dispute.status.replaceAll("_", " ")}</strong><br />Reason: {dispute.reason.replaceAll("_", " ")}{dispute.fundsReinstatedAt ? ` · ${new Intl.NumberFormat(undefined, { style: "currency", currency: payment.currencyCode }).format(dispute.fundsReinstatedMinor / 100)} reinstated ${formatDate(dispute.fundsReinstatedAt)}` : dispute.fundsWithdrawnAt ? ` · ${new Intl.NumberFormat(undefined, { style: "currency", currency: payment.currencyCode }).format(dispute.fundsWithdrawnMinor / 100)} withdrawn ${formatDate(dispute.fundsWithdrawnAt)} (${new Intl.NumberFormat(undefined, { style: "currency", currency: payment.currencyCode }).format(dispute.feeMinor / 100)} dispute fee)` : ""}{dispute.evidenceDueAt && !["won", "lost", "warning_closed", "prevented"].includes(dispute.status) ? ` · Response due ${formatDate(dispute.evidenceDueAt)}` : ""}</p>)}
                {paymentMethods[payment.paymentAttemptId] ? <p className="area">Paid with {paymentMethods[payment.paymentAttemptId]}</p> : null}
                {paymentReceiptUrls[payment.paymentAttemptId] ? (
                  <a className="text-button" href={paymentReceiptUrls[payment.paymentAttemptId]} target="_blank" rel="noopener noreferrer">Open Stripe receipt</a>
                ) : payment.status === "paid" || payment.status === "refunded" ? (
                  <button className="text-button" disabled={loadingReceiptId !== null} onClick={() => void loadPaymentReceipt(payment.paymentAttemptId)}>
                    {loadingReceiptId === payment.paymentAttemptId ? "Loading receipt…" : "Load Stripe receipt"}
                  </button>
                ) : null}
              </article>;
            })}
          </section>
          ) : null}
          {activePortalTab === "trips" && currentBookings.length === 0 ? (
          <section className="history reputation-history">
            <div className="section-heading"><div><p className="kicker">Reputation</p><h2>Post-trip ratings</h2></div></div>
            <p className="area">Ratings stay private until both sides submit, or seven days pass.</p>
            {reputationTrips.length === 0 ? <div className="card empty"><p>Completed trips eligible for rating will appear here.</p></div> : reputationTrips.map((trip) => {
              return <article className="card trip-card" key={`rating-${trip.bookingId}`}>
                <h3>{trip.pickupAddress}</h3><p className="destination">to {trip.destinationAddress}</p>
                <p className="area">Driver: {trip.subjectName} · completed {formatDate(trip.completedAt)}</p>
                {trip.submittedRating ? <p><strong>Your rating:</strong> {trip.submittedRating.overall}/5</p> : null}
                {trip.receivedRating ? <p><strong>Driver’s rating:</strong> {trip.receivedRating.overall}/5{trip.receivedRating.comment ? ` · ${trip.receivedRating.comment}` : ""}</p> : null}
                {trip.canSubmit ? (
                  <form className="form-grid" onSubmit={(event) => void submitRating(event, trip.bookingId)}>
                    {[["overall", "Overall"], ["safety", "Safety"], ["communication", "Communication"], ["cleanliness", "Vehicle cleanliness"]].map(([name, label]) => (
                      <label key={name}>{label}<select name={name} defaultValue="5" required>{[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>
                    ))}
                    <label className="wide">Optional comment<textarea name="comment" maxLength={1000} rows={3} /></label>
                    <button className="button primary" disabled={busy}>Submit private rating</button>
                  </form>
                ) : !trip.submittedRating ? <p className="area">The 30-day rating window has closed.</p> : null}
              </article>;
            })}
          </section>
          ) : null}
        </div>
        </>
      )}
    </main>
  );
}
