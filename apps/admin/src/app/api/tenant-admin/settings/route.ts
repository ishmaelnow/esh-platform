import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { geocodePermanentAddress } from "@esh-platform/maps";
import { getAdminServerConfig } from "@/lib/config";
import { deliverQueuedNotifications } from "@/lib/notifications/delivery";
import {
  createRequestSupabaseClient,
  getBearerToken,
  validateTenantConfigurationPayload,
  validateTenantId,
} from "@/lib/tenant-admin/server";
import { parseServiceAreaInput } from "@/lib/tenant-admin/service-areas";
import { parseDispatchBookingInput, parseMatchingSettingsInput } from "@/lib/tenant-admin/dispatch";

async function authorizeServiceAreas(request: Request, tenantId: string) {
  const accessToken = getBearerToken(request);
  if (!accessToken) throw new Error("Authentication is required.");
  const supabase = createRequestSupabaseClient({ accessToken });
  const [{ data: personId, error: personError }, { data: canManage, error: permissionError }] =
    await Promise.all([
      supabase.rpc("current_person_id"),
      supabase.rpc("can_manage_service_areas", { target_tenant_id: tenantId }),
    ]);
  if (personError || !personId) throw new Error("An active person profile is required.");
  if (permissionError || !canManage)
    throw new Error("Service area management permission is required.");
  return { supabase, personId };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const tenantId = validateTenantId(body.tenantId);
    if (body.kind === "dispatch_create") {
      const accessToken = getBearerToken(request);
      if (!accessToken) throw new Error("Authentication is required.");
      const serviceAreaId = validateTenantId(body.serviceAreaId);
      const input = parseDispatchBookingInput(body);
      const supabase = createRequestSupabaseClient({ accessToken });
      const { data: serviceArea, error: serviceAreaError } = await supabase
        .from("service_areas")
        .select("center_latitude,center_longitude")
        .eq("tenant_id", tenantId)
        .eq("service_area_id", serviceAreaId)
        .eq("status", "active")
        .single();
      if (serviceAreaError || !serviceArea)
        throw serviceAreaError ?? new Error("Active service area is required.");
      const { data, error } = await supabase.rpc("create_dispatch_booking", {
        target_tenant_id: tenantId,
        target_service_area_id: serviceAreaId,
        customer_name_value: input.customerName,
        customer_phone_value: input.customerPhone,
        pickup_address_value: input.pickupAddress,
        destination_address_value: input.destinationAddress,
        booking_notes_value: input.notes,
      });
      if (error || !data) throw error ?? new Error("Unable to create booking.");
      let message = "Booking created.";
      const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
      if (mapboxToken) {
        try {
          const [pickup, destination] = await Promise.all([
            geocodePermanentAddress(input.pickupAddress, mapboxToken, {
              latitude: serviceArea.center_latitude,
              longitude: serviceArea.center_longitude,
              requestOrigin: process.env.INVITATION_BASE_URL,
            }),
            geocodePermanentAddress(input.destinationAddress, mapboxToken, {
              latitude: serviceArea.center_latitude,
              longitude: serviceArea.center_longitude,
              requestOrigin: process.env.INVITATION_BASE_URL,
            }),
          ]);
          const coordinateResult = await supabase.rpc("set_dispatch_booking_coordinates", {
            target_booking_id: data,
            pickup_latitude_value: pickup.latitude,
            pickup_longitude_value: pickup.longitude,
            destination_latitude_value: destination.latitude,
            destination_longitude_value: destination.longitude,
            geocoding_provider_value: "mapbox-v6",
          });
          if (coordinateResult.error) throw coordinateResult.error;
        } catch {
          message = "Booking created, but its map is temporarily unavailable.";
        }
      } else {
        message = "Booking created. Add the Mapbox token to enable its live map.";
      }
      return NextResponse.json({ ok: true, bookingId: data, message });
    }
    const input = parseServiceAreaInput(body);
    const { supabase, personId } = await authorizeServiceAreas(request, tenantId);
    const { data, error } = await supabase
      .from("service_areas")
      .insert({
        tenant_id: tenantId,
        name: input.name,
        description: input.description,
        center_latitude: input.centerLatitude,
        center_longitude: input.centerLongitude,
        radius_km: input.radiusKm,
        coverage_mode: input.coverageMode,
        created_by_person_id: personId,
        updated_by_person_id: personId,
      })
      .select("service_area_id")
      .single();
    if (error || !data) throw error ?? new Error("Unable to create service area.");
    return NextResponse.json({ ok: true, serviceAreaId: data.service_area_id });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to create service area." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const accessToken = getBearerToken(request);

    if (!accessToken) {
      return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
    }

    const body = (await request.json()) as unknown;

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
    }

    const tenantId = validateTenantId((body as { tenantId?: unknown }).tenantId);
    const record = body as Record<string, unknown>;
    if (record.kind === "matching_settings") {
      const input = parseMatchingSettingsInput(record);
      const supabase = createRequestSupabaseClient({ accessToken });
      const { error } = await supabase.rpc("set_tenant_matching_settings", {
        target_tenant_id: tenantId,
        automatic_matching_enabled_value: input.automaticMatchingEnabled,
        offer_duration_seconds_value: input.offerDurationSeconds,
        maximum_attempts_value: input.maximumAttempts,
      });
      if (error) throw error;
      let matchedCount = 0;
      if (input.automaticMatchingEnabled) {
        const matchingResult = await supabase.rpc("start_tenant_automatic_matching", {
          target_tenant_id: tenantId,
        });
        if (matchingResult.error) throw matchingResult.error;
        matchedCount = matchingResult.data ?? 0;
      }
      return NextResponse.json({
        ok: true,
        message: input.automaticMatchingEnabled
          ? `Automatic matching enabled. ${matchedCount} waiting booking${matchedCount === 1 ? "" : "s"} matched.`
          : "Automatic matching disabled. Manual dispatch remains available.",
      });
    }
    if (record.kind === "scheduling_settings") {
      const number = (key: string) => {
        const value = Number(record[key]);
        if (!Number.isInteger(value)) throw new Error(`${key} must be a whole number.`);
        return value;
      };
      const supabase = createRequestSupabaseClient({ accessToken });
      const { error } = await supabase.rpc("set_tenant_scheduling_settings", {
        target_tenant_id: tenantId,
        minimum_notice_minutes_value: number("minimumNoticeMinutes"),
        maximum_advance_days_value: number("maximumAdvanceDays"),
        dispatch_lead_minutes_value: number("dispatchLeadMinutes"),
        reminder_lead_hours_value: number("reminderLeadHours"),
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (typeof record.kind === "string" && record.kind.startsWith("dispatch_")) {
      const supabase = createRequestSupabaseClient({ accessToken });
      const bookingId = validateTenantId(record.bookingId);
      if (record.kind === "dispatch_offer") {
        const driverProfileId = validateTenantId(record.driverProfileId);
        const { data: offerId, error } = await supabase.rpc("offer_dispatch_booking", {
          target_booking_id: bookingId,
          target_driver_profile_id: driverProfileId,
        });
        if (error) throw error;
        if (offerId) {
          const service = createServiceSupabaseClient();
          const { data: notification } = await service
            .from("notification_outbox")
            .select("notification_id")
            .eq("dedupe_key", `dispatch_offer:${offerId}`)
            .maybeSingle();
          if (notification) {
            await deliverQueuedNotifications(service, getAdminServerConfig(), {
              tenantId,
              notificationId: notification.notification_id,
              limit: 1,
            });
          }
        }
      } else if (record.kind === "dispatch_cancel") {
        const { error } = await supabase.rpc("cancel_dispatch_booking", {
          target_booking_id: bookingId,
        });
        if (error) throw error;
      } else {
        throw new Error("Unsupported dispatch action.");
      }
      return NextResponse.json({ ok: true });
    }
    if (typeof record.kind === "string" && record.kind.startsWith("service_area_")) {
      const serviceAreaId = validateTenantId(record.serviceAreaId);
      const { supabase, personId } = await authorizeServiceAreas(request, tenantId);
      if (record.kind === "service_area_update") {
        const input = parseServiceAreaInput(record);
        const { error } = await supabase
          .from("service_areas")
          .update({
            name: input.name,
            description: input.description,
            center_latitude: input.centerLatitude,
            center_longitude: input.centerLongitude,
            radius_km: input.radiusKm,
            coverage_mode: input.coverageMode,
            updated_by_person_id: personId,
          })
          .eq("tenant_id", tenantId)
          .eq("service_area_id", serviceAreaId);
        if (error) throw error;
      } else if (record.kind === "service_area_status") {
        if (record.status !== "active" && record.status !== "inactive")
          throw new Error("Unsupported service area status.");
        const { error } = await supabase
          .from("service_areas")
          .update({ status: record.status, updated_by_person_id: personId })
          .eq("tenant_id", tenantId)
          .eq("service_area_id", serviceAreaId);
        if (error) throw error;
      } else if (record.kind === "service_area_coverage") {
        if (record.coverageMode !== "all_drivers" && record.coverageMode !== "selected_drivers")
          throw new Error("Unsupported service area coverage mode.");
        const { error } = await supabase
          .from("service_areas")
          .update({ coverage_mode: record.coverageMode, updated_by_person_id: personId })
          .eq("tenant_id", tenantId)
          .eq("service_area_id", serviceAreaId);
        if (error) throw error;
      } else if (record.kind === "service_area_assign") {
        const driverProfileId = validateTenantId(record.driverProfileId);
        const { error } = await supabase.from("driver_service_area_assignments").insert({
          tenant_id: tenantId,
          driver_profile_id: driverProfileId,
          service_area_id: serviceAreaId,
          assignment_notes: typeof record.notes === "string" ? record.notes.trim() || null : null,
          created_by_person_id: personId,
        });
        if (error) throw error;
      } else if (record.kind === "service_area_unassign") {
        const assignmentId = validateTenantId(record.assignmentId);
        const { error } = await supabase
          .from("driver_service_area_assignments")
          .update({ ended_at: new Date().toISOString(), ended_by_person_id: personId })
          .eq("tenant_id", tenantId)
          .eq("service_area_id", serviceAreaId)
          .eq("assignment_id", assignmentId)
          .is("ended_at", null);
        if (error) throw error;
      } else {
        throw new Error("Unsupported service area action.");
      }
      return NextResponse.json({ ok: true });
    }
    const configuration = validateTenantConfigurationPayload(
      (body as { configuration?: unknown }).configuration,
    );
    const supabase = createRequestSupabaseClient({ accessToken });
    const { error } = await supabase
      .from("tenant_configurations")
      .update(configuration)
      .eq("tenant_id", tenantId);

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update tenant settings." },
      { status: 400 },
    );
  }
}
