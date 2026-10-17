import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createAuthenticatedSupabaseClient,
  createServiceSupabaseClient,
  type Json,
} from "@esh-platform/supabase";
import {
  resolveStudentStop,
  studentRoadRoute,
  validCoordinates,
  type StudentStop,
} from "@esh-platform/maps";
import { readGeographicInput, readSavedStops, uuid } from "../../../lib/geography";
const reply = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error("Missing body");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > 40000) {
        await reader.cancel();
        throw Error("Large body");
      }
      parts.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid body");
  return value as Record<string, unknown>;
}
export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED !== "true")
    return reply({ message: "Request pilot unavailable." }, 503);
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") && request.headers.get("origin") !== origin)
    return reply({ message: "Request unavailable." }, 403);
  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer ")) return reply({ message: "Sign in again." }, 401);
  let body;
  try {
    body = await readBody(request);
  } catch {
    return reply({ message: "Check request details." }, 400);
  }
  try {
    const client = createAuthenticatedSupabaseClient(bearer.slice(7));
    const auth = await client.auth.getUser();
    if (auth.error || !auth.data.user?.email_confirmed_at)
      return reply({ message: "Verified sign-in required." }, 401);
    if (body.action === "saved") {
      if (!uuid(body.requestId) || !uuid(body.tenantId))
        return reply({ message: "Choose a saved request." }, 400);
      const result = await client
        .from("student_transportation_requests")
        .select("geography,geography_status")
        .eq("tenant_id", body.tenantId)
        .eq("request_id", body.requestId)
        .maybeSingle();
      if (result.error || result.data?.geography_status !== "geocoded")
        return reply({ message: "Verified request unavailable." }, 403);
      const stops = readSavedStops(result.data.geography);
      const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
      if (!token) return reply({ message: "Mapping is temporarily unavailable." }, 503);
      const route = await studentRoadRoute(stops, token, AbortSignal.timeout(12000), origin);
      return reply({ stops, route });
    }
    if (!uuid(body.tenantId) || !uuid(body.customerId))
      return reply({ message: "Choose your customer account." }, 400);
    const access = await client.rpc("has_student_customer_access", {
      target_tenant_id: body.tenantId,
      target_customer_id: body.customerId,
    });
    if (access.error || access.data !== true)
      return reply({ message: "Customer access unavailable. Refresh your account." }, 403);
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) return reply({ message: "Mapping is temporarily unavailable." }, 503);
    if (body.action === "search") {
      if (typeof body.query !== "string" || body.query.trim().length < 3 || body.query.length > 400)
        return reply({ message: "Enter a complete street address." }, 400);
      const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
      Object.entries({
        q: body.query.trim(),
        access_token: token,
        country: "us",
        types: "address",
        autocomplete: "true",
        limit: "5",
      }).forEach(([k, v]) => url.searchParams.set(k, v));
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
        headers: { Referer: origin },
      });
      if (!response.ok) throw Error("Provider unavailable");
      const data = (await response.json()) as {
        features?: Array<{
          properties?: { full_address?: string };
          geometry?: { coordinates?: number[] };
        }>;
      };
      return reply({
        suggestions: (data.features ?? []).flatMap((f) => {
          const [longitude, latitude] = f.geometry?.coordinates ?? [];
          return f.properties?.full_address && validCoordinates(latitude, longitude)
            ? [{ address: f.properties.full_address, latitude, longitude, loadingInstructions: "" }]
            : [];
        }),
      });
    }
    if (body.action !== "preview") return reply({ message: "Unknown request." }, 400);
    let input;
    try {
      input = readGeographicInput(body);
    } catch {
      return reply({ message: "Choose address suggestions and check student requirements." }, 400);
    }
    // Fail before provider calls when the independent server credential is not configured.
    const service = createServiceSupabaseClient();
    // Opportunistic expiry cleanup is actor-scoped; unused accounts still need the documented retention job.
    const cleanup = await service
      .from("student_request_geography_receipts")
      .delete()
      .eq("auth_user_id", auth.data.user.id)
      .lt("expires_at", new Date().toISOString());
    if (cleanup.error) throw Error("Preview storage unavailable");
    const stops: StudentStop[] = [];
    const signal = AbortSignal.timeout(45000);
    for (const choice of [...input.students.map((s) => s.pickup), input.destination]) {
      stops.push(
        await resolveStudentStop(
          choice.address,
          choice,
          choice.loadingInstructions,
          token,
          signal,
          origin,
        ),
      );
    }
    const route = await studentRoadRoute(stops, token, signal, origin);
    const payload = {
      scheduledAt: input.scheduledAt,
      destination: stops.at(-1)!.address,
      students: input.students.map((s, i) => ({
        name: s.name,
        pickupAddress: stops[i]!.address,
        accommodations: s.accommodations,
      })),
      geography: {
        safetyStatus: "unreviewed",
        stops,
        provider: "mapbox",
        resolvedAt: new Date().toISOString(),
      },
    };
    const saved = await service
      .from("student_request_geography_receipts")
      .insert({
        tenant_id: input.tenantId,
        customer_id: input.customerId,
        auth_user_id: auth.data.user.id,
        input_hash: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
        payload: payload as unknown as Json,
      })
      .select("receipt_id")
      .single();
    if (saved.error || !saved.data) throw Error("Preview storage unavailable");
    return reply({ receiptId: saved.data.receipt_id, stops, route });
  } catch {
    return reply(
      {
        message:
          "We could not verify these stops or obtain a road route. Check precise street addresses and try again.",
      },
      503,
    );
  }
}
