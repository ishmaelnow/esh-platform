import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), stripe: vi.fn(), retrieve: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@esh-platform/supabase", () => ({ createAuthenticatedSupabaseClient: mocks.authenticated }));
vi.mock("@esh-platform/stripe", () => ({ createStripeClient: mocks.stripe }));
import { GET } from "./route";
const bookingId = "90000000-0000-4000-8000-000000000001";
const tenantId = "tenant", riderId = "rider";
let rows: Record<string, unknown>, failed: string | null;
let filters: Record<string, Record<string, unknown>>;
function request(auth = true, id = bookingId) { return new Request(`https://rider.test/api/trips/receipt?bookingId=${id}&tenantSlug=provider`, {
  headers: auth ? { Authorization: "Bearer TEST-token" } : {},
}); }
beforeEach(() => {
  vi.clearAllMocks(); failed = null; filters = {};
  rows = { dispatch_bookings: { booking_id: bookingId, tenant_id: tenantId, rider_profile_id: riderId, status: "completed", pickup_address: "TEST pickup", destination_address: "TEST destination",
    created_at: "2026-10-10T12:00:00Z", completed_at: "2026-10-10T13:00:00Z", price_quote_id: "quote", fare_currency_code: "USD", estimated_fare_minor: 1000, final_fare_minor: 1000 },
  trip_price_quotes: { fare_amount_minor: 1000, currency_code: "USD", pricing_snapshot: { baseFareMinor: 1000, minimumFareMinor: 0, perMileMinor: 0, perMinuteMinor: 0 },
    route_distance_meters: 1000, route_duration_seconds: 100, fare_policy: "guaranteed_upfront" },
  rider_payment_attempts: [{ payment_attempt_id: "payment", amount_minor: 800, currency_code: "USD", status: "paid", paid_at: "2026-10-10T12:00:00Z", created_at: "2026-10-10T12:00:00Z", provider: "stripe", provider_payment_intent_id: "PRIVATE-intent" }],
  rider_payment_refunds: [], rider_wallet_quote_allocations: { amount_minor: 200, currency_code: "USD", status: "applied", restored_at: null },
  trip_fare_settlements: [], rider_payment_disputes: [], trip_fare_reconciliations: null };
  mocks.rpc.mockResolvedValue({ data: { tenant: { tenantId, displayName: "TEST company" }, profile: { riderProfileId: riderId, status: "active" } }, error: null });
  mocks.from.mockImplementation((table: string) => {
    filters[table] = {};
    const result = () => ({ data: rows[table], error: failed === table ? { message: "PRIVATE database error" } : null });
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters[table]![key] = value; return query; },
      order: () => query, single: () => Promise.resolve(result()), maybeSingle: () => Promise.resolve(result()),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve) };
    return query;
  });
  mocks.authenticated.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
  mocks.stripe.mockReturnValue({ paymentIntents: { retrieve: mocks.retrieve } });
  mocks.retrieve.mockResolvedValue({ latest_charge: { receipt_url: "https://pay.stripe.com/receipts/test", payment_method_details: { card: { brand: "visa", last4: "4242" }, type: "card" } } });
});
describe("owned trip receipt endpoint", () => {
  it("requires authentication and a valid trip before reads", async () => {
    expect((await GET(request(false))).status).toBe(401);
    expect((await GET(request(true, "invalid"))).status).toBe(400);
    expect(mocks.authenticated).not.toHaveBeenCalled();
  });
  it("returns split funding, safe processor details and private no-store responses", async () => {
    const response = await GET(request()); const json: unknown = await response.json();
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(json).toMatchObject({ fareMinor: 1000, wallet: { amountMinor: 200 }, payments: [{ amountMinor: 800, method: "VISA ending in 4242" }] });
    expect(JSON.stringify(json)).not.toContain("PRIVATE");
    for (const table of Object.keys(filters)) expect(filters[table]?.tenant_id).toBe(tenantId);
    expect(filters.dispatch_bookings?.rider_profile_id).toBe(riderId);
    expect(filters.trip_price_quotes).toMatchObject({ rider_profile_id: riderId, booking_id: bookingId });
    expect(mocks.authenticated).toHaveBeenCalledWith("TEST-token");
  });
  it.each(["other Rider", "other tenant", "active trip", "unavailable booking", "inactive profile"])("denies %s without processor access", async (scenario) => {
    if (scenario === "inactive profile") mocks.rpc.mockResolvedValue({ data: { tenant: { tenantId }, profile: { riderProfileId: riderId, status: "suspended" } }, error: null });
    else if (scenario === "unavailable booking") failed = "dispatch_bookings";
    else rows.dispatch_bookings = { ...(rows.dispatch_bookings as object), ...(scenario === "other Rider" ? { rider_profile_id: "other" }
      : scenario === "other tenant" ? { tenant_id: "other" } : { status: "in_progress" }) };
    const response = await GET(request());
    expect(response.status).toBe(400); expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("PRIVATE");
  });
  it("preserves database activity during Stripe outage without leaking errors", async () => {
    mocks.retrieve.mockRejectedValue(new Error("PRIVATE key error"));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ payments: [{ method: "Payment method unavailable", receiptUrl: null }] });
  });
  it("does not call Stripe for wallet-only or unpaid trips", async () => {
    rows.rider_payment_attempts = [];
    expect((await GET(request())).status).toBe(200); expect(mocks.stripe).not.toHaveBeenCalled();
    rows.rider_payment_attempts = [{ amount_minor: 800, currency_code: "USD", status: "pending", provider: "stripe", provider_payment_intent_id: "PRIVATE" }];
    expect((await GET(request())).status).toBe(200); expect(mocks.stripe).not.toHaveBeenCalled();
  });
  it("keeps refunds, restored credit, disputes and a balance due separate from fare", async () => {
    rows.rider_payment_refunds = [{ amount_minor: 800, currency_code: "USD", status: "pending", refunded_at: null }];
    rows.rider_wallet_quote_allocations = { amount_minor: 200, currency_code: "USD", status: "restored", restored_at: "2026-10-10T14:00:00Z" };
    rows.trip_fare_settlements = [{ amount_minor: 150, currency_code: "USD", status: "balance_due", direction: "charge" }];
    rows.rider_payment_disputes = [{ amount_minor: 800, currency_code: "USD", status: "needs_response" }];
    rows.trip_fare_reconciliations = { calculated_fare_minor: 1150, currency_code: "USD", status: "approved" };
    expect(await (await GET(request())).json()).toMatchObject({ fareMinor: 1000, refunds: [{ status: "pending" }], wallet: { status: "restored" },
      settlements: [{ status: "balance_due" }], review: { contractFareMinor: 1150 }, disputes: [{ status: "needs_response" }] });
  });
  it("never silently omits failed financial reads", async () => {
    failed = "rider_payment_refunds";
    const response = await GET(request()); expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain("PRIVATE"); expect(mocks.stripe).not.toHaveBeenCalled();
  });
  it("supports legacy unpriced trips without fabricated zero charges or itemization", async () => {
    rows.dispatch_bookings = { ...(rows.dispatch_bookings as object), price_quote_id: null, fare_currency_code: null, estimated_fare_minor: null, final_fare_minor: null };
    rows.rider_payment_attempts = []; rows.rider_wallet_quote_allocations = null;
    expect(await (await GET(request())).json()).toMatchObject({ fareMinor: null, quotedFareMinor: null, breakdown: [], payments: [], wallet: null });
  });
});
