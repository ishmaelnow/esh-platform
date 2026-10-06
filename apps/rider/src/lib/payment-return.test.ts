import { describe, expect, it } from "vitest";
import { checkoutReturnUrls, paymentReturnPath, readRiderPaymentReturn } from "./payment-return";
const origin = "https://rider.eshapp.com";
const quote = "11111111-1111-4111-8111-111111111111";
const occurrence = "22222222-2222-4222-8222-222222222222";
const query = `?tenant=provider&payment=success&quote=${quote}`;

describe("Rider payment return boundary", () => {
  it("keeps browser checkout on its original HTTPS home return", () => {
    const result = checkoutReturnUrls(origin, "provider", quote, undefined, false);
    expect(result.successUrl).toBe(`${origin}/${query}`);
    expect(new URL(result.cancelUrl).searchParams.get("payment")).toBe("cancelled");
    expect(new URL(result.cancelUrl).pathname).toBe("/");
  });
  it("gives native ordinary and recurring payments a dedicated HTTPS handoff", () => {
    const result = checkoutReturnUrls(origin, "provider", quote, occurrence, true);
    expect(new URL(result.successUrl).pathname).toBe("/payments/return");
    expect(new URL(result.successUrl).searchParams.get("occurrence")).toBe(occurrence);
    expect(new URL(result.cancelUrl).searchParams.get("quote")).toBe(quote);
  });
  it.each([`${origin}/${query}`, `${origin}/payments/return${query}`, `com.esh.rider://auth/callback${query}`])("normalizes trusted callback %s without changing origin", (url) => {
    const result = readRiderPaymentReturn(url, origin);
    expect(result).toEqual({ tenant: "provider", payment: "success", quote, occurrence: null });
    expect(paymentReturnPath(result!)).toBe(`/${query}`);
  });
  it("accepts cancellation without claiming payment or requiring a quote", () => {
    expect(readRiderPaymentReturn(`${origin}/?tenant=provider&payment=cancelled`, origin)).toEqual({ tenant: "provider", payment: "cancelled", quote: null, occurrence: null });
  });
  it.each([`https://driver.eshapp.com/${query}`, `https://evil.example/${query}`,
    `com.esh.driver://auth/callback${query}`, `com.esh.rider://other/callback${query}`,
    `${origin}/auth/callback${query}`, `${origin}/${query}#access_token=forbidden`,
    `${origin}/?tenant=provider&payment=success`, `${origin}/?tenant=provider&payment=paid&quote=${quote}`,
    `${origin}/?tenant=provider&payment=success&quote=not-a-uuid`,
    `${origin}/${query}&occurrence=invalid`, `${origin}/?tenant=../other&payment=cancelled`, "broken"]) (
    "rejects untrusted or incomplete return %s", (url) => { expect(readRiderPaymentReturn(url, origin)).toBeNull(); });
});
