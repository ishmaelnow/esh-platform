import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), from: vi.fn(), rpc: vi.fn(), serviceRpc: vi.fn(), checkout: vi.fn() }));
vi.mock("@esh-platform/supabase", () => ({ createAuthenticatedSupabaseClient: mocks.authenticated,
  createServiceSupabaseClient: () => ({ rpc: mocks.serviceRpc }) }));
vi.mock("@esh-platform/stripe", () => ({ createStripeClient: () => ({ checkout: { sessions: { create: mocks.checkout } } }) }));
import { GET, POST } from "./route";

const quoteId = "11111111-1111-4111-8111-111111111111", tenantId = "22222222-2222-4222-8222-222222222222";
const riderId = "33333333-3333-4333-8333-333333333333", bookingId = "44444444-4444-4444-8444-444444444444";
const occurrenceId = "55555555-5555-4555-8555-555555555555";
const quote = { quote_id: quoteId, tenant_id: tenantId, rider_profile_id: riderId, service_area_id: "area",
  fare_amount_minor: 1000, currency_code: "USD", pickup_address: "Fixture pickup", destination_address: "Fixture destination",
  status: "quoted", expires_at: new Date(Date.now() + 900000).toISOString(), booking_id: bookingId };
function request(method = "GET", overrides: Record<string, unknown> = {}, query = "", authenticated = true) {
  return new Request(`https://rider.test/api/payments/checkout?quote=${quoteId}&tenantSlug=provider${query}`, {
    method, headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: "Bearer fixture" } : {}) },
    ...(method === "POST" ? { body: JSON.stringify({ quoteId, tenantSlug: "provider", ...overrides }) } : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation((table: string) => {
    const data = table === "trip_price_quotes" ? quote : table === "rider_payment_attempts" ? { status: "paid" }
      : table === "rider_wallet_quote_allocations" ? null
      : table === "rider_booking_series_occurrences" ? { rider_booking_series_id: "series", status: "awaiting_payment", scheduled_pickup_at: new Date(Date.now()+7200000).toISOString() }
      : { service_area_id: quote.service_area_id, pickup_address: quote.pickup_address, destination_address: quote.destination_address, status: "active" };
    const query = { select: () => query, eq: () => query, single: () => Promise.resolve({ data, error: null }), maybeSingle: () => Promise.resolve({ data, error: null }) };
    return query;
  });
  mocks.rpc.mockImplementation((name: string) => Promise.resolve({ error: null, data: name === "my_rider_portal"
    ? { tenant: { tenantId }, profile: { riderProfileId: riderId } } : name === "my_rider_has_active_booking" ? false : name === "my_rider_scheduling"
      ? { settings: { minimumNoticeMinutes: 60 } } : bookingId }));
  mocks.authenticated.mockReturnValue({ from: mocks.from, rpc: mocks.rpc });
  mocks.serviceRpc.mockImplementation((name: string) => Promise.resolve({ error: null, data: name === "prepare_rider_wallet_checkout_internal"
    ? { walletAmountMinor: 0, cardAmountMinor: 1000 } : null }));
  mocks.checkout.mockResolvedValue({ id: "checkout-fixture", url: "https://checkout.stripe.test/fixture" });
});

describe("checkout returns and owned status", () => {
  it("blocks an active ride before reserving wallet credit or creating Stripe checkout", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const response = await POST(request("POST"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "Finish or cancel your current ride before requesting another." });
    expect(mocks.serviceRpc).not.toHaveBeenCalled(); expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("fails closed when current-ride verification is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "fixture offline" } });
    expect((await POST(request("POST"))).status).toBe(400);
    expect(mocks.serviceRpc).not.toHaveBeenCalled(); expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("keeps future scheduled checkout available while a ride is active", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect((await POST(request("POST", { scheduledPickupAt: new Date(Date.now()+7200000).toISOString() }))).status).toBe(200);
    expect(mocks.checkout).toHaveBeenCalledTimes(1);
  });
  it("rejects bogus scheduled times before they can bypass the active-ride check", async () => {
    expect((await POST(request("POST", { scheduledPickupAt: "bogus" }))).status).toBe(400);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("requires authentication before owned reads or checkout", async () => {
    expect((await GET(request("GET", {}, "", false))).status).toBe(400);
    expect((await POST(request("POST", {}, "", false))).status).toBe(400);
    expect(mocks.authenticated).not.toHaveBeenCalled();
  });
  it("returns existing booking ID under quote without creating another booking", async () => {
    const result = await GET(request()); expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ paymentStatus: "paid", quote: { bookingId, quoteId } });
    expect(mocks.checkout).not.toHaveBeenCalled(); expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });
  it("rejects a provider/profile mismatch even if a quote read succeeds", async () => {
    mocks.rpc.mockResolvedValue({ data: { tenant: { tenantId: "other" }, profile: { riderProfileId: riderId } }, error: null });
    expect((await GET(request())).status).toBe(400);
    mocks.rpc.mockResolvedValue({ data: { tenant: { tenantId }, profile: { riderProfileId: "other" } }, error: null });
    expect((await GET(request())).status).toBe(400);
  });
  it("keeps browser callbacks on HTTPS home and ignores supplied redirect URLs", async () => {
    expect((await POST(request("POST", { returnUrl: "https://evil.example" }))).status).toBe(200);
    expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({
      success_url: `https://rider.test/?tenant=provider&payment=success&quote=${quoteId}`,
      cancel_url: `https://rider.test/?tenant=provider&payment=cancelled&quote=${quoteId}`,
    }), { idempotencyKey: `rider_quote_${quoteId}` });
  });
  it("uses the dedicated native handoff without treating a URL return as paid", async () => {
    expect((await POST(request("POST", { nativeReturn: true }))).status).toBe(200);
    expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({
      success_url: `https://rider.test/payments/return?tenant=provider&payment=success&quote=${quoteId}`,
      cancel_url: `https://rider.test/payments/return?tenant=provider&payment=cancelled&quote=${quoteId}`,
    }), expect.any(Object));
  });
  it("preserves recurring occurrence and existing idempotency through native checkout", async () => {
    expect((await POST(request("POST", { nativeReturn: true, occurrenceId }))).status).toBe(200);
    expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({
      success_url: `https://rider.test/payments/return?tenant=provider&payment=success&quote=${quoteId}&occurrence=${occurrenceId}`,
    }), { idempotencyKey: `rider_quote_${quoteId}` });
  });
  it("does not change wallet-only booking or open Stripe", async () => {
    mocks.serviceRpc.mockResolvedValue({ error: null, data: { walletAmountMinor: 1000, cardAmountMinor: 0 } });
    const result = await POST(request("POST", { nativeReturn: true }));
    expect(await result.json()).toMatchObject({ walletOnly: true, booked: true, bookingId });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
});
