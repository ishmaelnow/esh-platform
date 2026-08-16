import { resolveTollsForRoute, routeTripMetrics } from "@esh-platform/maps";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { createStripeClient } from "@esh-platform/stripe";
import { requestNotificationDelivery } from "../../../../lib/request-notification-delivery";
import { loadTollCatalog } from "../../../../lib/toll-pricing";

type DueOccurrence = {
  occurrenceId: string; tenantId: string; riderProfileId: string; serviceAreaId: string;
  scheduledPickupAt: string; attemptCount: number; pickupAddress: string; destinationAddress: string;
  pickupLatitude: number; pickupLongitude: number; destinationLatitude: number;
  destinationLongitude: number; paymentMethodId: string; customerId: string;
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ message: "Unauthorized." }, { status: 401 });
  const service = createServiceSupabaseClient();
  const claimed = await service.rpc("claim_due_recurring_autopay_internal", { target_limit: 10 });
  if (claimed.error) return Response.json({ message: claimed.error.message }, { status: 500 });
  const occurrences = (claimed.data ?? []) as unknown as DueOccurrence[];
  const stripe = createStripeClient();
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!mapboxToken) return Response.json({ message: "Map routing is unavailable." }, { status: 500 });
  let tollCatalog;
  try {
    tollCatalog = await loadTollCatalog(service);
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Toll pricing catalog is unavailable." }, { status: 500 });
  }
  const results: Array<{ occurrenceId: string; status: string }> = [];
  for (const occurrence of occurrences) {
    try {
      const route = await routeTripMetrics({ accessToken: mapboxToken,
        pickup: { latitude: occurrence.pickupLatitude, longitude: occurrence.pickupLongitude },
        destination: { latitude: occurrence.destinationLatitude, longitude: occurrence.destinationLongitude },
        includeTolls: true });
      const tolls = resolveTollsForRoute({
        pickup: { longitude: occurrence.pickupLongitude },
        destination: { longitude: occurrence.destinationLongitude },
        tollCollections: route.tollCollections ?? [],
        catalog: tollCatalog,
      });
      if ((route.tollCollections ?? []).length > 0 && tolls.length === 0)
        throw new Error("This route uses a toll facility that is not yet configured for pricing.");
      const tollAmountMinor = tolls.reduce((total, toll) => total + toll.amountMinor, 0);
      const quote = await service.rpc("create_rider_price_quote_internal", {
        target_rider_profile_id: occurrence.riderProfileId,
        target_service_area_id: occurrence.serviceAreaId,
        pickup_address_value: occurrence.pickupAddress, destination_address_value: occurrence.destinationAddress,
        pickup_latitude_value: occurrence.pickupLatitude, pickup_longitude_value: occurrence.pickupLongitude,
        destination_latitude_value: occurrence.destinationLatitude,
        destination_longitude_value: occurrence.destinationLongitude,
        route_distance_meters_value: route.distanceMeters, route_duration_seconds_value: route.durationSeconds,
        toll_amount_minor_value: tollAmountMinor, toll_snapshot_value: tolls,
      });
      if (quote.error || !quote.data) throw quote.error ?? new Error("Fare quote failed.");
      const priced = quote.data as unknown as { quoteId: string; fareAmountMinor: number; currencyCode: string };
      const wallet = await service.rpc("prepare_rider_wallet_checkout_internal", { target_quote_id: priced.quoteId });
      if (wallet.error || !wallet.data) throw wallet.error ?? new Error("Wallet preparation failed.");
      const split = wallet.data as unknown as { cardAmountMinor: number };
      if (split.cardAmountMinor > 0) {
        const registered = await service.rpc("register_rider_offsession_attempt_internal", {
          target_quote_id: priced.quoteId,
          provider_payment_intent_id_value: `pending:${occurrence.occurrenceId}`,
        });
        if (registered.error) throw registered.error;
        const intent = await stripe.paymentIntents.create({ amount: split.cardAmountMinor,
          currency: priced.currencyCode.toLowerCase(), customer: occurrence.customerId,
          payment_method: occurrence.paymentMethodId, confirm: true, off_session: true,
          description: `${occurrence.pickupAddress} to ${occurrence.destinationAddress}`,
          metadata: { quote_id: priced.quoteId, occurrence_id: occurrence.occurrenceId, tenant_id: occurrence.tenantId },
        }, { idempotencyKey: `recurring_occurrence_${occurrence.occurrenceId}` });
        const recorded = await service.rpc("record_rider_payment_internal", {
          checkout_session_id_value: `off_session:${priced.quoteId}`, payment_intent_id_value: intent.id,
          payment_status_value: intent.status === "succeeded" ? "paid" : "failed",
          amount_minor_value: split.cardAmountMinor, currency_code_value: priced.currencyCode,
          failure_message_value: intent.status === "succeeded" ? null : "Stripe did not complete the automatic payment.",
        });
        if (recorded.error || intent.status !== "succeeded") throw recorded.error ?? new Error("Automatic payment was not completed.");
      }
      const finalized = await service.rpc("finalize_recurring_autopay_internal", {
        target_occurrence_id: occurrence.occurrenceId, target_quote_id: priced.quoteId,
      });
      if (finalized.error) throw finalized.error;
      results.push({ occurrenceId: occurrence.occurrenceId, status: "booked" });
      await requestNotificationDelivery(occurrence.tenantId);
    } catch (error) {
      const record = error as { type?: string; code?: string };
      const retryable = record.type === "StripeAPIError" || record.type === "StripeConnectionError"
        || record.code === "lock_timeout";
      await service.rpc("fail_recurring_autopay_internal", {
        target_occurrence_id: occurrence.occurrenceId,
        failure_message_value: error instanceof Error ? error.message : "Automatic payment failed.",
        retryable_value: retryable,
      });
      results.push({ occurrenceId: occurrence.occurrenceId, status: retryable ? "retryable" : "failed" });
      await requestNotificationDelivery(occurrence.tenantId);
    }
  }
  return Response.json({ ok: true, claimed: occurrences.length, results });
}
